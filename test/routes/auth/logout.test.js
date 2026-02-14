import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

describe('routes/auth/logout', () => {
  it('proxies logout with user auth', async () => {
    const proxyFetch = sinon.stub().resolves(new Response('{}'));
    const logout = (await esmock('../../../src/routes/auth/logout.js', {
      '../../../src/utils/proxy.js': { apiBase: () => 'https://api/org/sites/site', proxyFetch },
    })).default;

    const request = new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt123' },
    });

    const resp = await logout(request, { env: DEFAULT_ENV });
    assert.ok(resp);
    assert(proxyFetch.calledOnce);

    const [url, , opts] = proxyFetch.firstCall.args;
    assert.equal(url, 'https://api/org/sites/site/auth/logout');
    assert.equal(opts.auth, 'user');
  });
});
