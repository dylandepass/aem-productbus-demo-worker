/**
 * POST /webhooks/stripe — Handle Stripe webhook events.
 * Verifies signature, creates order in Commerce API on checkout.session.completed.
 */

import { verifyWebhookSignature } from '../../utils/stripe.js';
import { buildOrderPayload } from '../../utils/order.js';
import { apiBase } from '../../utils/proxy.js';

export default async function stripeWebhookHandler(request, { env }) {
  const payload = await request.text();
  const sigHeader = request.headers.get('stripe-signature');

  if (!sigHeader) {
    return new Response(JSON.stringify({ error: 'Missing signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let event;
  try {
    event = await verifyWebhookSignature(payload, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    if (session.payment_status === 'paid') {
      const orderPayload = buildOrderPayload({
        customer: JSON.parse(session.metadata.customer),
        shipping: JSON.parse(session.metadata.shipping),
        items: JSON.parse(session.metadata.items),
      });

      const orderResp = await fetch(`${apiBase(env)}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.API_TOKEN}`,
        },
        body: JSON.stringify(orderPayload),
      });

      if (!orderResp.ok) {
        console.error('Order creation failed:', orderResp.status, await orderResp.text());
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
