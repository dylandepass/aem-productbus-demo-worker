/**
 * PayPal REST API helper.
 * Uses native fetch — no SDK needed.
 */

const BASE_URL = 'https://api-m.sandbox.paypal.com';

/** In-memory OAuth token cache. */
let cachedToken = null;
let tokenExpiry = 0;

/**
 * Get a PayPal OAuth2 access token, using cache when possible.
 *
 * @param {string} clientId
 * @param {string} secret
 * @returns {Promise<string>} Access token
 */
async function getAccessToken(clientId, secret) {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const credentials = btoa(`${clientId}:${secret}`);
  const resp = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await resp.json();

  if (!resp.ok || data.error) {
    const err = new Error(data.error_description || data.message || 'PayPal auth failed');
    err.type = data.error;
    throw err;
  }

  cachedToken = data.access_token;
  // Cache with 5-minute buffer before actual expiry
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

  return cachedToken;
}

/**
 * Make an authenticated request to the PayPal API.
 *
 * @param {string} endpoint API path (e.g. '/v2/checkout/orders')
 * @param {object} opts
 * @param {string} opts.clientId PayPal client ID
 * @param {string} opts.secret PayPal secret
 * @param {string} [opts.method='POST'] HTTP method
 * @param {object} [opts.body] JSON body
 * @returns {Promise<object>} Parsed response
 */
export async function paypalRequest(endpoint, {
  clientId, secret, method = 'POST', body,
}) {
  const token = await getAccessToken(clientId, secret);

  const init = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && (method === 'POST' || method === 'PATCH')) {
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(`${BASE_URL}${endpoint}`, init);
  const data = await resp.json();

  if (!resp.ok) {
    const err = new Error(data.message || data.details?.[0]?.description || `PayPal API error: ${resp.status}`);
    err.status = resp.status;
    err.details = data.details;
    throw err;
  }

  return data;
}

/**
 * Clear the cached token. Useful for testing.
 */
export function clearTokenCache() {
  cachedToken = null;
  tokenExpiry = 0;
}
