/**
 * Crescent Heights Academy — WhatsApp webhook (Vercel serverless function).
 *
 * Deploy path: /api/whatsapp-webhook  (put this file at api/whatsapp-webhook.js
 * in a Vercel project and it becomes that route automatically — no extra config).
 *
 * Required environment variables (set in Vercel: Project > Settings > Environment Variables):
 *   META_VERIFY_TOKEN      any string you make up — used only during webhook setup
 *   META_ACCESS_TOKEN      from Meta for Developers > your app > WhatsApp > API Setup
 *   META_PHONE_NUMBER_ID   from the same page
 *   SHEETS_WEBAPP_URL      the Apps Script Web App URL (see /apps-script/Code.gs)
 *   SHEETS_SHARED_SECRET   must match the SHARED_SECRET script property in Apps Script
 *   ADMIN_WHATSAPP_NUMBER  the school admin's WhatsApp number, digits only, with country
 *                          code, e.g. 923001234567 — only messages from this number are
 *                          processed, so nobody else can post fake notices or replace
 *                          the fee challan sheet.
 *
 * What the admin types/sends on WhatsApp:
 *   Notice:   NOTICE | Urgent | Early Dismissal This Friday | All campuses close at 12:30 PM.
 *   Challans: send the master fee-challan PDF (all students, one document) as a WhatsApp
 *             document attachment, with the caption "CHALLANS". It must be a real digital
 *             PDF with selectable text (exported from Excel/accounting software) — a scanned
 *             photo of paper won't work, since the website searches the PDF's text layer.
 *             Every upload REPLACES the previous challan sheet.
 */

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const SHEETS_WEBAPP_URL = process.env.SHEETS_WEBAPP_URL;
const SHEETS_SECRET = process.env.SHEETS_SHARED_SECRET;
const ADMIN_NUMBER = (process.env.ADMIN_WHATSAPP_NUMBER || '').replace(/\D/g, '');
const GRAPH_VERSION = 'v26.0';
const MAX_PDF_MB = 15; // soft warning threshold; Apps Script + base64 overhead get uncomfortable well beyond this

module.exports = async (req, res) => {
  if (req.method === 'GET') return handleVerification(req, res);
  if (req.method === 'POST') return handleIncoming(req, res);
  res.status(405).send('Method Not Allowed');
};

function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Forbidden');
}

async function handleIncoming(req, res) {
  // Reply to Meta immediately — it retries aggressively if it doesn't get a fast 200.
  res.status(200).send('EVENT_RECEIVED');

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    if (!message) return; // delivery/read receipts etc. — nothing to do

    const fromNumber = (message.from || '').replace(/\D/g, '');
    if (ADMIN_NUMBER && fromNumber !== ADMIN_NUMBER) {
      console.log('Ignored message from non-admin number:', fromNumber);
      return;
    }

    if (message.type === 'text') {
      await handleTextMessage(message.text.body, fromNumber);
    } else if (message.type === 'document') {
      await handleDocumentMessage(message.document, fromNumber);
    } else {
      await sendWhatsAppText(fromNumber, "I can only process text notices, or a PDF document (caption CHALLANS) for the fee challan sheet.");
    }
  } catch (err) {
    console.error('Webhook handling error:', err);
  }
}

async function handleTextMessage(text, fromNumber) {
  if (!text || !SHEETS_WEBAPP_URL) return;

  console.log(`Forwarding text notice to Google Sheet: "${text}"`);

  try {
    const response = await fetch(SHEETS_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: SHEETS_SECRET,
        action: 'addNotice',
        tag: 'General',
        title: 'WhatsApp Notice',
        body: text,
        sender: fromNumber,
      }),
    });

    console.log("Google Apps Script Status:", response.status);

    if (typeof sendWhatsAppText === 'function') {
      await sendWhatsAppText(fromNumber, "Notice posted successfully!");
    }
  } catch (error) {
    console.error("Error forwarding text to Google Sheet:", error);
  }
}
async function handleDocumentMessage(doc, fromNumber) {
  const caption = (doc.caption || '').toUpperCase();
  const isPdf = /pdf/i.test(doc.mime_type || '') || /\.pdf$/i.test(doc.filename || '');

  if (!isPdf) {
    await sendWhatsAppText(fromNumber, "That doesn't look like a PDF. Export the fee challan sheet as a .pdf and resend with caption CHALLANS.");
    return;
  }
  if (!caption.includes('CHALLAN')) {
    await sendWhatsAppText(fromNumber, 'Got your PDF — resend it with the caption "CHALLANS" so I know to publish it as the fee challan sheet.');
    return;
  }

  try {
    const base64 = await downloadMediaBase64(doc.id);
    const approxMb = (base64.length * 0.75) / (1024 * 1024);
    if (approxMb > MAX_PDF_MB) {
      await sendWhatsAppText(fromNumber, `Heads up — that file is about ${approxMb.toFixed(1)}MB, which is large for this setup. Trying anyway, but if it fails, export a smaller/compressed PDF.`);
    }
    const result = await postToSheet({ action: 'uploadChallanPdf', pdfBase64: base64, filename: doc.filename || 'challans.pdf' });
    await sendWhatsAppText(fromNumber, result.ok
      ? '✅ Challan sheet updated. Parents can now search it by name on the website.'
      : `⚠️ Couldn't publish that PDF: ${result.error || 'unknown error'}`);
  } catch (err) {
    await sendWhatsAppText(fromNumber, `⚠️ Couldn't download/process that file: ${String(err)}`);
  }
}

/** Downloads WhatsApp media and returns it as a base64 string (works for any binary type). */
async function downloadMediaBase64(mediaId) {
  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
  });
  const meta = await metaRes.json();
  if (!meta.url) throw new Error('Could not resolve media URL from Meta.');
  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
  const arrayBuf = await fileRes.arrayBuffer();
  return Buffer.from(arrayBuf).toString('base64');
}

async function postToSheet(payload) {
  const res = await fetch(SHEETS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: SHEETS_SECRET, ...payload })
  });
  return await res.json();
}

async function sendWhatsAppText(toNumber, body) {
  if (!toNumber) return;
  await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: toNumber, type: 'text', text: { body } })
  });
}
