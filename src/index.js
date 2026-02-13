/**
 * Orders API proxy worker.
 * Forwards browser requests to the Helix Commerce API with server-side auth.
 */

/**
 * Builds the upstream API base path.
 * @param {Object} env - Worker environment bindings
 * @returns {string}
 */
function apiBase(env) {
  return `${env.API_ORIGIN}/${env.API_ORG}/sites/${env.API_SITE}`;
}

/**
 * Returns CORS headers for the given environment.
 * @param {Object} env - Worker environment bindings
 * @returns {Object}
 */
function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * Adds CORS headers to a response.
 * @param {Response} resp - Upstream response
 * @param {Object} env - Worker environment bindings
 * @returns {Response}
 */
function withCORS(resp, env) {
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
 * Parses the request path to extract route and orderId.
 * Expects: /orders or /orders/:orderId
 * @param {string} pathname
 * @returns {{ route: string, orderId?: string } | null}
 */
function matchRoute(pathname) {
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (segments[0] !== 'orders') return null;
  return {
    route: 'orders',
    orderId: segments[1] || undefined,
  };
}

/**
 * Forwards a request to the Helix Commerce API with auth.
 * @param {string} url - Upstream URL
 * @param {Request} request - Original request
 * @param {Object} env - Worker environment bindings
 * @returns {Promise<Response>}
 */
async function forward(url, request, env) {
  console.log(`[worker] ${request.method} ${url}`);

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${env.API_TOKEN}`);

  const init = { method: request.method, headers };
  if (request.method === 'POST') {
    init.body = request.body;
  }

  const resp = await fetch(url, init);
  console.log(`[worker] upstream responded ${resp.status}`);

  if (!resp.ok) {
    const body = await resp.text();
    console.log(`[worker] upstream error body: ${body}`);
    return new Response(body, {
      status: resp.status,
      headers: resp.headers,
    });
  }

  return resp;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const match = matchRoute(url.pathname);
    if (!match) {
      return withCORS(new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }), env);
    }

    // POST /orders → create order
    if (request.method === 'POST' && !match.orderId) {
      const upstream = `${apiBase(env)}/orders`;
      const resp = await forward(upstream, request, env);
      return withCORS(resp, env);
    }

    // GET /orders/:orderId?email=... → retrieve order
    if (request.method === 'GET' && match.orderId) {
      const email = url.searchParams.get('email');
      if (!email) {
        return withCORS(new Response(JSON.stringify({ error: 'Missing email parameter' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }), env);
      }
      const upstream = `${apiBase(env)}/customers/${encodeURIComponent(email)}/orders/${encodeURIComponent(match.orderId)}`;
      const resp = await forward(upstream, request, env);
      return withCORS(resp, env);
    }

    return withCORS(new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    }), env);
  },
};
