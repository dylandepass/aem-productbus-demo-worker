/**
 * Auth route dispatcher.
 */

import { ResponseError } from '../../utils/http.js';
import login from './login.js';
import callback from './callback.js';
import logout from './logout.js';

const actions = { login, callback, logout };

export default async function authHandler(request, ctx) {
  if (request.method !== 'POST') {
    throw new ResponseError(405, 'Method not allowed');
  }

  const handler = actions[ctx.params.action];
  if (!handler) {
    throw new ResponseError(404, 'Not found');
  }

  return handler(request, ctx);
}
