/**
 * Stripe Payment Intent handlers (Apple Pay / Google Pay via Payment Request Button).
 *
 * POST /stripe/payment-intents          — Create a PaymentIntent
 * POST /stripe/payment-intents/:id/capture — Verify payment + create Commerce API order
 * GET  /stripe/payment-intents/:id      — Get PaymentIntent details (for confirmation page)
 */

import { ResponseError } from '../../utils/http.js';
import { stripeRequest } from '../../utils/stripe.js';
import { buildOrderPayload } from '../../utils/order.js';
import { apiBase } from '../../utils/proxy.js';

const SHIPPING_THRESHOLD = 150;
const SHIPPING_COST = 10; // dollars

/**
 * Calculate shipping cost based on item subtotal.
 */
function calculateShipping(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
}

/**
 * POST /stripe/payment-intents
 */
export async function createPaymentIntent(request, { env }) {
  const body = await request.json();
  const { items } = body;

  if (!items?.length) {
    throw new ResponseError(400, 'Missing items');
  }

  const shippingCost = calculateShipping(items);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal + shippingCost;
  const currency = (items[0]?.currency || 'USD').toLowerCase();

  let paymentIntent;
  try {
    paymentIntent = await stripeRequest('/payment_intents', {
      secretKey: env.STRIPE_SECRET_KEY,
      params: {
        amount: Math.round(total * 100),
        currency,
        'automatic_payment_methods[enabled]': 'true',
      },
    });
  } catch (err) {
    throw new ResponseError(502, `Stripe error: ${err.message}`);
  }

  return new Response(JSON.stringify({
    clientSecret: paymentIntent.client_secret,
    id: paymentIntent.id,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /stripe/payment-intents/:id/capture
 */
export async function capturePaymentIntent(request, { env, params }) {
  const { id } = params;
  const body = await request.json();
  const { customer, shipping, items } = body;

  if (!items?.length) {
    throw new ResponseError(400, 'Missing items');
  }

  if (!customer?.email) {
    throw new ResponseError(400, 'Missing customer email');
  }

  // Verify the PaymentIntent succeeded
  let paymentIntent;
  try {
    paymentIntent = await stripeRequest(`/payment_intents/${id}`, {
      secretKey: env.STRIPE_SECRET_KEY,
      method: 'GET',
    });
  } catch (err) {
    throw new ResponseError(502, `Stripe error: ${err.message}`);
  }

  if (paymentIntent.status !== 'succeeded') {
    throw new ResponseError(400, `Payment not completed: ${paymentIntent.status}`);
  }

  // Store customer email in PaymentIntent metadata for the confirmation page
  try {
    await stripeRequest(`/payment_intents/${id}`, {
      secretKey: env.STRIPE_SECRET_KEY,
      params: { 'metadata[customer_email]': customer.email },
    });
  } catch {
    // Best-effort — don't block order creation
  }

  // Create order in Commerce API
  const orderPayload = buildOrderPayload({ customer, shipping, items });

  const orderResp = await fetch(`${apiBase(env)}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.API_TOKEN}`,
    },
    body: JSON.stringify(orderPayload),
  });

  let order;
  if (orderResp.ok) {
    const data = await orderResp.json();
    order = data.order;
  } else {
    console.error('Order creation failed:', orderResp.status, await orderResp.text());
  }

  return new Response(JSON.stringify({
    status: paymentIntent.status,
    payment_intent_id: paymentIntent.id,
    customer_email: customer.email,
    amount_total: paymentIntent.amount,
    currency: (paymentIntent.currency || 'usd').toLowerCase(),
    order,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /stripe/payment-intents/:id
 */
export async function getPaymentIntent(request, { env, params }) {
  const { id } = params;

  let paymentIntent;
  try {
    paymentIntent = await stripeRequest(`/payment_intents/${id}`, {
      secretKey: env.STRIPE_SECRET_KEY,
      method: 'GET',
    });
  } catch (err) {
    throw new ResponseError(502, `Stripe error: ${err.message}`);
  }

  return new Response(JSON.stringify({
    id: paymentIntent.id,
    payment_status: paymentIntent.status === 'succeeded' ? 'paid' : 'unpaid',
    customer_email: paymentIntent.receipt_email || paymentIntent.metadata?.customer_email || '',
    amount_total: paymentIntent.amount,
    currency: (paymentIntent.currency || 'usd').toLowerCase(),
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
