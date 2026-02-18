/**
 * POST /checkout — Create a Stripe Checkout Session.
 * GET  /checkout/session — Retrieve session details for confirmation page.
 */

import { ResponseError } from '../../utils/http.js';
import { stripeRequest } from '../../utils/stripe.js';

const SHIPPING_THRESHOLD = 150;
const SHIPPING_COST = 1000; // cents
const FREE_SHIPPING_LABEL = 'Standard Shipping (Free)';
const PAID_SHIPPING_LABEL = 'Standard Shipping';

/**
 * Build Stripe line_items params from cart items.
 * Stripe expects nested form-encoded params.
 */
function buildLineItemParams(items) {
  const params = {};
  items.forEach((item, i) => {
    const prefix = `line_items[${i}]`;
    params[`${prefix}[price_data][currency]`] = item.currency || 'USD';
    params[`${prefix}[price_data][unit_amount]`] = Math.round(item.price * 100);
    params[`${prefix}[price_data][product_data][name]`] = item.name;
    if (item.image && !item.image.includes('localhost')) {
      params[`${prefix}[price_data][product_data][images][0]`] = item.image;
    }
    params[`${prefix}[quantity]`] = item.quantity;
  });
  return params;
}

/**
 * POST /checkout
 */
export async function createCheckoutSession(request, { env }) {
  const body = await request.json();
  const { customer, shipping, items } = body;

  if (!customer?.email || !items?.length) {
    throw new ResponseError(400, 'Missing customer email or items');
  }

  // Calculate subtotal for shipping logic
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingAmount = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;

  // Use the client's origin (from Referer/Origin header) for redirect URLs
  const clientOrigin = request.headers.get('origin')
    || new URL(request.headers.get('referer') || request.url).origin;

  // Build metadata — store order payload for the webhook.
  // Extract just the media_<hash>.<ext> filename from image URLs
  // to stay within Stripe's 500-char-per-value limit.
  const metaItems = items.map(({ sku, name, quantity, price, currency, image, url }) => {
    const entry = { sku, name, quantity, price, currency, url };
    if (image) {
      const match = image.match(/(media_[a-f0-9]+\.\w+)/);
      if (match) entry.image = match[1];
    }
    return entry;
  });

  const params = {
    mode: 'payment',
    customer_email: customer.email,
    success_url: `${clientOrigin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientOrigin}/cart`,
    ...buildLineItemParams(items),
    'shipping_options[0][shipping_rate_data][type]': 'fixed_amount',
    'shipping_options[0][shipping_rate_data][display_name]': shippingAmount === 0 ? FREE_SHIPPING_LABEL : PAID_SHIPPING_LABEL,
    'shipping_options[0][shipping_rate_data][fixed_amount][amount]': shippingAmount,
    'shipping_options[0][shipping_rate_data][fixed_amount][currency]': items[0]?.currency || 'USD',
    'metadata[customer]': JSON.stringify(customer),
    'metadata[shipping]': JSON.stringify(shipping),
    'metadata[items]': JSON.stringify(metaItems),
  };

  let session;
  try {
    session = await stripeRequest('/checkout/sessions', {
      secretKey: env.STRIPE_SECRET_KEY,
      params,
    });
  } catch (err) {
    throw new ResponseError(502, `Stripe error: ${err.message}`);
  }

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /checkout/session?id=cs_xxx
 */
export async function getCheckoutSession(request, { env }) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('id');
  if (!sessionId) {
    throw new ResponseError(400, 'Missing session id');
  }

  const session = await stripeRequest(`/checkout/sessions/${sessionId}`, {
    secretKey: env.STRIPE_SECRET_KEY,
    method: 'GET',
  });

  return new Response(JSON.stringify({
    id: session.id,
    status: session.status,
    payment_status: session.payment_status,
    customer_email: session.customer_details?.email || session.customer_email,
    amount_total: session.amount_total,
    currency: session.currency,
    metadata: session.metadata,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
