import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

describe('routes/auth/login', () => {
  it('proxies login as public', async () => {
    const proxyFetch = sinon.stub().resolves(new Response('{"ok":true}'));
    const login = (await esmock('../../../src/routes/auth/login.js', {
      '../../../src/utils/proxy.js': { apiBase: () => 'https://api/org/sites/site', proxyFetch },
    })).default;

    const request = new Request('http://localhost/auth/login', {
      method: 'POST',
      body: '{"email":"a@b.com"}',
    });

    const resp = await login(request, { env: DEFAULT_ENV });
    assert.ok(resp);
    assert(proxyFetch.calledOnce);

    const [url, , opts] = proxyFetch.firstCall.args;
    assert.equal(url, 'https://api/org/sites/site/auth/login');
    assert.equal(opts.auth, 'public');
  });
});
