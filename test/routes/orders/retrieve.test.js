import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

describe('routes/orders/retrieve', () => {
  it('proxies order retrieval with auto auth', async () => {
    const proxyFetch = sinon.stub().resolves(new Response('{"order":{"id":"abc"}}'));
    const retrieveOrder = (await esmock('../../../src/routes/orders/retrieve.js', {
      '../../../src/utils/proxy.js': { apiBase: () => 'https://api/org/sites/site', proxyFetch },
    })).default;

    const request = new Request('http://localhost/orders/abc', { method: 'GET' });

    const resp = await retrieveOrder(request, {
      env: DEFAULT_ENV,
      params: { orderId: 'abc' },
    });
    assert.ok(resp);

    const [url, , opts] = proxyFetch.firstCall.args;
    assert.equal(url, 'https://api/org/sites/site/orders/abc');
    assert.equal(opts.auth, 'auto');
  });
});
