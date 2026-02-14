import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

describe('routes/orders/handler', () => {
  async function loadHandler(stubs = {}) {
    const createStub = stubs.create || sinon.stub().resolves(new Response('created'));
    const retrieveStub = stubs.retrieve || sinon.stub().resolves(new Response('retrieved'));

    const handler = (await esmock('../../../src/routes/orders/handler.js', {
      '../../../src/routes/orders/create.js': { default: createStub },
      '../../../src/routes/orders/retrieve.js': { default: retrieveStub },
    })).default;

    return { handler, createStub, retrieveStub };
  }

  it('dispatches POST without orderId to create', async () => {
    const { handler, createStub } = await loadHandler();
    const request = new Request('http://localhost/orders', { method: 'POST', body: '{}' });
    const ctx = { env: DEFAULT_ENV, params: {} };

    const resp = await handler(request, ctx);
    assert.equal(await resp.text(), 'created');
    assert(createStub.calledOnce);
  });

  it('dispatches GET with orderId to retrieve', async () => {
    const { handler, retrieveStub } = await loadHandler();
    const request = new Request('http://localhost/orders/abc', { method: 'GET' });
    const ctx = { env: DEFAULT_ENV, params: { orderId: 'abc' } };

    const resp = await handler(request, ctx);
    assert.equal(await resp.text(), 'retrieved');
    assert(retrieveStub.calledOnce);
  });

  it('rejects GET without orderId', async () => {
    const { handler } = await loadHandler();
    const request = new Request('http://localhost/orders', { method: 'GET' });
    const ctx = { env: DEFAULT_ENV, params: {} };

    await assert.rejects(() => handler(request, ctx), { status: 405 });
  });

  it('rejects PUT method', async () => {
    const { handler } = await loadHandler();
    const request = new Request('http://localhost/orders', { method: 'PUT' });
    const ctx = { env: DEFAULT_ENV, params: {} };

    await assert.rejects(() => handler(request, ctx), { status: 405 });
  });
});
