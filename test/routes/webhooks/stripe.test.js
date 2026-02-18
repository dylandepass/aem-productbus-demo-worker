import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

const WEBHOOK_ENV = {
  ...DEFAULT_ENV,
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
};

function makeSessionEvent(overrides = {}) {
  return {
    type: 'checkout.session.completed',
    data: {
      object: {
        payment_status: 'paid',
        metadata: {
          customer: JSON.stringify({ email: 'test@example.com', firstName: 'Jane', lastName: 'Doe' }),
          shipping: JSON.stringify({ name: 'Jane Doe', address1: '123 Main St', city: 'NYC', state: 'NY', zip: '10001', country: 'US' }),
          items: JSON.stringify([
            { sku: 'SKU1', name: 'Test Product', quantity: 1, price: 29.99, currency: 'USD', image: 'media_abc123.jpg', url: '/products/test-product/sku1' },
          ]),
        },
        ...overrides,
      },
    },
  };
}

function createWebhookRequest(body, sigHeader = 'valid-sig') {
  return new Request('https://worker.example.com/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': sigHeader,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('routes/webhooks/stripe', () => {
  let fetchStub;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('creates order on checkout.session.completed with paid status', async () => {
    const event = makeSessionEvent();
    const verifyStub = sinon.stub().resolves(event);
    fetchStub.resolves(new Response('{"order":{"id":"ord_123"}}'));

    const handler = (await esmock('../../../src/routes/webhooks/stripe.js', {
      '../../../src/utils/stripe.js': { verifyWebhookSignature: verifyStub },
    })).default;

    const request = createWebhookRequest(event);
    const resp = await handler(request, { env: WEBHOOK_ENV });

    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.equal(data.received, true);

    // Verify order was created
    assert(fetchStub.calledOnce);
    const [url, init] = fetchStub.firstCall.args;
    assert.ok(url.includes('/orders'));
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, `Bearer ${DEFAULT_ENV.API_TOKEN}`);

    const orderBody = JSON.parse(init.body);
    assert.equal(orderBody.customer.email, 'test@example.com');
    assert.equal(orderBody.shipping.address1, '123 Main St');
    assert.equal(orderBody.items[0].sku, 'SKU1');
    assert.equal(orderBody.items[0].name, 'Test Product');
    assert.equal(orderBody.items[0].quantity, 1);
    assert.equal(orderBody.items[0].price.final, '29.99');
    assert.equal(orderBody.items[0].price.currency, 'USD');
  });

  it('extracts urlKey from item URL', async () => {
    const event = makeSessionEvent();
    const verifyStub = sinon.stub().resolves(event);
    fetchStub.resolves(new Response('{"order":{}}'));

    const handler = (await esmock('../../../src/routes/webhooks/stripe.js', {
      '../../../src/utils/stripe.js': { verifyWebhookSignature: verifyStub },
    })).default;

    const request = createWebhookRequest(event);
    await handler(request, { env: WEBHOOK_ENV });

    const orderBody = JSON.parse(fetchStub.firstCall.args[1].body);
    assert.equal(orderBody.items[0].urlKey, 'sku1');
  });

  it('stores media reference in custom.image', async () => {
    const event = makeSessionEvent();
    const verifyStub = sinon.stub().resolves(event);
    fetchStub.resolves(new Response('{"order":{}}'));

    const handler = (await esmock('../../../src/routes/webhooks/stripe.js', {
      '../../../src/utils/stripe.js': { verifyWebhookSignature: verifyStub },
    })).default;

    const request = createWebhookRequest(event);
    await handler(request, { env: WEBHOOK_ENV });

    const orderBody = JSON.parse(fetchStub.firstCall.args[1].body);
    assert.equal(orderBody.items[0].custom.image, 'media_abc123.jpg');
    assert.equal(orderBody.items[0].custom.url, '/products/test-product/sku1');
  });

  it('does not create order when payment_status is not paid', async () => {
    const event = makeSessionEvent({ payment_status: 'unpaid' });
    const verifyStub = sinon.stub().resolves(event);

    const handler = (await esmock('../../../src/routes/webhooks/stripe.js', {
      '../../../src/utils/stripe.js': { verifyWebhookSignature: verifyStub },
    })).default;

    const request = createWebhookRequest(event);
    const resp = await handler(request, { env: WEBHOOK_ENV });

    assert.equal(resp.status, 200);
    assert(fetchStub.notCalled);
  });

  it('ignores non-checkout events', async () => {
    const event = { type: 'payment_intent.succeeded', data: { object: {} } };
    const verifyStub = sinon.stub().resolves(event);

    const handler = (await esmock('../../../src/routes/webhooks/stripe.js', {
      '../../../src/utils/stripe.js': { verifyWebhookSignature: verifyStub },
    })).default;

    const request = createWebhookRequest(event);
    const resp = await handler(request, { env: WEBHOOK_ENV });

    assert.equal(resp.status, 200);
    assert(fetchStub.notCalled);
  });

  it('returns 400 when stripe-signature header is missing', async () => {
    const handler = (await esmock('../../../src/routes/webhooks/stripe.js', {
      '../../../src/utils/stripe.js': { verifyWebhookSignature: sinon.stub() },
    })).default;

    const request = new Request('https://worker.example.com/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    const resp = await handler(request, { env: WEBHOOK_ENV });

    assert.equal(resp.status, 400);
    const data = await resp.json();
    assert.equal(data.error, 'Missing signature');
  });

  it('returns 400 when signature verification fails', async () => {
    const verifyStub = sinon.stub().rejects(new Error('Webhook signature verification failed'));

    const handler = (await esmock('../../../src/routes/webhooks/stripe.js', {
      '../../../src/utils/stripe.js': { verifyWebhookSignature: verifyStub },
    })).default;

    const request = createWebhookRequest('{}');
    const resp = await handler(request, { env: WEBHOOK_ENV });

    assert.equal(resp.status, 400);
    const data = await resp.json();
    assert.equal(data.error, 'Webhook signature verification failed');
  });

  it('returns 200 even if order creation fails', async () => {
    const event = makeSessionEvent();
    const verifyStub = sinon.stub().resolves(event);
    fetchStub.resolves(new Response('{"error":"fail"}', { status: 500 }));

    const consoleStub = sinon.stub(console, 'error');

    const handler = (await esmock('../../../src/routes/webhooks/stripe.js', {
      '../../../src/utils/stripe.js': { verifyWebhookSignature: verifyStub },
    })).default;

    const request = createWebhookRequest(event);
    const resp = await handler(request, { env: WEBHOOK_ENV });

    assert.equal(resp.status, 200);
    assert(consoleStub.calledOnce);
    consoleStub.restore();
  });

  it('handles items without image, url, or currency', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          payment_status: 'paid',
          metadata: {
            customer: JSON.stringify({ email: 'test@example.com' }),
            shipping: JSON.stringify({ name: 'Test' }),
            items: JSON.stringify([
              { sku: 'SKU1', name: 'Product', quantity: 1, price: 10 },
            ]),
          },
        },
      },
    };
    const verifyStub = sinon.stub().resolves(event);
    fetchStub.resolves(new Response('{"order":{}}'));

    const handler = (await esmock('../../../src/routes/webhooks/stripe.js', {
      '../../../src/utils/stripe.js': { verifyWebhookSignature: verifyStub },
    })).default;

    const request = createWebhookRequest(event);
    const resp = await handler(request, { env: WEBHOOK_ENV });

    assert.equal(resp.status, 200);
    const orderBody = JSON.parse(fetchStub.firstCall.args[1].body);
    assert.equal(orderBody.items[0].custom.image, '');
    assert.equal(orderBody.items[0].custom.url, '');
    assert.equal(orderBody.items[0].urlKey, '');
    assert.equal(orderBody.items[0].price.currency, 'USD');
  });

  it('passes webhook secret to verifyWebhookSignature', async () => {
    const event = { type: 'unknown_event', data: { object: {} } };
    const verifyStub = sinon.stub().resolves(event);

    const handler = (await esmock('../../../src/routes/webhooks/stripe.js', {
      '../../../src/utils/stripe.js': { verifyWebhookSignature: verifyStub },
    })).default;

    const request = createWebhookRequest(event, 't=123,v1=sig');
    await handler(request, { env: WEBHOOK_ENV });

    const [, , secret] = verifyStub.firstCall.args;
    assert.equal(secret, 'whsec_test_secret');
  });
});
