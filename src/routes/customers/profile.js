/**
 * GET /customers/:email — retrieve customer profile.
 */

import { apiBase, proxyFetch } from '../../utils/proxy.js';

export default async function customerProfile(request, { env, params }) {
  return proxyFetch(
    `${apiBase(env)}/customers/${params.email}`,
    request,
    { auth: 'auto', env },
  );
}
