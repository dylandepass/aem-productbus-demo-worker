import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import Router from '../../src/utils/router/index.js';

describe('utils/router', () => {
  it('matches literal routes', () => {
    const router = new Router();
    const handler = () => {};
    router.add('GET', '/health', handler);

    const match = router.match('GET', '/health');
    assert.ok(match);
    assert.equal(match.handler, handler);
  });

  it('returns null for unmatched routes', () => {
    const router = new Router();
    router.add('GET', '/health', () => {});

    assert.equal(router.match('GET', '/unknown'), null);
  });

  it('matches routes with variables', () => {
    const router = new Router();
    const handler = () => {};
    router.add('GET', '/orders/:orderId', handler);

    const match = router.match('GET', '/orders/abc-123');
    assert.ok(match);
    assert.equal(match.handler, handler);
    assert.equal(match.params.orderId, 'abc-123');
  });

  it('matches routes with multiple variables', () => {
    const router = new Router();
    const handler = () => {};
    router.add('GET', '/customers/:email/:subroute', handler);

    const match = router.match('GET', '/customers/a@b.com/orders');
    assert.ok(match);
    assert.equal(match.params.email, 'a@b.com');
    assert.equal(match.params.subroute, 'orders');
  });

  it('prefers literal over variable', () => {
    const router = new Router();
    const literalHandler = () => 'literal';
    const varHandler = () => 'variable';
    router.add('GET', '/items/special', literalHandler);
    router.add('GET', '/items/:id', varHandler);

    const match = router.match('GET', '/items/special');
    assert.equal(match.handler, literalHandler);

    const match2 = router.match('GET', '/items/other');
    assert.equal(match2.handler, varHandler);
  });

  it('matches wildcard routes', () => {
    const router = new Router();
    const handler = () => {};
    router.add('GET', '/files/*', handler);

    const match = router.match('GET', '/files/a/b/c');
    assert.ok(match);
    assert.equal(match.handler, handler);
    assert.equal(match.params.path, '/a/b/c');
  });

  it('differentiates by HTTP method', () => {
    const router = new Router();
    const getHandler = () => 'get';
    const postHandler = () => 'post';
    router.add('GET', '/orders', getHandler);
    router.add('POST', '/orders', postHandler);

    assert.equal(router.match('GET', '/orders').handler, getHandler);
    assert.equal(router.match('POST', '/orders').handler, postHandler);
  });

  it('returns null when method does not match', () => {
    const router = new Router();
    router.add('GET', '/orders', () => {});

    assert.equal(router.match('DELETE', '/orders'), null);
  });

  it('reuses existing variable node for same segment', () => {
    const router = new Router();
    const handler1 = () => {};
    const handler2 = () => {};
    router.add('GET', '/a/:id', handler1);
    router.add('GET', '/a/:id/details', handler2);

    const match1 = router.match('GET', '/a/1');
    assert.equal(match1.handler, handler1);

    const match2 = router.match('GET', '/a/1/details');
    assert.equal(match2.handler, handler2);
  });

  it('reuses existing literal child node', () => {
    const router = new Router();
    const handler1 = () => {};
    const handler2 = () => {};
    router.add('GET', '/a/b', handler1);
    router.add('GET', '/a/b/c', handler2);

    assert.equal(router.match('GET', '/a/b').handler, handler1);
    assert.equal(router.match('GET', '/a/b/c').handler, handler2);
  });

  it('returns null when no match at intermediate node', () => {
    const router = new Router();
    router.add('GET', '/a/b/c', () => {});

    assert.equal(router.match('GET', '/a/b'), null);
    assert.equal(router.match('GET', '/a/x/c'), null);
  });
});
