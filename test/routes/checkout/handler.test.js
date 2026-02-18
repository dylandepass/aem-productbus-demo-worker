import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

const STRIPE_ENV = {
  ...DEFAULT_ENV,
  STRIPE_SECRET_KEY: 'sk_test_abc',
};

function createCheckoutRequest(body, headers = {}) {
  return new Request('https://worker.example.com/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'https://mysite.com',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeItems(overrides = []) {
  return [
    {
      sku: 'SKU1',
      name: 'Test Product',
      quantity: 1,
      price: 29.99,
      currency: 'USD',
      image: 'https://cdn.example.com/products/media_abc123def456.jpg?width=400',
      url: '/products/test-product/sku1',
      ...overrides[0],
    },
  ];
}

function makeBody(overrides = {}) {
  return {
    customer: { email: 'test@example.com', firstName: 'Jane', lastName: 'Doe' },
    shipping: { name: 'Jane Doe', address1: '123 Main St', city: 'NYC', state: 'NY', zip: '10001', country: 'US' },
    items: makeItems(),
    ...overrides,
  };
}

describe('routes/checkout/handler', () => {
  describe('createCheckoutSession', () => {
    it('creates a Stripe Checkout Session and returns URL', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test_123' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = createCheckoutRequest(makeBody());
      const resp = await createCheckoutSession(request, { env: STRIPE_ENV });

      assert.equal(resp.status, 200);
      const data = await resp.json();
      assert.equal(data.url, 'https://checkout.stripe.com/pay/cs_test_123');
    });

    it('sends correct params to Stripe', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const body = makeBody();
      const request = createCheckoutRequest(body);
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const [endpoint, opts] = stripeStub.firstCall.args;
      assert.equal(endpoint, '/checkout/sessions');
      assert.equal(opts.secretKey, 'sk_test_abc');

      const { params } = opts;
      assert.equal(params.mode, 'payment');
      assert.equal(params.customer_email, 'test@example.com');
      assert.ok(params.success_url.includes('mysite.com/order-confirmation'));
      assert.ok(params.cancel_url.includes('mysite.com/cart'));
    });

    it('builds line items with price in cents', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = createCheckoutRequest(makeBody());
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      assert.equal(params['line_items[0][price_data][unit_amount]'], 2999);
      assert.equal(params['line_items[0][price_data][currency]'], 'USD');
      assert.equal(params['line_items[0][price_data][product_data][name]'], 'Test Product');
      assert.equal(params['line_items[0][quantity]'], 1);
    });

    it('includes image for non-localhost URLs', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = createCheckoutRequest(makeBody());
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      assert.ok(params['line_items[0][price_data][product_data][images][0]']);
      assert.ok(params['line_items[0][price_data][product_data][images][0]'].includes('cdn.example.com'));
    });

    it('excludes localhost images from line items', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const items = makeItems([{ image: 'http://localhost:3000/products/media_abc.jpg' }]);
      const request = createCheckoutRequest(makeBody({ items }));
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      assert.equal(params['line_items[0][price_data][product_data][images][0]'], undefined);
    });

    it('extracts media hash for metadata', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = createCheckoutRequest(makeBody());
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      const metaItems = JSON.parse(params['metadata[items]']);
      assert.equal(metaItems[0].image, 'media_abc123def456.jpg');
      assert.equal(metaItems[0].sku, 'SKU1');
      assert.equal(metaItems[0].name, 'Test Product');
    });

    it('omits image from metadata when no media hash match', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const items = makeItems([{ image: 'https://cdn.example.com/some-other-image.jpg' }]);
      const request = createCheckoutRequest(makeBody({ items }));
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      const metaItems = JSON.parse(params['metadata[items]']);
      assert.equal(metaItems[0].image, undefined);
    });

    it('sets free shipping for orders >= $150', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const items = makeItems([{ price: 200 }]);
      const request = createCheckoutRequest(makeBody({ items }));
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      assert.equal(params['shipping_options[0][shipping_rate_data][fixed_amount][amount]'], 0);
      assert.ok(params['shipping_options[0][shipping_rate_data][display_name]'].includes('Free'));
    });

    it('sets $10 shipping for orders < $150', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const items = makeItems([{ price: 20 }]);
      const request = createCheckoutRequest(makeBody({ items }));
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      assert.equal(params['shipping_options[0][shipping_rate_data][fixed_amount][amount]'], 1000);
    });

    it('uses Origin header for redirect URLs', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = createCheckoutRequest(makeBody(), { origin: 'https://store.example.com' });
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      assert.ok(params.success_url.startsWith('https://store.example.com/'));
      assert.ok(params.cancel_url.startsWith('https://store.example.com/'));
    });

    it('falls back to Referer for redirect URLs', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = new Request('https://worker.example.com/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          referer: 'https://store.example.com/cart',
        },
        body: JSON.stringify(makeBody()),
      });
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      assert.ok(params.success_url.startsWith('https://store.example.com/'));
    });

    it('throws 400 when customer email is missing', async () => {
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: sinon.stub() },
      });

      const body = makeBody({ customer: { firstName: 'Jane' } });
      const request = createCheckoutRequest(body);

      await assert.rejects(
        () => createCheckoutSession(request, { env: STRIPE_ENV }),
        { status: 400 },
      );
    });

    it('throws 400 when items are empty', async () => {
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: sinon.stub() },
      });

      const body = makeBody({ items: [] });
      const request = createCheckoutRequest(body);

      await assert.rejects(
        () => createCheckoutSession(request, { env: STRIPE_ENV }),
        { status: 400 },
      );
    });

    it('throws 502 when Stripe returns an error', async () => {
      const stripeStub = sinon.stub().rejects(new Error('Invalid API Key'));
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = createCheckoutRequest(makeBody());

      await assert.rejects(
        () => createCheckoutSession(request, { env: STRIPE_ENV }),
        (err) => {
          assert.equal(err.status, 502);
          assert.ok(err.message.includes('Stripe error'));
          return true;
        },
      );
    });

    it('handles multiple items', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const items = [
        { sku: 'A', name: 'Item A', quantity: 2, price: 10, currency: 'USD', image: '', url: '/a' },
        { sku: 'B', name: 'Item B', quantity: 1, price: 25, currency: 'USD', image: '', url: '/b' },
      ];
      const request = createCheckoutRequest(makeBody({ items }));
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      assert.equal(params['line_items[0][price_data][product_data][name]'], 'Item A');
      assert.equal(params['line_items[0][quantity]'], 2);
      assert.equal(params['line_items[1][price_data][product_data][name]'], 'Item B');
      assert.equal(params['line_items[1][quantity]'], 1);
    });

    it('defaults currency to USD when not provided', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const items = [{ sku: 'A', name: 'Item', quantity: 1, price: 10, image: '', url: '/a' }];
      const request = createCheckoutRequest(makeBody({ items }));
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      assert.equal(params['line_items[0][price_data][currency]'], 'USD');
      assert.equal(params['shipping_options[0][shipping_rate_data][fixed_amount][currency]'], 'USD');
    });

    it('falls back to request URL when no Origin or Referer', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      // Request with no origin or referer headers
      const request = new Request('https://worker.example.com/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeBody()),
      });
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      assert.ok(params.success_url.startsWith('https://worker.example.com/'));
      assert.ok(params.cancel_url.startsWith('https://worker.example.com/'));
    });

    it('handles items without image', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const items = [{ sku: 'A', name: 'Item', quantity: 1, price: 10, currency: 'USD', url: '/a' }];
      const request = createCheckoutRequest(makeBody({ items }));
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      // No image key in line items
      assert.equal(params['line_items[0][price_data][product_data][images][0]'], undefined);
      // No image in metadata
      const metaItems = JSON.parse(params['metadata[items]']);
      assert.equal(metaItems[0].image, undefined);
    });

    it('stores customer and shipping in metadata', async () => {
      const stripeStub = sinon.stub().resolves({ url: 'https://checkout.stripe.com/pay/cs_test' });
      const { createCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const body = makeBody();
      const request = createCheckoutRequest(body);
      await createCheckoutSession(request, { env: STRIPE_ENV });

      const { params } = stripeStub.firstCall.args[1];
      const metaCustomer = JSON.parse(params['metadata[customer]']);
      const metaShipping = JSON.parse(params['metadata[shipping]']);
      assert.equal(metaCustomer.email, 'test@example.com');
      assert.equal(metaShipping.address1, '123 Main St');
    });
  });

  describe('getCheckoutSession', () => {
    it('retrieves session details from Stripe', async () => {
      const stripeStub = sinon.stub().resolves({
        id: 'cs_test_123',
        status: 'complete',
        payment_status: 'paid',
        customer_details: { email: 'test@example.com' },
        amount_total: 3999,
        currency: 'usd',
        metadata: { customer: '{}' },
      });
      const { getCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = new Request('https://worker.example.com/checkout/session?id=cs_test_123');
      const resp = await getCheckoutSession(request, { env: STRIPE_ENV });

      assert.equal(resp.status, 200);
      const data = await resp.json();
      assert.equal(data.id, 'cs_test_123');
      assert.equal(data.payment_status, 'paid');
      assert.equal(data.customer_email, 'test@example.com');
      assert.equal(data.amount_total, 3999);
      assert.equal(data.currency, 'usd');

      const [endpoint, opts] = stripeStub.firstCall.args;
      assert.equal(endpoint, '/checkout/sessions/cs_test_123');
      assert.equal(opts.method, 'GET');
    });

    it('falls back to customer_email when customer_details missing', async () => {
      const stripeStub = sinon.stub().resolves({
        id: 'cs_test_456',
        status: 'complete',
        payment_status: 'paid',
        customer_email: 'fallback@example.com',
        amount_total: 1000,
        currency: 'usd',
        metadata: {},
      });
      const { getCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = new Request('https://worker.example.com/checkout/session?id=cs_test_456');
      const resp = await getCheckoutSession(request, { env: STRIPE_ENV });

      const data = await resp.json();
      assert.equal(data.customer_email, 'fallback@example.com');
    });

    it('throws 400 when session id is missing', async () => {
      const { getCheckoutSession } = await esmock('../../../src/routes/checkout/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: sinon.stub() },
      });

      const request = new Request('https://worker.example.com/checkout/session');

      await assert.rejects(
        () => getCheckoutSession(request, { env: STRIPE_ENV }),
        { status: 400 },
      );
    });
  });
});
