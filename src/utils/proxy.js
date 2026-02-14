/**
 * Upstream proxy utilities.
 */

/**
 * Build the API base URL.
 *
 * @param {object} env
 * @returns {string}
 */
export function apiBase(env) {
  return `${env.API_ORIGIN}/${env.API_ORG}/sites/${env.API_SITE}`;
}

/**
 * Proxy a request to the upstream API.
 *
 * @param {string} url Upstream URL
 * @param {Request} request Incoming request
 * @param {object} opts
 * @param {'token'|'user'|'public'|'auto'} opts.auth Auth mode
 * @param {object} opts.env Worker env bindings
 * @returns {Promise<Response>}
 */
export async function proxyFetch(url, request, { auth, env }) {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');

  if (auth === 'token') {
    headers.set('Authorization', `Bearer ${env.API_TOKEN}`);
  } else if (auth === 'user') {
    const userAuth = request.headers.get('Authorization');
    if (userAuth) {
      headers.set('Authorization', userAuth);
    }
  } else if (auth === 'auto') {
    const userAuth = request.headers.get('Authorization');
    if (userAuth) {
      headers.set('Authorization', userAuth);
    } else {
      headers.set('Authorization', `Bearer ${env.API_TOKEN}`);
    }
  }
  // auth === 'public' → no Authorization header

  const init = { method: request.method, headers };
  if (request.method === 'POST') {
    init.body = request.body;
  }

  return fetch(url, init);
}
