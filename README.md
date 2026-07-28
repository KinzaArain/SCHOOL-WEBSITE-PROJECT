# Crescent Heights Academy — School Website Demo

A single-page demo website built for a fictional K-12 school ("Crescent Heights Academy"), created as a portfolio/pitch piece to show prospective school clients what a custom-built site could look like.

**Live demo:** _add your Vercel URL here after deploying_

## What's included

- Responsive one-page site: hero, about, academic pathway timeline, notice board, campus life gallery, facilities grid, testimonials, news, admissions form, footer
- Free-license stock photography (Pexels, credited below) plus original hand-drawn SVG illustrations for the crest and campus building
- **Fee Challan search by student name**: a parent types their child's full name in the top bar; the site searches inside the school's master fee-challan PDF (entirely in the parent's browser, via pdf.js), shows the matching page as a preview, and lets them download just that page as its own PDF (via pdf-lib) — no data ever leaves their browser for the search itself
- **Notice Board**: styled notice cards with tags (Urgent/Circular/Event/Holiday/Academic)
- Floating WhatsApp contact button (wired to a real wa.me link — swap in the school's number)
- Scroll-reveal animations, animated stat counters, mobile nav
- Front-end-only admissions inquiry form (no backend — for demo purposes)

### Demo data
Until the backend is connected, the fee challan search runs against a small demo PDF **generated on the fly** in the browser (via jsPDF) — so the feature works immediately, no setup required. Try searching: `Kinza Shabbir Arain`, `Hamza Sheikh`, or `Zoya Farooq`.

### Important limitation — read before relying on this in production
The name search only works if the admin's uploaded PDF has **real, selectable text** — i.e. it was exported from Excel, Word, or accounting software. It will **not** work on a scanned or photographed paper document, because there's no text layer to search. If the school's fee sheet only exists on paper, this needs an OCR step first (a different, heavier feature — ask if you need this).

### Photo credits (free to use under the Pexels License, https://www.pexels.com/license/)
- Ong Béo Studio - BH ĐN — classroom & campus photos
- gsregvrd — playground photo
- Ron Lach — library photo
- MART PRODUCTION — science lab photo

### Backend — WhatsApp to website, automatically
See `SETUP.md` for the full step-by-step guide. Summary:

- **Backend:** `api/whatsapp-webhook.js` — a Vercel serverless function that receives WhatsApp messages via Meta's Cloud API
- **Storage:** `apps-script/Code.gs` — a Google Sheet + Apps Script Web App. Notices are stored as sheet rows; the fee challan PDF is stored in Google Drive and served back as base64 through the same Apps Script endpoint (this avoids Google Drive's CORS restrictions, which would otherwise block the browser from fetching it directly)
- **Front-end:** `index.html` fetches live notices and the live challan PDF from the Apps Script URL if you set `SHEETS_WEBAPP_URL`, and falls back to demo data automatically if that's not configured yet, so the site never breaks mid-setup

Admin sends a notice as a WhatsApp text, or the whole fee-challan PDF as a WhatsApp document (caption `CHALLANS`) → it's live on the website within seconds. No login, no CMS, no manual data entry.

## Tech

Plain HTML, CSS, and vanilla JavaScript. No build step. Fonts from Google Fonts (Fraunces, Work Sans, IBM Plex Mono). PDF handling via pdf.js (read/search/render) and pdf-lib (extract a single page for download), both loaded from CDN.

## Project structure

```
crescent-heights-academy/
  index.html             the website (static, deploys as-is)
  api/
    whatsapp-webhook.js  Vercel serverless function — receives WhatsApp messages
  apps-script/
    Code.gs               paste into Google Sheets Extensions > Apps Script
  package.json
  README.md               this file
  SETUP.md                 full step-by-step backend setup guide
```

## Running locally

Just open `index.html` in a browser — no server or install required.

## Deployment

Deployed as a static site (plus the `/api` serverless function) on Vercel, connected to this GitHub repository.

---
Site design & development by Kinzah.
