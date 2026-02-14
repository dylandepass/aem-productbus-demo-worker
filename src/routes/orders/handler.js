/**
 * Orders route dispatcher.
 */

import { ResponseError } from '../../utils/http.js';
import createOrder from './create.js';
import retrieveOrder from './retrieve.js';

export default async function ordersHandler(request, ctx) {
  if (request.method === 'POST' && !ctx.params.orderId) {
    return createOrder(request, ctx);
  }

  if (request.method === 'GET' && ctx.params.orderId) {
    return retrieveOrder(request, ctx);
  }

  throw new ResponseError(405, 'Method not allowed');
}
