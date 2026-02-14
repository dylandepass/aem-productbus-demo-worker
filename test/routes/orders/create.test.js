import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

describe('routes/orders/create', () => {
  it('proxies order creation with auto auth', async () => {
    const proxyFetch = sinon.stub().resolves(new Response('{"order":{"id":"123"}}'));
    const createOrder = (await esmock('../../../src/routes/orders/create.js', {
      '../../../src/utils/proxy.js': { apiBase: () => 'https://api/org/sites/site', proxyFetch },
    })).default;

    const request = new Request('http://localhost/orders', {
      method: 'POST',
      body: '{"items":[]}',
    });

    const resp = await createOrder(request, { env: DEFAULT_ENV });
    assert.ok(resp);

    const [url, , opts] = proxyFetch.firstCall.args;
    assert.equal(url, 'https://api/org/sites/site/orders');
    assert.equal(opts.auth, 'auto');
  });
});
