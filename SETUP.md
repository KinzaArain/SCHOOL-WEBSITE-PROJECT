# Setup Guide — WhatsApp → Website Automation

This connects three pieces:

```
Admin's WhatsApp  --->  Meta Cloud API  --->  Vercel webhook  --->  Google Sheet + Drive  --->  Website reads it live
   (types a notice        (Meta's free           (api/whatsapp-        (your free                (index.html
    or sends the           WhatsApp API)          webhook.js)           storage)                   fetches it,
    challan PDF)                                                                                    searches by name)
```

Nothing here needs a paid server. Meta's Cloud API, Google Sheets/Apps Script/Drive, and Vercel are all free at this scale.

---

## Part 1 — Google Sheet + Drive (the storage)

1. Create a new Google Sheet. Name it `Crescent Heights Data`.
2. Rename **Sheet1** to `Notices`. Row 1 (header): `Timestamp | Tag | Title | Body`
   (That's the only sheet tab needed — the fee challan PDF is stored as a file in Google Drive, not in a spreadsheet, since it needs to keep its original PDF text/layout for the search feature to work.)
3. Menu: **Extensions > Apps Script**. Delete the placeholder code, paste in the contents of `apps-script/Code.gs` from this project.
4. Left sidebar **Project Settings** (gear icon) > **Script Properties** > **Add script property**:
   - Name: `SHARED_SECRET`
   - Value: any long random string (e.g. generate one at randomkeygen.com). Save it somewhere — you'll paste it into Vercel too.
5. Top right **Deploy > New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**, then **Authorize access**. You'll see it ask for both Sheets and **Drive** permission this time — that's expected, since the script now saves the challan PDF to your Drive.
6. Copy the **Web app URL** it gives you — looks like `https://script.google.com/macros/s/AKfycb.../exec`. This is your `SHEETS_WEBAPP_URL`.

> Whenever you edit the script later, you must go to **Manage deployments > Edit > New version** for changes to go live — saving the script alone isn't enough.

---

## Part 2 — Meta WhatsApp Cloud API

1. Go to [developers.facebook.com](https://developers.facebook.com) and create a Meta for Developers account if you don't have one (uses a regular Facebook login).
2. **My Apps > Create App > Business** type. Name it e.g. "Crescent Heights Notices".
3. In the app dashboard, find **WhatsApp** in the products list and click **Set up**.
4. You'll land on **WhatsApp > API Setup**. Meta gives you, for free, immediately:
   - A **test phone number** you can use right away (no verification needed)
   - Up to 5 **recipient test numbers** you can add to message with, for testing before going live
   - A **temporary access token** (valid 24 hours — fine for testing, you'll generate a permanent one later via a System User in Business Settings)
   - Your **Phone Number ID** (a long number, not the phone number itself)

   **Important nuance:** since you said you already have a dedicated number ready — you can either test first with Meta's free test number (recommended, zero setup), or register your real number directly. A number can only be registered to the Cloud API if it is **not currently active in the regular WhatsApp or WhatsApp Business consumer app** — you'll need to remove it from those first, then add it under **API Setup > Add phone number**. Business verification (submitting your school's business documents) is only required once you want to message people beyond the 5 test recipients / lift the free-tier sending limits — you can build and test everything below before doing that step.

5. Still on **API Setup**, scroll to **Configuration > Webhook**:
   - Callback URL: `https://<your-vercel-project>.vercel.app/api/whatsapp-webhook` (you'll have this after Part 3)
   - Verify token: any string you make up — this is your `META_VERIFY_TOKEN`
   - Click **Verify and save** (Vercel must already be deployed for this to succeed — do Part 3 first, then come back here)
   - Subscribe to the **messages** field.

6. Note down for Vercel:
   - `META_ACCESS_TOKEN` — the access token shown on the API Setup page
   - `META_PHONE_NUMBER_ID` — shown on the same page
   - `ADMIN_WHATSAPP_NUMBER` — the school admin's WhatsApp number, digits only with country code, e.g. `923001234567` for a Pakistani number (no +, no spaces, no leading 0)

---

## Part 3 — Vercel deployment

1. Push this whole folder (`index.html`, `api/`, `apps-script/`, `package.json`) to the same GitHub repo you already use, via GitHub Desktop as before.
2. In Vercel, redeploy the project (or import fresh if it's a new repo).
3. **Project > Settings > Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `META_VERIFY_TOKEN` | the string you invented in Part 2 |
   | `META_ACCESS_TOKEN` | from Meta API Setup page |
   | `META_PHONE_NUMBER_ID` | from Meta API Setup page |
   | `SHEETS_WEBAPP_URL` | the Apps Script Web App URL from Part 1 |
   | `SHEETS_SHARED_SECRET` | the same `SHARED_SECRET` value you set in Apps Script |
   | `ADMIN_WHATSAPP_NUMBER` | admin's WhatsApp number, digits only |

4. Redeploy so the environment variables take effect.
5. Go back to Meta's webhook config (Part 2, step 5) and verify it now — it will call your live `/api/whatsapp-webhook` URL.

---

## Part 4 — Connect the front-end

Open `index.html`, find this line near the fee voucher script section:

```js
const SHEETS_WEBAPP_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
```

Replace the placeholder with your real Apps Script Web App URL from Part 1. Commit and push — the site will now show live notices, and the name search will look inside the real uploaded challan PDF instead of the generated demo one. If this URL is ever unreachable, the site quietly falls back to the demo data instead of breaking.

---

## What the admin actually sends

**A notice**, as a normal WhatsApp text message to the school's Cloud API number:

```
NOTICE | Urgent | Early Dismissal This Friday | All campuses close at 12:30 PM this Friday for staff training.
```

Tags that get their own colour on the site: `Urgent`, `Circular`, `Event`, `Holiday`, `Academic`.

**The fee challan sheet**, as a single PDF document upload containing all students (one long list/table is fine — the website searches by name, not by page), with the caption `CHALLANS`.

**This must be a real digital PDF with selectable text** — exported directly from Excel, Word, Google Sheets, or whatever accounting software the school uses. A photo or scan of a printed page will not work, because the search relies on the PDF's text layer; there's no text to find in a scanned image. If the school's records only exist on paper, that needs a different (OCR) approach — flag it and we can look at that separately.

Every upload **replaces** the previous challan sheet entirely — this matches "upload the monthly file," rather than appending to old data.

The admin gets an automatic WhatsApp reply confirming what happened ("✅ Notice posted" / "✅ Challan sheet updated" / an error message if something didn't work), so they always know it worked without needing to check the website.

**On the website**, a parent types the child's full name (e.g. `Kinza Shabbir Arain`) and clicks Find Challan. The site loads the PDF, searches every page's text for that name, shows the matching page as an image preview, and offers a one-click download of just that page as its own small PDF. If a name doesn't match exactly (extra spaces, a nickname, a typo), it won't be found — worth telling the school office to keep spelling consistent between records and what they tell parents.

---

## Security notes

- Only messages from `ADMIN_WHATSAPP_NUMBER` are processed — anyone else messaging the school's Cloud API number is ignored for data purposes (you can still reply to general parent messages manually from the same number).
- The Apps Script only accepts writes with the correct `SHARED_SECRET` — without it, requests are rejected.
- Nothing here requires putting real credentials into this chat or into any public file — they only ever live in Vercel's environment variables and the Apps Script's Script Properties, both private to your accounts.
