/**
 * POST /webhooks/stripe — Handle Stripe webhook events.
 * Verifies signature, creates order in Commerce API on checkout.session.completed.
 */

import { verifyWebhookSignature } from '../../utils/stripe.js';
import { apiBase } from '../../utils/proxy.js';

/**
 * Build the order payload for the Commerce API from Stripe session metadata.
 */
function buildOrderPayload(metadata) {
  const customer = JSON.parse(metadata.customer);
  const shipping = JSON.parse(metadata.shipping);
  const items = JSON.parse(metadata.items);

  return {
    customer,
    shipping,
    items: items.map((item) => {
      // Image is stored as media_<hash>.<ext> short reference
      const image = item.image || '';
      return {
        sku: item.sku,
        urlKey: (item.url || '').split('/').pop() || '',
        name: item.name,
        quantity: item.quantity,
        price: {
          currency: item.currency || 'USD',
          final: String(item.price),
        },
        custom: { image, url: item.url || '' },
      };
    }),
  };
}

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
      const orderPayload = buildOrderPayload(session.metadata);

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
