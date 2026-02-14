/**
 * POST /auth/login — request OTP code.
 */

import { apiBase, proxyFetch } from '../../utils/proxy.js';

export default async function login(request, { env }) {
  return proxyFetch(`${apiBase(env)}/auth/login`, request, { auth: 'public', env });
}
