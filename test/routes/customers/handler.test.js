import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

describe('routes/customers/handler', () => {
  async function loadHandler(stubs = {}) {
    const profileStub = stubs.profile || sinon.stub().resolves(new Response('profile'));
    const ordersStub = stubs.orders || sinon.stub().resolves(new Response('orders'));

    const handler = (await esmock('../../../src/routes/customers/handler.js', {
      '../../../src/routes/customers/profile.js': { default: profileStub },
      '../../../src/routes/customers/orders.js': { default: ordersStub },
    })).default;

    return { handler, profileStub, ordersStub };
  }

  it('dispatches to profile when no subroute', async () => {
    const { handler, profileStub } = await loadHandler();
    const request = new Request('http://localhost/customers/a@b.com', { method: 'GET' });
    const ctx = { env: DEFAULT_ENV, params: { email: 'a@b.com' } };

    const resp = await handler(request, ctx);
    assert.equal(await resp.text(), 'profile');
    assert(profileStub.calledOnce);
  });

  it('dispatches to orders when subroute is orders', async () => {
    const { handler, ordersStub } = await loadHandler();
    const request = new Request('http://localhost/customers/a@b.com/orders', { method: 'GET' });
    const ctx = { env: DEFAULT_ENV, params: { email: 'a@b.com', subroute: 'orders' } };

    const resp = await handler(request, ctx);
    assert.equal(await resp.text(), 'orders');
    assert(ordersStub.calledOnce);
  });

  it('rejects non-GET methods', async () => {
    const { handler } = await loadHandler();
    const request = new Request('http://localhost/customers/a@b.com', { method: 'POST' });
    const ctx = { env: DEFAULT_ENV, params: { email: 'a@b.com' } };

    await assert.rejects(() => handler(request, ctx), { status: 405 });
  });

  it('rejects missing email', async () => {
    const { handler } = await loadHandler();
    const request = new Request('http://localhost/customers', { method: 'GET' });
    const ctx = { env: DEFAULT_ENV, params: {} };

    await assert.rejects(() => handler(request, ctx), { status: 400 });
  });

  it('rejects unknown subroute', async () => {
    const { handler } = await loadHandler();
    const request = new Request('http://localhost/customers/a@b.com/unknown', { method: 'GET' });
    const ctx = { env: DEFAULT_ENV, params: { email: 'a@b.com', subroute: 'unknown' } };

    await assert.rejects(() => handler(request, ctx), { status: 404 });
  });
});
