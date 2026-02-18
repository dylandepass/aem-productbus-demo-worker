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

    // Webhook routes are server-to-server — skip CORS
    const skipCORS = path.startsWith('/webhooks/');

    try {
      const resp = await match.handler(request, { env, params: match.params });
      return skipCORS ? resp : withCORS(resp, env);
    } catch (err) {
      if (err instanceof ResponseError) {
        const errResp = errorResponse(err.status, err.message);
        return skipCORS ? errResp : withCORS(errResp, env);
      }
      const errResp = errorResponse(500, 'Internal server error');
      return skipCORS ? errResp : withCORS(errResp, env);
    }
  },
};
