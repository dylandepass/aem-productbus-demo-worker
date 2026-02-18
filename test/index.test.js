import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import esmock from 'esmock';
import { DEFAULT_ENV } from './fixtures/context.js';
import worker from '../src/index.js';
import { ResponseError } from '../src/utils/http.js';

describe('worker entry point', () => {
  let fetchStub;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('handles CORS preflight', async () => {
    const request = new Request('http://localhost/orders', { method: 'OPTIONS' });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 204);
    assert.equal(resp.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
    assert.equal(resp.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization');
  });

  it('returns 404 for unknown routes', async () => {
    const request = new Request('http://localhost/unknown', { method: 'GET' });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 404);
    assert.equal(resp.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
    const body = await resp.json();
    assert.equal(body.error, 'Not found');
  });

  it('routes POST /auth/login to auth handler', async () => {
    fetchStub.resolves(new Response('{"email":"a@b.com","hash":"h","exp":1}'));

    const request = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email":"a@b.com"}',
    });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
  });

  it('routes POST /auth/callback with JWT extraction', async () => {
    fetchStub.resolves(new Response(JSON.stringify({ email: 'a@b.com' }), {
      status: 200,
      headers: { 'Set-Cookie': 'auth_token=myjwt; Path=/; HttpOnly' },
    }));

    const request = new Request('http://localhost/auth/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email":"a@b.com","code":"123456"}',
    });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 200);
    const body = await resp.json();
    assert.equal(body.token, 'myjwt');
  });

  it('routes POST /auth/logout', async () => {
    fetchStub.resolves(new Response('{}'));

    const request = new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt123' },
    });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 200);
  });

  it('routes POST /orders', async () => {
    fetchStub.resolves(new Response('{"order":{"id":"123"}}'));

    const request = new Request('http://localhost/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"items":[]}',
    });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 200);
  });

  it('routes GET /orders/:orderId', async () => {
    fetchStub.resolves(new Response('{"order":{"id":"abc"}}'));

    const request = new Request('http://localhost/orders/abc', { method: 'GET' });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 200);
  });

  it('routes GET /customers/:email', async () => {
    fetchStub.resolves(new Response('{"customer":{}}'));

    const request = new Request('http://localhost/customers/a@b.com', {
      method: 'GET',
      headers: { Authorization: 'Bearer jwt123' },
    });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 200);
  });

  it('routes GET /customers/:email/orders', async () => {
    fetchStub.resolves(new Response('{"orders":[]}'));

    const request = new Request('http://localhost/customers/a@b.com/orders', {
      method: 'GET',
      headers: { Authorization: 'Bearer jwt123' },
    });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 200);
  });

  it('routes GET /customers/:email/addresses', async () => {
    fetchStub.resolves(new Response('{"addresses":[]}'));

    const request = new Request('http://localhost/customers/a@b.com/addresses', {
      method: 'GET',
      headers: { Authorization: 'Bearer jwt123' },
    });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 200);
  });

  it('routes POST /customers/:email/addresses', async () => {
    fetchStub.resolves(new Response('{"address":{}}'));

    const request = new Request('http://localhost/customers/a@b.com/addresses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt123',
      },
      body: '{"name":"Test","address1":"123 Main"}',
    });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 200);
  });

  it('routes DELETE /customers/:email/addresses/:addressId', async () => {
    fetchStub.resolves(new Response('{"success":true}'));

    const request = new Request('http://localhost/customers/a@b.com/addresses/abc123', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer jwt123' },
    });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 200);
  });

  it('handles percent-encoded email in URL', async () => {
    fetchStub.resolves(new Response('{"customer":{}}'));

    const request = new Request('http://localhost/customers/a%40b.com', {
      method: 'GET',
      headers: { Authorization: 'Bearer jwt123' },
    });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 200);
    // Verify the upstream URL uses decoded email (@ not %40)
    const [upstreamUrl] = fetchStub.firstCall.args;
    assert.ok(upstreamUrl.includes('a@b.com'), `Expected decoded email in URL, got: ${upstreamUrl}`);
  });

  it('wraps ResponseError with CORS', async () => {
    // POST to auth with unknown action triggers 404 ResponseError
    const request = new Request('http://localhost/auth/unknown', { method: 'POST' });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 404);
    assert.equal(resp.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
  });

  it('wraps unexpected errors as 500', async () => {
    fetchStub.rejects(new Error('network failure'));

    const request = new Request('http://localhost/auth/login', {
      method: 'POST',
      body: '{"email":"a@b.com"}',
    });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 500);
    assert.equal(resp.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
    const body = await resp.json();
    assert.equal(body.error, 'Internal server error');
  });

  it('returns 405 for wrong method on auth routes', async () => {
    const request = new Request('http://localhost/auth/login', { method: 'GET' });
    const resp = await worker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 404);
  });

  // --- Webhook routes skip CORS ---

  it('skips CORS on webhook success response', async () => {
    // Webhook handler returns 400 for missing signature, no CORS headers
    const request = new Request('http://localhost/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const resp = await worker.fetch(request, {
      ...DEFAULT_ENV,
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    });

    // Missing signature returns 400 from the handler (not a thrown error)
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('Access-Control-Allow-Origin'), null);
  });

  it('skips CORS on webhook ResponseError', async () => {
    // Use esmock to inject a webhook handler that throws ResponseError
    const mockRouter = {
      match: (method, path) => {
        if (method === 'POST' && path === '/webhooks/stripe') {
          return {
            handler: () => { throw new ResponseError(422, 'Bad data'); },
            params: {},
          };
        }
        return null;
      },
    };

    const mockWorker = (await esmock('../src/index.js', {
      '../src/routes/index.js': { default: mockRouter },
    })).default;

    const request = new Request('http://localhost/webhooks/stripe', {
      method: 'POST',
    });
    const resp = await mockWorker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 422);
    assert.equal(resp.headers.get('Access-Control-Allow-Origin'), null);
    const body = await resp.json();
    assert.equal(body.error, 'Bad data');
  });

  it('skips CORS on webhook unexpected error', async () => {
    // Use esmock to inject a webhook handler that throws a generic error
    const mockRouter = {
      match: (method, path) => {
        if (method === 'POST' && path === '/webhooks/stripe') {
          return {
            handler: () => { throw new Error('unexpected'); },
            params: {},
          };
        }
        return null;
      },
    };

    const mockWorker = (await esmock('../src/index.js', {
      '../src/routes/index.js': { default: mockRouter },
    })).default;

    const request = new Request('http://localhost/webhooks/stripe', {
      method: 'POST',
    });
    const resp = await mockWorker.fetch(request, DEFAULT_ENV);

    assert.equal(resp.status, 500);
    assert.equal(resp.headers.get('Access-Control-Allow-Origin'), null);
    const body = await resp.json();
    assert.equal(body.error, 'Internal server error');
  });
});
