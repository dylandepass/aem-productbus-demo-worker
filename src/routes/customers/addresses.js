/**
 * /customers/:email/addresses — proxy address CRUD to upstream API.
 */

import { apiBase, proxyFetch } from '../../utils/proxy.js';

export default async function customerAddresses(request, { env, params }) {
  const base = `${apiBase(env)}/customers/${params.email}/addresses`;
  const url = params.addressId ? `${base}/${params.addressId}` : base;
  return proxyFetch(url, request, { auth: 'auto', env });
}
