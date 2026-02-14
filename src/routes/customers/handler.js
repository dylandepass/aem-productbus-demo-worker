/**
 * Customers route dispatcher.
 */

import { ResponseError } from '../../utils/http.js';
import customerProfile from './profile.js';
import customerOrders from './orders.js';

export default async function customersHandler(request, ctx) {
  if (request.method !== 'GET') {
    throw new ResponseError(405, 'Method not allowed');
  }

  if (!ctx.params.email) {
    throw new ResponseError(400, 'Missing email');
  }

  if (ctx.params.subroute === 'orders') {
    return customerOrders(request, ctx);
  }

  if (!ctx.params.subroute) {
    return customerProfile(request, ctx);
  }

  throw new ResponseError(404, 'Not found');
}
