import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { ResponseError, errorResponse } from '../../src/utils/http.js';

describe('utils/http', () => {
  describe('ResponseError', () => {
    it('stores status and message', () => {
      const err = new ResponseError(404, 'Not found');
      assert.equal(err.status, 404);
      assert.equal(err.message, 'Not found');
      assert(err instanceof Error);
    });
  });

  describe('errorResponse', () => {
    it('returns JSON error response with correct status', async () => {
      const resp = errorResponse(400, 'Bad request');
      assert.equal(resp.status, 400);
      assert.equal(resp.headers.get('Content-Type'), 'application/json');
      const body = await resp.json();
      assert.deepEqual(body, { error: 'Bad request' });
    });
  });
});
