/**
 * Commerce API proxy worker.
 * Routes browser requests to the Helix Commerce API with appropriate auth.
 */

import router from './routes/index.js';
import { ResponseError, errorResponse } from './utils/http.js';
import { withCORS, handlePreflight } from './utils/cors.js';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return handlePreflight(env);
    }

    const { pathname } = new URL(request.url);
    const path = decodeURIComponent(pathname);

    const match = router.match(request.method, path);
    if (!match) {
      return withCORS(errorResponse(404, 'Not found'), env);
    }

    try {
      const resp = await match.handler(request, { env, params: match.params });
      return withCORS(resp, env);
    } catch (err) {
      if (err instanceof ResponseError) {
        return withCORS(errorResponse(err.status, err.message), env);
      }
      return withCORS(errorResponse(500, 'Internal server error'), env);
    }
  },
};
