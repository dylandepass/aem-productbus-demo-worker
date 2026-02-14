/**
 * POST /auth/callback — verify OTP code, extract JWT from Set-Cookie.
 */

import { apiBase, proxyFetch } from '../../utils/proxy.js';

export default async function callback(request, { env }) {
  const resp = await proxyFetch(`${apiBase(env)}/auth/callback`, request, { auth: 'public', env });

  if (!resp.ok) {
    const body = await resp.text();
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
