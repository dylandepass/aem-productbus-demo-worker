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

describe('routes/paypal/handler', () => {
  let fetchStub;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  describe('createPayPalOrder', () => {
    it('creates a PayPal order and returns its id', async () => {
      const paypalStub = sinon.stub().resolves({ id: 'PAYPAL-ORDER-123' });
      const { createPayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      const body = makeBody();
      const request = createRequest('https://worker.example.com/paypal/orders', body);
      const resp = await createPayPalOrder(request, { env: DEFAULT_ENV });

      assert.equal(resp.status, 200);
      const data = await resp.json();
      assert.equal(data.id, 'PAYPAL-ORDER-123');
    });

    it('sends correct PayPal order structure', async () => {
      const paypalStub = sinon.stub().resolves({ id: 'ORDER-1' });
      const { createPayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      const body = makeBody();
      const request = createRequest('https://worker.example.com/paypal/orders', body);
      await createPayPalOrder(request, { env: DEFAULT_ENV });

      const [endpoint, opts] = paypalStub.firstCall.args;
      assert.equal(endpoint, '/v2/checkout/orders');
      assert.equal(opts.body.intent, 'CAPTURE');

      const unit = opts.body.purchase_units[0];
      // Subtotal 29.99 < 150 → $10 shipping
      assert.equal(unit.amount.breakdown.shipping.value, '10.00');
      assert.equal(unit.amount.value, '39.99');
      assert.equal(unit.items[0].name, 'Test Product');
      assert.equal(unit.items[0].sku, 'SKU1');
      assert.equal(unit.shipping.address.address_line_1, '123 Main St');
    });

    it('sets free shipping for orders >= $150', async () => {
      const paypalStub = sinon.stub().resolves({ id: 'ORDER-1' });
      const { createPayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      const body = makeBody({ items: [{ sku: 'A', name: 'Expensive', quantity: 1, price: 200, currency: 'USD' }] });
      const request = createRequest('https://worker.example.com/paypal/orders', body);
      await createPayPalOrder(request, { env: DEFAULT_ENV });

      const unit = paypalStub.firstCall.args[1].body.purchase_units[0];
      assert.equal(unit.amount.breakdown.shipping.value, '0.00');
      assert.equal(unit.amount.value, '200.00');
    });

    it('creates order without customer or shipping (PayPal collects them)', async () => {
      const paypalStub = sinon.stub().resolves({ id: 'ORDER-NO-FORM' });
      const { createPayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      const body = {
        customer: {},
        shipping: {},
        items: [{ sku: 'A', name: 'Item', quantity: 1, price: 50, currency: 'USD' }],
      };
      const request = createRequest('https://worker.example.com/paypal/orders', body);
      const resp = await createPayPalOrder(request, { env: DEFAULT_ENV });

      assert.equal(resp.status, 200);
      const data = await resp.json();
      assert.equal(data.id, 'ORDER-NO-FORM');

      // Should not include shipping address in PayPal order
      const unit = paypalStub.firstCall.args[1].body.purchase_units[0];
      assert.equal(unit.shipping, undefined);
    });

    it('throws 400 when items are empty', async () => {
      const { createPayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: sinon.stub() },
      });

      const body = makeBody({ items: [] });
      const request = createRequest('https://worker.example.com/paypal/orders', body);

      await assert.rejects(
        () => createPayPalOrder(request, { env: DEFAULT_ENV }),
        { status: 400 },
      );
    });

    it('throws 502 when PayPal returns an error', async () => {
      const paypalStub = sinon.stub().rejects(new Error('Invalid request'));
      const { createPayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      const request = createRequest('https://worker.example.com/paypal/orders', makeBody());

      await assert.rejects(
        () => createPayPalOrder(request, { env: DEFAULT_ENV }),
        (err) => {
          assert.equal(err.status, 502);
          assert.ok(err.message.includes('PayPal error'));
          return true;
        },
      );
    });
  });

  describe('capturePayPalOrder', () => {
    it('captures payment and creates Commerce API order', async () => {
      const paypalStub = sinon.stub().resolves({
        id: 'ORDER-1',
        status: 'COMPLETED',
        purchase_units: [{
          payments: {
            captures: [{ amount: { value: '39.99', currency_code: 'USD' } }],
          },
        }],
      });
      fetchStub.resolves(new Response(JSON.stringify({ order: { id: 'api-order-1' } })));

      const { capturePayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      const body = makeBody();
      const request = createRequest('https://worker.example.com/paypal/orders/ORDER-1/capture', body);
      const resp = await capturePayPalOrder(request, {
        env: DEFAULT_ENV,
        params: { orderId: 'ORDER-1' },
      });

      assert.equal(resp.status, 200);
      const data = await resp.json();
      assert.equal(data.status, 'COMPLETED');
      assert.equal(data.paypal_order_id, 'ORDER-1');
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

    it('uses PayPal payer info when customer/shipping not provided', async () => {
      const paypalStub = sinon.stub().resolves({
        id: 'ORDER-2',
        status: 'COMPLETED',
        payer: {
          email_address: 'paypal-buyer@example.com',
          name: { given_name: 'PayPal', surname: 'Buyer' },
        },
        purchase_units: [{
          shipping: {
            name: { full_name: 'PayPal Buyer' },
            address: {
              address_line_1: '456 PayPal Ave',
              admin_area_2: 'San Jose',
              admin_area_1: 'CA',
              postal_code: '95131',
              country_code: 'US',
            },
          },
          payments: {
            captures: [{ amount: { value: '39.99', currency_code: 'USD' } }],
          },
        }],
      });
      fetchStub.resolves(new Response(JSON.stringify({ order: { id: 'api-order-2' } })));

      const { capturePayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      // Send only items — no customer or shipping
      const body = {
        items: [{ sku: 'SKU1', name: 'Test', quantity: 1, price: 29.99, currency: 'USD', image: '', url: '/test' }],
      };
      const request = createRequest('https://worker.example.com/paypal/orders/ORDER-2/capture', body);
      const resp = await capturePayPalOrder(request, {
        env: DEFAULT_ENV,
        params: { orderId: 'ORDER-2' },
      });

      const data = await resp.json();
      assert.equal(data.customer_email, 'paypal-buyer@example.com');

      // Verify Commerce API got PayPal payer info
      const orderBody = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.equal(orderBody.customer.email, 'paypal-buyer@example.com');
      assert.equal(orderBody.customer.firstName, 'PayPal');
      assert.equal(orderBody.shipping.address1, '456 PayPal Ave');
      assert.equal(orderBody.shipping.city, 'San Jose');
      assert.equal(orderBody.shipping.state, 'CA');
    });

    it('throws 400 when items are missing', async () => {
      const { capturePayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: sinon.stub() },
      });

      const request = createRequest('https://worker.example.com/paypal/orders/ORDER-1/capture', { items: [] });

      await assert.rejects(
        () => capturePayPalOrder(request, { env: DEFAULT_ENV, params: { orderId: 'ORDER-1' } }),
        { status: 400 },
      );
    });

    it('throws 400 when capture status is not COMPLETED', async () => {
      const paypalStub = sinon.stub().resolves({ id: 'ORDER-1', status: 'PENDING' });
      const { capturePayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      const request = createRequest('https://worker.example.com/paypal/orders/ORDER-1/capture', makeBody());

      await assert.rejects(
        () => capturePayPalOrder(request, { env: DEFAULT_ENV, params: { orderId: 'ORDER-1' } }),
        (err) => {
          assert.equal(err.status, 400);
          assert.ok(err.message.includes('not completed'));
          return true;
        },
      );
    });

    it('throws 502 when PayPal capture fails', async () => {
      const paypalStub = sinon.stub().rejects(new Error('Capture failed'));
      const { capturePayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      const request = createRequest('https://worker.example.com/paypal/orders/ORDER-1/capture', makeBody());

      await assert.rejects(
        () => capturePayPalOrder(request, { env: DEFAULT_ENV, params: { orderId: 'ORDER-1' } }),
        { status: 502 },
      );
    });

    it('still returns response when Commerce API order creation fails', async () => {
      const paypalStub = sinon.stub().resolves({
        id: 'ORDER-1',
        status: 'COMPLETED',
        purchase_units: [{
          payments: {
            captures: [{ amount: { value: '39.99', currency_code: 'USD' } }],
          },
        }],
      });
      fetchStub.resolves(new Response('{"error":"fail"}', { status: 500 }));
      const consoleStub = sinon.stub(console, 'error');

      const { capturePayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      const request = createRequest('https://worker.example.com/paypal/orders/ORDER-1/capture', makeBody());
      const resp = await capturePayPalOrder(request, {
        env: DEFAULT_ENV,
        params: { orderId: 'ORDER-1' },
      });

      assert.equal(resp.status, 200);
      const data = await resp.json();
      assert.equal(data.status, 'COMPLETED');
      assert.equal(data.order, undefined);
      assert(consoleStub.calledOnce);
      consoleStub.restore();
    });
  });

  describe('getPayPalOrder', () => {
    it('returns order details in confirmation-compatible shape', async () => {
      const paypalStub = sinon.stub().resolves({
        id: 'ORDER-1',
        status: 'COMPLETED',
        payer: { email_address: 'buyer@example.com' },
        purchase_units: [{
          amount: { value: '39.99', currency_code: 'USD' },
          payments: {
            captures: [{ amount: { value: '39.99', currency_code: 'USD' } }],
          },
        }],
      });

      const { getPayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      const request = new Request('https://worker.example.com/paypal/orders/ORDER-1');
      const resp = await getPayPalOrder(request, {
        env: DEFAULT_ENV,
        params: { orderId: 'ORDER-1' },
      });

      assert.equal(resp.status, 200);
      const data = await resp.json();
      assert.equal(data.id, 'ORDER-1');
      assert.equal(data.payment_status, 'paid');
      assert.equal(data.customer_email, 'buyer@example.com');
      assert.equal(data.amount_total, 3999);
      assert.equal(data.currency, 'usd');
    });

    it('returns unpaid status for non-COMPLETED orders', async () => {
      const paypalStub = sinon.stub().resolves({
        id: 'ORDER-1',
        status: 'CREATED',
        purchase_units: [{ amount: { value: '10.00', currency_code: 'USD' } }],
      });

      const { getPayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      const request = new Request('https://worker.example.com/paypal/orders/ORDER-1');
      const resp = await getPayPalOrder(request, {
        env: DEFAULT_ENV,
        params: { orderId: 'ORDER-1' },
      });

      const data = await resp.json();
      assert.equal(data.payment_status, 'unpaid');
    });

    it('throws 502 when PayPal fetch fails', async () => {
      const paypalStub = sinon.stub().rejects(new Error('Not found'));
      const { getPayPalOrder } = await esmock('../../../src/routes/paypal/handler.js', {
        '../../../src/utils/paypal.js': { paypalRequest: paypalStub },
      });

      const request = new Request('https://worker.example.com/paypal/orders/ORDER-BAD');

      await assert.rejects(
        () => getPayPalOrder(request, { env: DEFAULT_ENV, params: { orderId: 'ORDER-BAD' } }),
        { status: 502 },
      );
    });
  });
});
