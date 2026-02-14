import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

describe('routes/customers/orders', () => {
  it('proxies customer orders with auto auth', async () => {
    const proxyFetch = sinon.stub().resolves(new Response('{"orders":[]}'));
    const customerOrders = (await esmock('../../../src/routes/customers/orders.js', {
      '../../../src/utils/proxy.js': { apiBase: () => 'https://api/org/sites/site', proxyFetch },
    })).default;

    const request = new Request('http://localhost/customers/a@b.com/orders', { method: 'GET' });

    const resp = await customerOrders(request, {
      env: DEFAULT_ENV,
      params: { email: 'a@b.com', subroute: 'orders' },
    });
    assert.ok(resp);

    const [url, , opts] = proxyFetch.firstCall.args;
    assert.equal(url, 'https://api/org/sites/site/customers/a@b.com/orders');
    assert.equal(opts.auth, 'auto');
  });
});
