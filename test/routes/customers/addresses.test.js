import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import sinon from 'sinon';
import { DEFAULT_ENV } from '../../fixtures/context.js';

describe('routes/customers/addresses', () => {
  it('proxies GET list addresses with auto auth', async () => {
    const proxyFetch = sinon.stub().resolves(new Response('{"addresses":[]}'));
    const customerAddresses = (await esmock('../../../src/routes/customers/addresses.js', {
      '../../../src/utils/proxy.js': { apiBase: () => 'https://api/org/sites/site', proxyFetch },
    })).default;

    const request = new Request('http://localhost/customers/a@b.com/addresses', { method: 'GET' });
    const resp = await customerAddresses(request, {
      env: DEFAULT_ENV,
      params: { email: 'a@b.com' },
    });
    assert.ok(resp);

    const [url, , opts] = proxyFetch.firstCall.args;
    assert.equal(url, 'https://api/org/sites/site/customers/a@b.com/addresses');
    assert.equal(opts.auth, 'auto');
  });

  it('proxies POST create address with auto auth', async () => {
    const proxyFetch = sinon.stub().resolves(new Response('{"address":{}}'));
    const customerAddresses = (await esmock('../../../src/routes/customers/addresses.js', {
      '../../../src/utils/proxy.js': { apiBase: () => 'https://api/org/sites/site', proxyFetch },
    })).default;

    const request = new Request('http://localhost/customers/a@b.com/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', address1: '123 Main St' }),
    });
    const resp = await customerAddresses(request, {
      env: DEFAULT_ENV,
      params: { email: 'a@b.com' },
    });
    assert.ok(resp);

    const [url, , opts] = proxyFetch.firstCall.args;
    assert.equal(url, 'https://api/org/sites/site/customers/a@b.com/addresses');
    assert.equal(opts.auth, 'auto');
  });

  it('proxies DELETE address with addressId', async () => {
    const proxyFetch = sinon.stub().resolves(new Response('{"success":true}'));
    const customerAddresses = (await esmock('../../../src/routes/customers/addresses.js', {
      '../../../src/utils/proxy.js': { apiBase: () => 'https://api/org/sites/site', proxyFetch },
    })).default;

    const request = new Request('http://localhost/customers/a@b.com/addresses/abc123', {
      method: 'DELETE',
    });
    const resp = await customerAddresses(request, {
      env: DEFAULT_ENV,
      params: { email: 'a@b.com', addressId: 'abc123' },
    });
    assert.ok(resp);

    const [url, , opts] = proxyFetch.firstCall.args;
    assert.equal(url, 'https://api/org/sites/site/customers/a@b.com/addresses/abc123');
    assert.equal(opts.auth, 'auto');
  });
});
