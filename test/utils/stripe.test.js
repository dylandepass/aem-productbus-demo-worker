import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { stripeRequest, verifyWebhookSignature } from '../../src/utils/stripe.js';

describe('utils/stripe', () => {
  describe('stripeRequest', () => {
    let fetchStub;

    beforeEach(() => {
      fetchStub = sinon.stub(globalThis, 'fetch');
    });

    afterEach(() => {
      fetchStub.restore();
    });

    it('sends POST with form-encoded body', async () => {
      fetchStub.resolves(new Response(JSON.stringify({ id: 'cs_123' })));

      const result = await stripeRequest('/checkout/sessions', {
        secretKey: 'sk_test_abc',
        params: { mode: 'payment', customer_email: 'a@b.com' },
      });

      assert.equal(result.id, 'cs_123');
      assert(fetchStub.calledOnce);

      const [url, init] = fetchStub.firstCall.args;
      assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.Authorization, 'Bearer sk_test_abc');
      assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.ok(init.body.includes('mode=payment'));
      assert.ok(init.body.includes('customer_email=a%40b.com'));
    });

    it('sends GET without body', async () => {
      fetchStub.resolves(new Response(JSON.stringify({ id: 'cs_123', status: 'complete' })));

      const result = await stripeRequest('/checkout/sessions/cs_123', {
        secretKey: 'sk_test_abc',
        method: 'GET',
      });

      assert.equal(result.status, 'complete');

      const [url, init] = fetchStub.firstCall.args;
      assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions/cs_123');
      assert.equal(init.method, 'GET');
      assert.equal(init.headers.Authorization, 'Bearer sk_test_abc');
      assert.equal(init.body, undefined);
      assert.equal(init.headers['Content-Type'], undefined);
    });

    it('throws on Stripe error response', async () => {
      fetchStub.resolves(new Response(JSON.stringify({
        error: {
          message: 'Invalid API Key',
          type: 'authentication_error',
          code: 'api_key_invalid',
        },
      })));

      await assert.rejects(
        () => stripeRequest('/checkout/sessions', { secretKey: 'bad_key', params: {} }),
        (err) => {
          assert.equal(err.message, 'Invalid API Key');
          assert.equal(err.type, 'authentication_error');
          assert.equal(err.code, 'api_key_invalid');
          return true;
        },
      );
    });

    it('does not include body for POST without params', async () => {
      fetchStub.resolves(new Response(JSON.stringify({ ok: true })));

      await stripeRequest('/test', { secretKey: 'sk_test_abc' });

      const [, init] = fetchStub.firstCall.args;
      assert.equal(init.method, 'POST');
      assert.equal(init.body, undefined);
    });
  });

  describe('verifyWebhookSignature', () => {
    const SECRET = 'whsec_test_secret';

    async function computeSignature(payload, timestamp, secret) {
      const signedPayload = `${timestamp}.${payload}`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
      return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    it('verifies valid signature and returns parsed event', async () => {
      const event = { type: 'checkout.session.completed', data: { object: {} } };
      const payload = JSON.stringify(event);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await computeSignature(payload, timestamp, SECRET);

      const result = await verifyWebhookSignature(
        payload,
        `t=${timestamp},v1=${signature}`,
        SECRET,
      );

      assert.deepEqual(result, event);
    });

    it('throws on invalid signature', async () => {
      const payload = '{"type":"test"}';
      const timestamp = Math.floor(Date.now() / 1000);

      await assert.rejects(
        () => verifyWebhookSignature(payload, `t=${timestamp},v1=badsig`, SECRET),
        { message: 'Webhook signature verification failed' },
      );
    });

    it('throws on expired timestamp', async () => {
      const payload = '{"type":"test"}';
      const timestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const signature = await computeSignature(payload, timestamp, SECRET);

      await assert.rejects(
        () => verifyWebhookSignature(payload, `t=${timestamp},v1=${signature}`, SECRET),
        { message: 'Webhook timestamp outside tolerance' },
      );
    });

    it('throws on missing timestamp', async () => {
      await assert.rejects(
        () => verifyWebhookSignature('{}', 'v1=abc123', SECRET),
        { message: 'Invalid Stripe signature header' },
      );
    });

    it('throws on missing signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      await assert.rejects(
        () => verifyWebhookSignature('{}', `t=${timestamp}`, SECRET),
        { message: 'Invalid Stripe signature header' },
      );
    });

    it('accepts timestamp within tolerance', async () => {
      const event = { type: 'test' };
      const payload = JSON.stringify(event);
      const timestamp = Math.floor(Date.now() / 1000) - 200; // 200 seconds ago (within 300s)
      const signature = await computeSignature(payload, timestamp, SECRET);

      const result = await verifyWebhookSignature(
        payload,
        `t=${timestamp},v1=${signature}`,
        SECRET,
      );

      assert.deepEqual(result, event);
    });

    it('respects custom tolerance', async () => {
      const payload = '{"type":"test"}';
      const timestamp = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
      const signature = await computeSignature(payload, timestamp, SECRET);

      // 5 second tolerance — should reject 10-second-old timestamp
      await assert.rejects(
        () => verifyWebhookSignature(payload, `t=${timestamp},v1=${signature}`, SECRET, 5),
        { message: 'Webhook timestamp outside tolerance' },
      );
    });
  });
});
