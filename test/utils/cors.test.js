import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { corsHeaders, withCORS, handlePreflight } from '../../src/utils/cors.js';

const env = { ALLOWED_ORIGIN: 'https://example.com' };

describe('utils/cors', () => {
  describe('corsHeaders', () => {
    it('returns CORS headers with configured origin', () => {
      const h = corsHeaders(env);
      assert.equal(h['Access-Control-Allow-Origin'], 'https://example.com');
      assert.equal(h['Access-Control-Allow-Methods'], 'GET, POST, OPTIONS');
      assert.equal(h['Access-Control-Allow-Headers'], 'Content-Type, Authorization');
    });

    it('defaults to wildcard origin', () => {
      const h = corsHeaders({});
      assert.equal(h['Access-Control-Allow-Origin'], '*');
    });
  });

  describe('withCORS', () => {
    it('adds CORS headers to response', () => {
      const resp = new Response('ok', { status: 200 });
      const corsResp = withCORS(resp, env);
      assert.equal(corsResp.status, 200);
      assert.equal(corsResp.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
    });

    it('preserves existing headers', () => {
      const resp = new Response('ok', {
        status: 200,
        headers: { 'X-Custom': 'value' },
      });
      const corsResp = withCORS(resp, env);
      assert.equal(corsResp.headers.get('X-Custom'), 'value');
      assert.equal(corsResp.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
    });
  });

  describe('handlePreflight', () => {
    it('returns 204 with CORS headers', () => {
      const resp = handlePreflight(env);
      assert.equal(resp.status, 204);
      assert.equal(resp.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
    });
  });
});
