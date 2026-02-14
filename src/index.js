/**
 * Commerce API proxy worker.
 * Forwards browser requests to the Helix Commerce API with server-side auth.
 * Handles orders (service token), auth (public/user token), and customers (user token).
 */

function apiBase(env) {
  return `${env.API_ORIGIN}/${env.API_ORG}/sites/${env.API_SITE}`;
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

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

function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function matchRoute(pathname) {
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');

  if (segments[0] === 'auth' && segments[1]) {
    return { route: 'auth', action: segments[1] };
  }

  if (segments[0] === 'orders') {
    return { route: 'orders', orderId: segments[1] || undefined };
  }

  if (segments[0] === 'customers') {
    return {
      route: 'customers',
      email: segments[1] || undefined,
      subroute: segments[2] || undefined,
    };
  }

  return null;
}

/**
 * Forward with service token (for orders).
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

/**
 * Forward with no auth token (public auth endpoints).
 */
async function forwardPublic(url, request) {
  console.log(`[worker] ${request.method} ${url} (public)`);

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');

  const init = { method: request.method, headers };
  if (request.method === 'POST') {
    init.body = request.body;
  }

  const resp = await fetch(url, init);
  console.log(`[worker] upstream responded ${resp.status}`);
  return resp;
}

/**
 * Forward with user's own JWT from the Authorization header.
 */
async function forwardWithUserAuth(url, request) {
  console.log(`[worker] ${request.method} ${url} (user auth)`);

  const authHeader = request.headers.get('Authorization');
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (authHeader) {
    headers.set('Authorization', authHeader);
  }

  const init = { method: request.method, headers };
  if (request.method === 'POST') {
    init.body = request.body;
  }

  const resp = await fetch(url, init);
  console.log(`[worker] upstream responded ${resp.status}`);
  return resp;
}

/**
 * Handle /auth/callback — extract JWT from upstream Set-Cookie and add to response body.
 */
async function handleAuthCallback(request, env) {
  const resp = await forwardPublic(`${apiBase(env)}/auth/callback`, request);

  if (!resp.ok) {
    const body = await resp.text();
    console.log(`[worker] auth callback error: ${body}`);
    return new Response(body, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const setCookie = resp.headers.get('Set-Cookie') || '';
  const tokenMatch = setCookie.match(/auth_token=([^;]+)/);
  const body = await resp.json();
  body.token = tokenMatch ? tokenMatch[1] : null;

  return new Response(JSON.stringify(body), {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' },
  });
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
      return withCORS(errorResponse(404, 'Not found'), env);
    }

    // --- Auth routes ---

    if (match.route === 'auth') {
      if (request.method !== 'POST') {
        return withCORS(errorResponse(405, 'Method not allowed'), env);
      }

      if (match.action === 'login') {
        const resp = await forwardPublic(`${apiBase(env)}/auth/login`, request);
        return withCORS(resp, env);
      }

      if (match.action === 'callback') {
        const resp = await handleAuthCallback(request, env);
        return withCORS(resp, env);
      }

      if (match.action === 'logout') {
        const resp = await forwardWithUserAuth(`${apiBase(env)}/auth/logout`, request);
        return withCORS(resp, env);
      }

      return withCORS(errorResponse(404, 'Not found'), env);
    }

    // --- Customer routes ---

    if (match.route === 'customers') {
      if (request.method !== 'GET') {
        return withCORS(errorResponse(405, 'Method not allowed'), env);
      }

      if (match.email && match.subroute === 'orders') {
        const upstream = `${apiBase(env)}/customers/${encodeURIComponent(match.email)}/orders`;
        const resp = await forwardWithUserAuth(upstream, request);
        return withCORS(resp, env);
      }

      if (match.email) {
        const upstream = `${apiBase(env)}/customers/${encodeURIComponent(match.email)}`;
        const resp = await forwardWithUserAuth(upstream, request);
        return withCORS(resp, env);
      }

      return withCORS(errorResponse(400, 'Missing email'), env);
    }

    // --- Order routes ---

    if (match.route === 'orders') {
      if (request.method === 'POST' && !match.orderId) {
        const upstream = `${apiBase(env)}/orders`;
        const resp = await forward(upstream, request, env);
        return withCORS(resp, env);
      }

      if (request.method === 'GET' && match.orderId) {
        const email = url.searchParams.get('email');
        if (!email) {
          return withCORS(errorResponse(400, 'Missing email parameter'), env);
        }
        const upstream = `${apiBase(env)}/customers/${encodeURIComponent(email)}/orders/${encodeURIComponent(match.orderId)}`;
        const resp = await forward(upstream, request, env);
        return withCORS(resp, env);
      }

      return withCORS(errorResponse(405, 'Method not allowed'), env);
    }

    return withCORS(errorResponse(404, 'Not found'), env);
  },
};
