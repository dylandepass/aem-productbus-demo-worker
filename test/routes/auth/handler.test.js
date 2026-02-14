import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

describe('routes/auth/handler', () => {
  async function loadHandler(stubs = {}) {
    const loginStub = stubs.login || sinon.stub().resolves(new Response('login'));
    const callbackStub = stubs.callback || sinon.stub().resolves(new Response('callback'));
    const logoutStub = stubs.logout || sinon.stub().resolves(new Response('logout'));

    const handler = (await esmock('../../../src/routes/auth/handler.js', {
      '../../../src/routes/auth/login.js': { default: loginStub },
      '../../../src/routes/auth/callback.js': { default: callbackStub },
      '../../../src/routes/auth/logout.js': { default: logoutStub },
    })).default;

    return { handler, loginStub, callbackStub, logoutStub };
  }

  it('dispatches to login', async () => {
    const { handler, loginStub } = await loadHandler();
    const request = new Request('http://localhost/auth/login', { method: 'POST' });
    const ctx = { env: DEFAULT_ENV, params: { action: 'login' } };

    const resp = await handler(request, ctx);
    assert.equal(await resp.text(), 'login');
    assert(loginStub.calledOnce);
  });

  it('dispatches to callback', async () => {
    const { handler, callbackStub } = await loadHandler();
    const request = new Request('http://localhost/auth/callback', { method: 'POST' });
    const ctx = { env: DEFAULT_ENV, params: { action: 'callback' } };

    const resp = await handler(request, ctx);
    assert.equal(await resp.text(), 'callback');
    assert(callbackStub.calledOnce);
  });

  it('dispatches to logout', async () => {
    const { handler, logoutStub } = await loadHandler();
    const request = new Request('http://localhost/auth/logout', { method: 'POST' });
    const ctx = { env: DEFAULT_ENV, params: { action: 'logout' } };

    const resp = await handler(request, ctx);
    assert.equal(await resp.text(), 'logout');
    assert(logoutStub.calledOnce);
  });

  it('rejects non-POST methods', async () => {
    const { handler } = await loadHandler();
    const request = new Request('http://localhost/auth/login', { method: 'GET' });
    const ctx = { env: DEFAULT_ENV, params: { action: 'login' } };

    await assert.rejects(() => handler(request, ctx), { status: 405 });
  });

  it('rejects unknown action', async () => {
    const { handler } = await loadHandler();
    const request = new Request('http://localhost/auth/unknown', { method: 'POST' });
    const ctx = { env: DEFAULT_ENV, params: { action: 'unknown' } };

    await assert.rejects(() => handler(request, ctx), { status: 404 });
  });
});
