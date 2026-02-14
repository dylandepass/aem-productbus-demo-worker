/**
 * POST /orders — create a new order.
 */

import { apiBase, proxyFetch } from '../../utils/proxy.js';

export default async function createOrder(request, { env }) {
  return proxyFetch(`${apiBase(env)}/orders`, request, { auth: 'auto', env });
}
