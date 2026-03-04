import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

function makeBody(overrides = {}) {
  return {
    customer: { email: 'test@example.com', firstName: 'Jane', lastName: 'Doe' },
    shipping: {
      name: 'Jane Doe', address1: '123 Main St', city: 'NYC', state: 'NY', zip: '10001', country: 'US',
    },
    items: [
      {
        sku: 'SKU1', name: 'Test Product', quantity: 1, price: 29.99, currency: 'USD', image: 'media_abc.jpg', url: '/products/test/sku1',
      },
    ],
    ...overrides,
  };
}

function createRequest(url, body, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('routes/stripe/handler', () => {
  let fetchStub;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  describe('createPaymentIntent', () => {
    it('creates a PaymentIntent and returns clientSecret + id', async () => {
      const stripeStub = sinon.stub().resolves({
        id: 'pi_123',
        client_secret: 'pi_123_secret_abc',
      });
      const { createPaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const body = makeBody();
      const request = createRequest('https://worker.example.com/stripe/payment-intents', body);
      const resp = await createPaymentIntent(request, { env: DEFAULT_ENV });

      assert.equal(resp.status, 200);
      const data = await resp.json();
      assert.equal(data.id, 'pi_123');
      assert.equal(data.clientSecret, 'pi_123_secret_abc');
    });

    it('sends correct amount and currency to Stripe', async () => {
      const stripeStub = sinon.stub().resolves({ id: 'pi_1', client_secret: 'secret' });
      const { createPaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const body = makeBody();
      const request = createRequest('https://worker.example.com/stripe/payment-intents', body);
      await createPaymentIntent(request, { env: DEFAULT_ENV });

      const [endpoint, opts] = stripeStub.firstCall.args;
      assert.equal(endpoint, '/payment_intents');
      // 29.99 + 10 shipping = 39.99 → 3999 cents
      assert.equal(opts.params.amount, 3999);
      assert.equal(opts.params.currency, 'usd');
      assert.equal(opts.params['automatic_payment_methods[enabled]'], 'true');
    });

    it('applies free shipping for orders >= $150', async () => {
      const stripeStub = sinon.stub().resolves({ id: 'pi_1', client_secret: 'secret' });
      const { createPaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const body = makeBody({ items: [{ sku: 'A', name: 'Expensive', quantity: 1, price: 200, currency: 'USD' }] });
      const request = createRequest('https://worker.example.com/stripe/payment-intents', body);
      await createPaymentIntent(request, { env: DEFAULT_ENV });

      // 200 + 0 shipping = 200 → 20000 cents
      assert.equal(stripeStub.firstCall.args[1].params.amount, 20000);
    });

    it('throws 400 when items are empty', async () => {
      const { createPaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: sinon.stub() },
      });

      const body = makeBody({ items: [] });
      const request = createRequest('https://worker.example.com/stripe/payment-intents', body);

      await assert.rejects(
        () => createPaymentIntent(request, { env: DEFAULT_ENV }),
        { status: 400 },
      );
    });

    it('throws 502 when Stripe returns an error', async () => {
      const stripeStub = sinon.stub().rejects(new Error('Invalid request'));
      const { createPaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = createRequest('https://worker.example.com/stripe/payment-intents', makeBody());

      await assert.rejects(
        () => createPaymentIntent(request, { env: DEFAULT_ENV }),
        (err) => {
          assert.equal(err.status, 502);
          assert.ok(err.message.includes('Stripe error'));
          return true;
        },
      );
    });
  });

  describe('capturePaymentIntent', () => {
    it('verifies payment and creates Commerce API order', async () => {
      const stripeStub = sinon.stub().resolves({
        id: 'pi_123',
        status: 'succeeded',
        amount: 3999,
        currency: 'usd',
      });
      fetchStub.resolves(new Response(JSON.stringify({ order: { id: 'api-order-1' } })));

      const { capturePaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const body = makeBody();
      const request = createRequest('https://worker.example.com/stripe/payment-intents/pi_123/capture', body);
      const resp = await capturePaymentIntent(request, {
        env: DEFAULT_ENV,
        params: { id: 'pi_123' },
      });

      assert.equal(resp.status, 200);
      const data = await resp.json();
      assert.equal(data.status, 'succeeded');
      assert.equal(data.payment_intent_id, 'pi_123');
      assert.equal(data.customer_email, 'test@example.com');
      assert.equal(data.amount_total, 3999);
      assert.equal(data.currency, 'usd');
      assert.equal(data.order.id, 'api-order-1');

      // Verify Commerce API order was created
      assert(fetchStub.calledOnce);
      const [url, init] = fetchStub.firstCall.args;
      assert.ok(url.includes('/orders'));
      assert.equal(init.method, 'POST');
      const orderBody = JSON.parse(init.body);
      assert.equal(orderBody.customer.email, 'test@example.com');
      assert.equal(orderBody.items[0].sku, 'SKU1');
    });

    it('throws 400 when items are missing', async () => {
      const { capturePaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: sinon.stub() },
      });

      const request = createRequest('https://worker.example.com/stripe/payment-intents/pi_123/capture', { items: [] });

      await assert.rejects(
        () => capturePaymentIntent(request, { env: DEFAULT_ENV, params: { id: 'pi_123' } }),
        { status: 400 },
      );
    });

    it('throws 400 when customer email is missing', async () => {
      const { capturePaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: sinon.stub() },
      });

      const body = makeBody({ customer: {} });
      const request = createRequest('https://worker.example.com/stripe/payment-intents/pi_123/capture', body);

      await assert.rejects(
        () => capturePaymentIntent(request, { env: DEFAULT_ENV, params: { id: 'pi_123' } }),
        { status: 400 },
      );
    });

    it('throws 400 when PaymentIntent status is not succeeded', async () => {
      const stripeStub = sinon.stub().resolves({ id: 'pi_123', status: 'requires_payment_method' });
      const { capturePaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = createRequest('https://worker.example.com/stripe/payment-intents/pi_123/capture', makeBody());

      await assert.rejects(
        () => capturePaymentIntent(request, { env: DEFAULT_ENV, params: { id: 'pi_123' } }),
        (err) => {
          assert.equal(err.status, 400);
          assert.ok(err.message.includes('not completed'));
          return true;
        },
      );
    });

    it('throws 502 when Stripe fetch fails', async () => {
      const stripeStub = sinon.stub().rejects(new Error('Stripe down'));
      const { capturePaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = createRequest('https://worker.example.com/stripe/payment-intents/pi_123/capture', makeBody());

      await assert.rejects(
        () => capturePaymentIntent(request, { env: DEFAULT_ENV, params: { id: 'pi_123' } }),
        { status: 502 },
      );
    });

    it('still returns response when Commerce API order creation fails', async () => {
      const stripeStub = sinon.stub().resolves({
        id: 'pi_123',
        status: 'succeeded',
        amount: 3999,
        currency: 'usd',
      });
      fetchStub.resolves(new Response('{"error":"fail"}', { status: 500 }));
      const consoleStub = sinon.stub(console, 'error');

      const { capturePaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = createRequest('https://worker.example.com/stripe/payment-intents/pi_123/capture', makeBody());
      const resp = await capturePaymentIntent(request, {
        env: DEFAULT_ENV,
        params: { id: 'pi_123' },
      });

      assert.equal(resp.status, 200);
      const data = await resp.json();
      assert.equal(data.status, 'succeeded');
      assert.equal(data.order, undefined);
      assert(consoleStub.calledOnce);
      consoleStub.restore();
    });
  });

  describe('getPaymentIntent', () => {
    it('returns PaymentIntent details in confirmation-compatible shape', async () => {
      const stripeStub = sinon.stub().resolves({
        id: 'pi_123',
        status: 'succeeded',
        receipt_email: 'buyer@example.com',
        amount: 3999,
        currency: 'usd',
      });

      const { getPaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = new Request('https://worker.example.com/stripe/payment-intents/pi_123');
      const resp = await getPaymentIntent(request, {
        env: DEFAULT_ENV,
        params: { id: 'pi_123' },
      });

      assert.equal(resp.status, 200);
      const data = await resp.json();
      assert.equal(data.id, 'pi_123');
      assert.equal(data.payment_status, 'paid');
      assert.equal(data.customer_email, 'buyer@example.com');
      assert.equal(data.amount_total, 3999);
      assert.equal(data.currency, 'usd');
    });

    it('returns unpaid status for non-succeeded PaymentIntents', async () => {
      const stripeStub = sinon.stub().resolves({
        id: 'pi_123',
        status: 'requires_payment_method',
        amount: 1000,
        currency: 'usd',
      });

      const { getPaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = new Request('https://worker.example.com/stripe/payment-intents/pi_123');
      const resp = await getPaymentIntent(request, {
        env: DEFAULT_ENV,
        params: { id: 'pi_123' },
      });

      const data = await resp.json();
      assert.equal(data.payment_status, 'unpaid');
    });

    it('returns empty email when receipt_email is not set', async () => {
      const stripeStub = sinon.stub().resolves({
        id: 'pi_123',
        status: 'succeeded',
        amount: 1000,
        currency: 'usd',
      });

      const { getPaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = new Request('https://worker.example.com/stripe/payment-intents/pi_123');
      const resp = await getPaymentIntent(request, {
        env: DEFAULT_ENV,
        params: { id: 'pi_123' },
      });

      const data = await resp.json();
      assert.equal(data.customer_email, '');
    });

    it('throws 502 when Stripe fetch fails', async () => {
      const stripeStub = sinon.stub().rejects(new Error('Not found'));
      const { getPaymentIntent } = await esmock('../../../src/routes/stripe/handler.js', {
        '../../../src/utils/stripe.js': { stripeRequest: stripeStub },
      });

      const request = new Request('https://worker.example.com/stripe/payment-intents/pi_bad');

      await assert.rejects(
        () => getPaymentIntent(request, { env: DEFAULT_ENV, params: { id: 'pi_bad' } }),
        { status: 502 },
      );
    });
  });
});
