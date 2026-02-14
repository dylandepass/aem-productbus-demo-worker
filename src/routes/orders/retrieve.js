/**
 * GET /orders/:orderId — retrieve a single order.
 */

import { apiBase, proxyFetch } from '../../utils/proxy.js';

export default async function retrieveOrder(request, { env, params }) {
  return proxyFetch(
    `${apiBase(env)}/orders/${params.orderId}`,
    request,
    { auth: 'auto', env },
  );
}
