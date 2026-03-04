import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { paypalRequest, clearTokenCache } from '../../src/utils/paypal.js';

describe('utils/paypal', () => {
  let fetchStub;

  beforeEach(() => {
    clearTokenCache();
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  function mockTokenResponse(token = 'test-access-token', expiresIn = 32400) {
    return new Response(JSON.stringify({
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
    }));
  }

  it('fetches an access token and makes an authenticated request', async () => {
    fetchStub.onFirstCall().resolves(mockTokenResponse());
    fetchStub.onSecondCall().resolves(new Response(JSON.stringify({ id: 'ORDER-123' })));

    const result = await paypalRequest('/v2/checkout/orders', {
      clientId: 'client-id',
      secret: 'client-secret',
      body: { intent: 'CAPTURE' },
    });

    assert.equal(result.id, 'ORDER-123');

    // Token request
    const [tokenUrl, tokenInit] = fetchStub.firstCall.args;
    assert.ok(tokenUrl.includes('/v1/oauth2/token'));
    assert.equal(tokenInit.method, 'POST');
    assert.ok(tokenInit.headers.Authorization.startsWith('Basic '));

    // API request
    const [apiUrl, apiInit] = fetchStub.secondCall.args;
    assert.ok(apiUrl.includes('/v2/checkout/orders'));
    assert.equal(apiInit.headers.Authorization, 'Bearer test-access-token');
    assert.equal(apiInit.method, 'POST');
  });

  it('caches the access token across calls', async () => {
    fetchStub.onFirstCall().resolves(mockTokenResponse());
    fetchStub.onSecondCall().resolves(new Response(JSON.stringify({ id: 'ORDER-1' })));
    fetchStub.onThirdCall().resolves(new Response(JSON.stringify({ id: 'ORDER-2' })));

    await paypalRequest('/v2/checkout/orders', {
      clientId: 'client-id',
      secret: 'client-secret',
      body: {},
    });

    await paypalRequest('/v2/checkout/orders/ORDER-1', {
      clientId: 'client-id',
      secret: 'client-secret',
      method: 'GET',
    });

    // Only one token request, two API requests
    assert.equal(fetchStub.callCount, 3);
    assert.ok(fetchStub.firstCall.args[0].includes('/v1/oauth2/token'));
    assert.ok(fetchStub.secondCall.args[0].includes('/v2/checkout/orders'));
    assert.ok(fetchStub.thirdCall.args[0].includes('/v2/checkout/orders/ORDER-1'));
  });

  it('throws on OAuth error', async () => {
    fetchStub.resolves(new Response(JSON.stringify({
      error: 'invalid_client',
      error_description: 'Client Authentication failed',
    }), { status: 401 }));

    await assert.rejects(
      () => paypalRequest('/v2/checkout/orders', {
        clientId: 'bad-id',
        secret: 'bad-secret',
        body: {},
      }),
      (err) => {
        assert.equal(err.message, 'Client Authentication failed');
        return true;
      },
    );
  });

  it('throws on API error response', async () => {
    fetchStub.onFirstCall().resolves(mockTokenResponse());
    fetchStub.onSecondCall().resolves(new Response(JSON.stringify({
      name: 'INVALID_REQUEST',
      message: 'Request is not well-formed',
      details: [{ description: 'Missing required field' }],
    }), { status: 400 }));

    await assert.rejects(
      () => paypalRequest('/v2/checkout/orders', {
        clientId: 'client-id',
        secret: 'client-secret',
        body: {},
      }),
      (err) => {
        assert.equal(err.message, 'Request is not well-formed');
        assert.equal(err.status, 400);
        return true;
      },
    );
  });

  it('does not send body for GET requests', async () => {
    fetchStub.onFirstCall().resolves(mockTokenResponse());
    fetchStub.onSecondCall().resolves(new Response(JSON.stringify({ id: 'ORDER-1', status: 'COMPLETED' })));

    await paypalRequest('/v2/checkout/orders/ORDER-1', {
      clientId: 'client-id',
      secret: 'client-secret',
      method: 'GET',
    });

    const [, apiInit] = fetchStub.secondCall.args;
    assert.equal(apiInit.method, 'GET');
    assert.equal(apiInit.body, undefined);
  });
});
