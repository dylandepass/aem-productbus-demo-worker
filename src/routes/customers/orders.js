/**
 * GET /customers/:email/orders — retrieve customer's orders.
 */

import { apiBase, proxyFetch } from '../../utils/proxy.js';

export default async function customerOrders(request, { env, params }) {
  return proxyFetch(
    `${apiBase(env)}/customers/${params.email}/orders`,
    request,
    { auth: 'auto', env },
  );
}
