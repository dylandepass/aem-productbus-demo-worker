/**
 * CORS utilities.
 */

/**
 * @param {object} env
 * @returns {object} CORS headers
 */
export function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/**
 * Wrap a response with CORS headers.
 *
 * @param {Response} resp
 * @param {object} env
 * @returns {Response}
 */
export function withCORS(resp, env) {
  const headers = new Headers(resp.headers);
  const cors = corsHeaders(env);
  Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

/**
 * Handle CORS preflight request.
 *
 * @param {object} env
 * @returns {Response}
 */
export function handlePreflight(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}
