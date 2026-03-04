/**
 * PayPal order handlers.
 *
 * POST /paypal/orders          — Create a PayPal order
 * POST /paypal/orders/:id/capture — Capture a PayPal order and create Commerce API order
 * GET  /paypal/orders/:id      — Get PayPal order details (for confirmation page)
 */

import { ResponseError } from '../../utils/http.js';
import { paypalRequest } from '../../utils/paypal.js';
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
 * POST /paypal/orders
 */
export async function createPayPalOrder(request, { env }) {
  const body = await request.json();
  const { customer, shipping, items } = body;

  if (!items?.length) {
    throw new ResponseError(400, 'Missing items');
  }

  const shippingCost = calculateShipping(items);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal + shippingCost;
  const currency = items[0]?.currency || 'USD';

  const purchaseUnit = {
    amount: {
      currency_code: currency,
      value: total.toFixed(2),
      breakdown: {
        item_total: {
          currency_code: currency,
          value: subtotal.toFixed(2),
        },
        shipping: {
          currency_code: currency,
          value: shippingCost.toFixed(2),
        },
      },
    },
    items: items.map((item) => ({
      name: item.name,
      sku: item.sku,
      unit_amount: {
        currency_code: item.currency || 'USD',
        value: item.price.toFixed(2),
      },
      quantity: String(item.quantity),
    })),
  };

  // Only include shipping address if provided — otherwise PayPal collects it
  if (shipping?.address1) {
    const fullName = shipping.name || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ');
    purchaseUnit.shipping = {
      name: { full_name: fullName },
      address: {
        address_line_1: shipping.address1,
        ...(shipping.address2 ? { address_line_2: shipping.address2 } : {}),
        admin_area_2: shipping.city,
        admin_area_1: shipping.state,
        postal_code: shipping.zip,
        country_code: shipping.country,
      },
    };
  }

  const orderBody = {
    intent: 'CAPTURE',
    purchase_units: [purchaseUnit],
  };

  let order;
  try {
    order = await paypalRequest('/v2/checkout/orders', {
      clientId: env.PAYPAL_CLIENT_ID,
      secret: env.PAYPAL_SECRET,
      body: orderBody,
    });
  } catch (err) {
    throw new ResponseError(502, `PayPal error: ${err.message}`);
  }

  return new Response(JSON.stringify({ id: order.id }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /paypal/orders/:orderId/capture
 */
export async function capturePayPalOrder(request, { env, params }) {
  const { orderId } = params;
  const body = await request.json();
  const { items } = body;

  if (!items?.length) {
    throw new ResponseError(400, 'Missing items');
  }

  let capture;
  try {
    capture = await paypalRequest(`/v2/checkout/orders/${orderId}/capture`, {
      clientId: env.PAYPAL_CLIENT_ID,
      secret: env.PAYPAL_SECRET,
      body: {},
    });
  } catch (err) {
    throw new ResponseError(502, `PayPal capture error: ${err.message}`);
  }

  if (capture.status !== 'COMPLETED') {
    throw new ResponseError(400, `Payment not completed: ${capture.status}`);
  }

  // Extract payer info from PayPal response, fall back to request body
  const payer = capture.payer || {};
  const paypalShipping = capture.purchase_units?.[0]?.shipping || {};

  const customer = body.customer?.email
    ? body.customer
    : {
      email: payer.email_address || '',
      firstName: payer.name?.given_name || '',
      lastName: payer.name?.surname || '',
    };

  const shipping = body.shipping?.address1
    ? body.shipping
    : {
      name: paypalShipping.name?.full_name || `${customer.firstName} ${customer.lastName}`,
      email: customer.email,
      address1: paypalShipping.address?.address_line_1 || '',
      address2: paypalShipping.address?.address_line_2 || '',
      city: paypalShipping.address?.admin_area_2 || '',
      state: paypalShipping.address?.admin_area_1 || '',
      zip: paypalShipping.address?.postal_code || '',
      country: paypalShipping.address?.country_code || '',
    };

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

  const captureUnit = capture.purchase_units?.[0]?.payments?.captures?.[0];

  return new Response(JSON.stringify({
    status: capture.status,
    paypal_order_id: capture.id,
    customer_email: customer.email,
    amount_total: captureUnit ? Math.round(parseFloat(captureUnit.amount.value) * 100) : 0,
    currency: (captureUnit?.amount?.currency_code || 'USD').toLowerCase(),
    order,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /paypal/orders/:orderId
 */
export async function getPayPalOrder(request, { env, params }) {
  const { orderId } = params;

  let order;
  try {
    order = await paypalRequest(`/v2/checkout/orders/${orderId}`, {
      clientId: env.PAYPAL_CLIENT_ID,
      secret: env.PAYPAL_SECRET,
      method: 'GET',
    });
  } catch (err) {
    throw new ResponseError(502, `PayPal error: ${err.message}`);
  }

  const unit = order.purchase_units?.[0];
  const captureObj = unit?.payments?.captures?.[0];
  const amount = captureObj?.amount || unit?.amount;
  const payer = order.payer;

  return new Response(JSON.stringify({
    id: order.id,
    status: order.status,
    payment_status: order.status === 'COMPLETED' ? 'paid' : 'unpaid',
    customer_email: payer?.email_address || '',
    amount_total: amount ? Math.round(parseFloat(amount.value) * 100) : 0,
    currency: (amount?.currency_code || 'USD').toLowerCase(),
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
