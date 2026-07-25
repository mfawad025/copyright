/**
 * WardMark — PayFast hosted-checkout backend
 * ---------------------------------------------
 * This is a small, standalone server. It exists for ONE reason: your
 * PAYFAST_SECURED_KEY must never be exposed in browser JavaScript. Everything
 * that needs the secured key happens here; the static site only ever talks
 * to this server over HTTPS.
 *
 * Flow implemented (PayFast "Hosted Checkout"):
 *   1. Browser sends order details (plan, amount, name, email, mobile) to
 *      POST /api/payfast/initiate
 *   2. This server calls PayFast's /token endpoint with MERCHANT_ID +
 *      SECURED_KEY to get a short-lived access token.
 *   3. This server builds the hosted-checkout payload and signs it with the
 *      MD5 signature PayFast requires: md5(merchant_id:merchant_name:amount:order_id)
 *   4. The payload + PayFast's checkout URL are returned to the browser.
 *   5. The browser auto-submits a hidden form with that payload to PayFast,
 *      redirecting the shopper to PayFast's own hosted page to enter card /
 *      wallet details. Card data never touches this server or the static site.
 *
 * IMPORTANT — before going live:
 *   - Confirm the exact API base URL, hosted checkout URL, and payload field
 *     names with PayFast directly (via your merchant dashboard / integration
 *     manual). The values in .env.example are best-effort placeholders based
 *     on public documentation and may differ for your account.
 *   - Confirm the signature algorithm/field order with PayFast — this
 *     implementation follows their documented hosted-checkout signature,
 *     but PayFast has been known to make small per-merchant variations.
 *   - Run this server over HTTPS only, and only allow your site's origin
 *     (see ALLOWED_ORIGIN below).
 *   - Do not log full request bodies in production — they contain customer
 *     email/mobile numbers.
 */

require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: ALLOWED_ORIGIN }));

const SANDBOX = String(process.env.PAYFAST_SANDBOX || 'true') === 'true';

const config = {
  merchantId: process.env.PAYFAST_MERCHANT_ID,
  securedKey: process.env.PAYFAST_SECURED_KEY,
  merchantName: process.env.PAYFAST_MERCHANT_NAME || 'WardMark',
  apiBase: SANDBOX
    ? process.env.PAYFAST_API_BASE_SANDBOX
    : process.env.PAYFAST_API_BASE_PRODUCTION,
  checkoutUrl: SANDBOX
    ? process.env.PAYFAST_CHECKOUT_URL_SANDBOX
    : process.env.PAYFAST_CHECKOUT_URL_PRODUCTION,
  successUrl: process.env.PAYFAST_SUCCESS_URL,
  failureUrl: process.env.PAYFAST_FAILURE_URL,
};

function assertConfigured() {
  const missing = Object.entries(config)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing PayFast configuration: ${missing.join(', ')}`);
  }
}

// ---- Step 1: get a short-lived access token from PayFast ----
async function getAccessToken(customerIp) {
  const body = new URLSearchParams({
    merchant_id: config.merchantId,
    grant_type: 'client_credentials',
    secured_key: config.securedKey,
    customer_ip: customerIp || '127.0.0.1',
  });

  const res = await fetch(`${config.apiBase}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error(`PayFast token request failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data || !data.token) {
    throw new Error('PayFast token response did not include a token');
  }
  return data.token;
}

// ---- Step 2: build & sign the hosted-checkout payload ----
function buildSignedPayload({ token, amount, basketId, name, email, mobile, description }) {
  // Documented signature: md5(merchant_id:merchant_name:amount:order_id)
  const signature = crypto
    .createHash('md5')
    .update(`${config.merchantId}:${config.merchantName}:${amount}:${basketId}`)
    .digest('hex');

  const now = new Date();
  const orderDate = now.toISOString().slice(0, 19).replace('T', ' ');

  return {
    MERCHANT_ID: config.merchantId,
    MERCHANT_NAME: config.merchantName,
    TOKEN: token,
    PROCCODE: '00',
    TXNAMT: Number(amount).toFixed(2),
    CUSTOMER_MOBILE_NO: mobile,
    CUSTOMER_EMAIL_ADDRESS: email,
    CUSTOMER_NAME: name,
    SIGNATURE: signature,
    VERSION: 'WARDMARK-WEB-1.0',
    TXNDESC: description || `WardMark case payment — ${basketId}`,
    SUCCESS_URL: config.successUrl,
    FAILURE_URL: config.failureUrl,
    BASKET_ID: basketId,
    ORDER_DATE: orderDate,
    CHECKOUT_URL: config.successUrl,
  };
}

function generateBasketId() {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `WM-${y}${m}${d}-${rand}`;
}

app.get('/api/health', (req, res) => res.json({ ok: true, sandbox: SANDBOX }));

app.post('/api/payfast/initiate', async (req, res) => {
  try {
    assertConfigured();

    const { plan, amount, name, email, mobile } = req.body || {};
    if (!amount || !name || !email || !mobile) {
      return res.status(400).json({ error: 'amount, name, email and mobile are required' });
    }

    const customerIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    const basketId = generateBasketId();

    const token = await getAccessToken(customerIp);
    const payload = buildSignedPayload({
      token,
      amount,
      basketId,
      name,
      email,
      mobile,
      description: plan ? `WardMark — ${plan}` : undefined,
    });

    res.json({ checkoutUrl: config.checkoutUrl, basketId, payload });
  } catch (err) {
    console.error('PayFast initiate error:', err.message);
    res.status(502).json({ error: 'Could not start PayFast checkout. Please try again shortly.' });
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`WardMark PayFast server listening on port ${PORT} (sandbox: ${SANDBOX})`);
});
