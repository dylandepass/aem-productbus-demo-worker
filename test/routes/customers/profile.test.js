import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

describe('routes/customers/profile', () => {
  it('proxies customer profile with auto auth', async () => {
    const proxyFetch = sinon.stub().resolves(new Response('{"customer":{}}'));
    const customerProfile = (await esmock('../../../src/routes/customers/profile.js', {
      '../../../src/utils/proxy.js': { apiBase: () => 'https://api/org/sites/site', proxyFetch },
    })).default;

    const request = new Request('http://localhost/customers/a@b.com', { method: 'GET' });

    const resp = await customerProfile(request, {
      env: DEFAULT_ENV,
      params: { email: 'a@b.com' },
    });
    assert.ok(resp);

    const [url, , opts] = proxyFetch.firstCall.args;
    assert.equal(url, 'https://api/org/sites/site/customers/a@b.com');
    assert.equal(opts.auth, 'auto');
  });
});
