# WardMark PayFast Backend

This is the only piece of the site that needs a real server (not static hosting).
It exists purely to keep your `PAYFAST_SECURED_KEY` secret and to sign the
hosted-checkout request — that signing step can't safely happen in the
browser.

## What it does

1. The pricing page sends order details (plan, amount, name, email, mobile) to
   `POST /api/payfast/initiate`.
2. This server fetches a short-lived access token from PayFast using your
   `MERCHANT_ID` + `SECURED_KEY`.
3. It signs the transaction (`md5(merchant_id:merchant_name:amount:order_id)`)
   and returns the payload + PayFast's checkout URL.
4. The browser auto-submits a form with that payload straight to PayFast's
   hosted page — your customer enters card/account details on PayFast's own
   page, not yours. This keeps your PCI-DSS scope minimal.

## Setup

```bash
cd server
npm install
cp .env.example .env
```

Then open `.env` and fill in, from your PayFast merchant dashboard
(Developer Settings):

- `PAYFAST_MERCHANT_ID`
- `PAYFAST_SECURED_KEY`
- `PAYFAST_MERCHANT_NAME`

**Before going live**, confirm these three things directly with PayFast —
they're filled in with best-effort placeholders based on public
documentation and may not match your account exactly:

- The real API base URL for `/token` (sandbox and production differ)
- The real hosted-checkout POST URL
- The exact signature algorithm/field order they expect for your account

## Run locally

```bash
npm start
```

The server listens on `http://localhost:4242` by default. Update
`ALLOWED_ORIGIN` in `.env` to match wherever you're serving the static site
from (e.g. `http://localhost:5500` while testing, your real domain in
production).

## Deploying

This needs an actual Node host — it will **not** run on GitHub Pages or any
static file host. Reasonable low-effort options:

- Render.com (free tier web service)
- Railway.app
- A small VPS (DigitalOcean, Linode, etc.) behind HTTPS/nginx

Once deployed, update the `fetch()` URL in `script.js` on the static site
(currently `http://localhost:4242`) to point at your deployed backend's
HTTPS URL.

## Security notes

- Never commit your real `.env` file.
- Always run this behind HTTPS in production.
- Don't log full request bodies — they contain customer email/phone numbers.
- This flow never receives card numbers or CVVs; those are entered on
  PayFast's own hosted page. Keep it that way — collecting card data directly
  on your own server pulls you into full PCI-DSS scope.
