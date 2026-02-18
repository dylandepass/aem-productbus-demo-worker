/**
 * Stripe REST API helper.
 * Uses native fetch — no SDK needed.
 */

/**
 * Make a request to the Stripe API.
 *
 * @param {string} endpoint API path (e.g. '/checkout/sessions')
 * @param {object} opts
 * @param {string} opts.secretKey Stripe secret key
 * @param {string} [opts.method='POST'] HTTP method
 * @param {object} [opts.params] Form-encoded parameters
 * @returns {Promise<object>} Parsed response
 */
export async function stripeRequest(endpoint, { secretKey, method = 'POST', params }) {
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  };

  if (params && method === 'POST') {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(params).toString();
  }

  const resp = await fetch(`https://api.stripe.com/v1${endpoint}`, init);
  const data = await resp.json();

  if (data.error) {
    const err = new Error(data.error.message);
    err.type = data.error.type;
    err.code = data.error.code;
    throw err;
  }

  return data;
}

/**
 * Verify a Stripe webhook signature using Web Crypto API.
 *
 * @param {string} payload Raw request body
 * @param {string} sigHeader Stripe-Signature header value
 * @param {string} secret Webhook signing secret (whsec_...)
 * @param {number} [toleranceSec=300] Timestamp tolerance in seconds
 * @returns {Promise<object>} Parsed event
 */
export async function verifyWebhookSignature(payload, sigHeader, secret, toleranceSec = 300) {
  const parts = {};
  sigHeader.split(',').forEach((item) => {
    const [key, value] = item.split('=');
    parts[key.trim()] = value.trim();
  });

  const timestamp = parts.t;
  const signature = parts.v1;

  if (!timestamp || !signature) {
    throw new Error('Invalid Stripe signature header');
  }

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > toleranceSec) {
    throw new Error('Webhook timestamp outside tolerance');
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (expected !== signature) {
    throw new Error('Webhook signature verification failed');
  }

  return JSON.parse(payload);
}
