/**
 * Google Places API proxy handler.
 * Keeps the API key server-side as a worker secret.
 * Origin-restricted to prevent unauthorized use.
 */

import { ResponseError } from '../../utils/http.js';

const GOOGLE_PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

const ALLOWED_ORIGINS = [
  'https://main--aem-productbus-demo--dylandepass.aem.page',
  'https://main--aem-productbus-demo--dylandepass.aem.live',
  'https://main--aem-productbus-demo--dylandepass.aem.network',
  'http://localhost:3000',
];

/**
 * Validate that the request Origin is allowed.
 */
function assertOrigin(request) {
  const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
  const allowed = ALLOWED_ORIGINS.some((o) => origin.startsWith(o));
  if (!allowed) throw new ResponseError(403, 'Forbidden');
}

/**
 * Proxy autocomplete requests to Google Places API.
 */
async function autocomplete(request, { env }) {
  const { searchParams } = new URL(request.url);
  const input = searchParams.get('input');
  if (!input) throw new ResponseError(400, 'Missing input parameter');

  const params = new URLSearchParams({
    input,
    types: 'address',
    key: env.GOOGLE_PLACES_API_KEY,
  });

  // Forward optional parameters
  const sessiontoken = searchParams.get('sessiontoken');
  if (sessiontoken) params.set('sessiontoken', sessiontoken);

  const resp = await fetch(`${GOOGLE_PLACES_BASE}/autocomplete/json?${params}`);
  return new Response(resp.body, {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Proxy place details requests to Google Places API.
 */
async function details(request, { env }) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get('place_id');
  if (!placeId) throw new ResponseError(400, 'Missing place_id parameter');

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'address_components,formatted_address',
    key: env.GOOGLE_PLACES_API_KEY,
  });

  const sessiontoken = searchParams.get('sessiontoken');
  if (sessiontoken) params.set('sessiontoken', sessiontoken);

  const resp = await fetch(`${GOOGLE_PLACES_BASE}/details/json?${params}`);
  return new Response(resp.body, {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Route dispatcher for /places/:action
 */
export default async function placesHandler(request, ctx) {
  const { action } = ctx.params;

  assertOrigin(request);

  if (!ctx.env.GOOGLE_PLACES_API_KEY) {
    throw new ResponseError(503, 'Places API not configured');
  }

  switch (action) {
    case 'autocomplete': return autocomplete(request, ctx);
    case 'details': return details(request, ctx);
    default: throw new ResponseError(404, 'Not found');
  }
}
