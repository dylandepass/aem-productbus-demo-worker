import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { DEFAULT_ENV } from './fixtures/context.js';
import worker from '../src/index.js';

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
});
