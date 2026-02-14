/**
 * POST /auth/logout — invalidate session.
 */

import { apiBase, proxyFetch } from '../../utils/proxy.js';

export default async function logout(request, { env }) {
  return proxyFetch(`${apiBase(env)}/auth/logout`, request, { auth: 'user', env });
}
