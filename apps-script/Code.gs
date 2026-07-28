/**
 * Crescent Heights Academy — backend.
 * Two jobs: (1) store/serve notices, (2) store/serve the master fee-challan PDF
 * that admin uploads, so the website can search it by student name.
 *
 * SETUP (one time):
 * 1. Create a new Google Sheet named e.g. "Crescent Heights Data".
 * 2. Rename the first tab to "Notices". Add header row: Timestamp | Tag | Title | Body
 *    (No other tabs needed — the fee challan PDF is stored in Google Drive, not a sheet.)
 * 3. Extensions > Apps Script. Delete any starter code and paste this whole file in.
 * 4. Project Settings (gear icon) > Script Properties > add a property:
 *      Name: SHARED_SECRET   Value: <make up a long random string, save it, you'll need it again>
 * 5. Deploy > New deployment > type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    Click Deploy, authorize when prompted (it will ask for Drive access too — that's
 *    expected, this script saves the challan PDF to your Drive). Copy the Web App URL.
 *    That's your SHEETS_WEBAPP_URL — put it in Vercel's environment variables and in
 *    index.html where indicated.
 * 6. Every time you edit this script, you must create a NEW deployment (or "Manage
 *    deployments" > edit > new version) for changes to take effect on the live URL.
 */

const NOTICES_SHEET = 'Notices';
const MAX_NOTICES_RETURNED = 20;

function doGet(e) {
  const resource = e && e.parameter && e.parameter.resource;
  if (resource === 'challanPdf') {
    return jsonOut_(getChallanPdfPayload_());
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const notices = readNotices_(ss);
  return jsonOut_({ notices: notices });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
    if (!secret || body.secret !== secret) {
      return jsonOut_({ ok: false, error: 'Unauthorized' });
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (body.action === 'addNotice') {
      addNotice_(ss, body.tag, body.title, body.body);
      return jsonOut_({ ok: true, action: 'addNotice' });
    }

    if (body.action === 'uploadChallanPdf') {
      const fileId = uploadChallanPdf_(body.pdfBase64, body.filename);
      return jsonOut_({ ok: true, action: 'uploadChallanPdf', fileId: fileId });
    }

    return jsonOut_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

/* ---------- Notices ---------- */

function addNotice_(ss, tag, title, body) {
  const sheet = ss.getSheetByName(NOTICES_SHEET);
  sheet.appendRow([new Date(), tag || 'Circular', title || '(untitled)', body || '']);
}

function readNotices_(ss) {
  const sheet = ss.getSheetByName(NOTICES_SHEET);
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1).filter(r => r[2]); // skip header, skip blank rows
  rows.reverse(); // newest first
  return rows.slice(0, MAX_NOTICES_RETURNED).map(r => ({
    timestamp: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
    tag: r[1],
    title: r[2],
    body: r[3]
  }));
}

/* ---------- Fee Challan PDF (stored in Drive, served as base64) ---------- */

/** Saves a new challan PDF to Drive, replacing the previous one, and remembers its file ID. */
function uploadChallanPdf_(base64, filename) {
  const props = PropertiesService.getScriptProperties();
  const oldId = props.getProperty('CHALLAN_PDF_FILE_ID');
  if (oldId) {
    try { DriveApp.getFileById(oldId).setTrashed(true); } catch (err) { /* already gone, ignore */ }
  }
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'application/pdf', filename || 'challans.pdf');
  const file = DriveApp.createFile(blob);
  props.setProperty('CHALLAN_PDF_FILE_ID', file.getId());
  props.setProperty('CHALLAN_PDF_UPLOADED_AT', new Date().toISOString());
  return file.getId();
}

/** Reads the stored challan PDF back out as base64, for the website to search. */
function getChallanPdfPayload_() {
  const props = PropertiesService.getScriptProperties();
  const fileId = props.getProperty('CHALLAN_PDF_FILE_ID');
  if (!fileId) return { challanPdfBase64: null, updatedAt: null };
  try {
    const file = DriveApp.getFileById(fileId);
    return {
      challanPdfBase64: Utilities.base64Encode(file.getBlob().getBytes()),
      updatedAt: props.getProperty('CHALLAN_PDF_UPLOADED_AT') || null
    };
  } catch (err) {
    return { challanPdfBase64: null, updatedAt: null, error: String(err) };
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
