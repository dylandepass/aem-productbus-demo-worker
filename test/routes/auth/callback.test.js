import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

describe('routes/auth/callback', () => {
  it('extracts JWT from Set-Cookie and adds to response body', async () => {
    const upstream = new Response(JSON.stringify({ email: 'a@b.com', roles: ['user'] }), {
      status: 200,
      headers: { 'Set-Cookie': 'auth_token=jwt123; Path=/; HttpOnly' },
    });
    const proxyFetch = sinon.stub().resolves(upstream);
    const callback = (await esmock('../../../src/routes/auth/callback.js', {
      '../../../src/utils/proxy.js': { apiBase: () => 'https://api/org/sites/site', proxyFetch },
    })).default;

    const request = new Request('http://localhost/auth/callback', {
      method: 'POST',
      body: '{"email":"a@b.com","code":"123456"}',
    });

    const resp = await callback(request, { env: DEFAULT_ENV });
    assert.equal(resp.status, 200);
    const body = await resp.json();
    assert.equal(body.token, 'jwt123');
    assert.equal(body.email, 'a@b.com');
  });

  it('returns null token when no Set-Cookie', async () => {
    const upstream = new Response(JSON.stringify({ email: 'a@b.com' }), { status: 200 });
    const proxyFetch = sinon.stub().resolves(upstream);
    const callback = (await esmock('../../../src/routes/auth/callback.js', {
      '../../../src/utils/proxy.js': { apiBase: () => 'https://api/org/sites/site', proxyFetch },
    })).default;

    const request = new Request('http://localhost/auth/callback', {
      method: 'POST',
      body: '{"email":"a@b.com","code":"123456"}',
    });

    const resp = await callback(request, { env: DEFAULT_ENV });
    const body = await resp.json();
    assert.equal(body.token, null);
  });

  it('passes through upstream errors', async () => {
    const upstream = new Response('{"error":"invalid code"}', { status: 401 });
    const proxyFetch = sinon.stub().resolves(upstream);
    const callback = (await esmock('../../../src/routes/auth/callback.js', {
      '../../../src/utils/proxy.js': { apiBase: () => 'https://api/org/sites/site', proxyFetch },
    })).default;

    const request = new Request('http://localhost/auth/callback', {
      method: 'POST',
      body: '{"email":"a@b.com","code":"000000"}',
    });

    const resp = await callback(request, { env: DEFAULT_ENV });
    assert.equal(resp.status, 401);
    const body = await resp.json();
    assert.equal(body.error, 'invalid code');
  });
});
