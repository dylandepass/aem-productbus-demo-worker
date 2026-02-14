import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { apiBase, proxyFetch } from '../../src/utils/proxy.js';
import { DEFAULT_ENV } from '../fixtures/context.js';

describe('utils/proxy', () => {
  describe('apiBase', () => {
    it('builds URL from env', () => {
      assert.equal(
        apiBase(DEFAULT_ENV),
        'https://api.example.com/testorg/sites/testsite',
      );
    });
  });

  describe('proxyFetch', () => {
    let fetchStub;

    beforeEach(() => {
      fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response('{}'));
    });

    afterEach(() => {
      fetchStub.restore();
    });

    it('auth=token sends service token', async () => {
      const request = new Request('http://localhost/test', { method: 'GET' });
      await proxyFetch('https://api.example.com/test', request, { auth: 'token', env: DEFAULT_ENV });

      const [, init] = fetchStub.firstCall.args;
      assert.equal(init.headers.get('Authorization'), `Bearer ${DEFAULT_ENV.API_TOKEN}`);
      assert.equal(init.method, 'GET');
    });

    it('auth=user forwards user Authorization header', async () => {
      const request = new Request('http://localhost/test', {
        method: 'GET',
        headers: { Authorization: 'Bearer user-jwt' },
      });
      await proxyFetch('https://api.example.com/test', request, { auth: 'user', env: DEFAULT_ENV });

      const [, init] = fetchStub.firstCall.args;
      assert.equal(init.headers.get('Authorization'), 'Bearer user-jwt');
    });

    it('auth=user without header sends no Authorization', async () => {
      const request = new Request('http://localhost/test', { method: 'GET' });
      await proxyFetch('https://api.example.com/test', request, { auth: 'user', env: DEFAULT_ENV });

      const [, init] = fetchStub.firstCall.args;
      assert.equal(init.headers.get('Authorization'), null);
    });

    it('auth=public sends no Authorization', async () => {
      const request = new Request('http://localhost/test', { method: 'GET' });
      await proxyFetch('https://api.example.com/test', request, { auth: 'public', env: DEFAULT_ENV });

      const [, init] = fetchStub.firstCall.args;
      assert.equal(init.headers.get('Authorization'), null);
    });

    it('auth=auto prefers user auth when present', async () => {
      const request = new Request('http://localhost/test', {
        method: 'GET',
        headers: { Authorization: 'Bearer user-jwt' },
      });
      await proxyFetch('https://api.example.com/test', request, { auth: 'auto', env: DEFAULT_ENV });

      const [, init] = fetchStub.firstCall.args;
      assert.equal(init.headers.get('Authorization'), 'Bearer user-jwt');
    });

    it('auth=auto falls back to service token', async () => {
      const request = new Request('http://localhost/test', { method: 'GET' });
      await proxyFetch('https://api.example.com/test', request, { auth: 'auto', env: DEFAULT_ENV });

      const [, init] = fetchStub.firstCall.args;
      assert.equal(init.headers.get('Authorization'), `Bearer ${DEFAULT_ENV.API_TOKEN}`);
    });

    it('POST request includes body', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        body: '{"email":"test@example.com"}',
      });
      await proxyFetch('https://api.example.com/test', request, { auth: 'public', env: DEFAULT_ENV });

      const [, init] = fetchStub.firstCall.args;
      assert.equal(init.method, 'POST');
      assert.ok(init.body);
    });

    it('GET request does not include body', async () => {
      const request = new Request('http://localhost/test', { method: 'GET' });
      await proxyFetch('https://api.example.com/test', request, { auth: 'public', env: DEFAULT_ENV });

      const [, init] = fetchStub.firstCall.args;
      assert.equal(init.method, 'GET');
      assert.equal(init.body, undefined);
    });
  });
});
