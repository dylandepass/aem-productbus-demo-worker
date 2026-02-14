/**
 * Tree-based router.
 * Adapted from helix-commerce-api/src/utils/router/index.js
 */

import { Node } from './node.js';

export default class Router {
  #root;

  constructor() {
    this.#root = new Node('');
  }

  /**
   * Register a route.
   *
   * @param {string} method HTTP method
   * @param {string} pattern URL pattern (e.g. '/auth/:action')
   * @param {function} handler Route handler
   * @returns {Router}
   */
  add(method, pattern, handler) {
    const expr = `/${method.toUpperCase()}${pattern}`;
    const segs = expr.split('/').slice(1);
    this.#root.add(segs, { handler });
    return this;
  }

  /**
   * Find a matching handler for the given method and path.
   *
   * @param {string} method HTTP method
   * @param {string} path URL path
   * @returns {{ handler: function, params: object } | null}
   */
  match(method, path) {
    const expr = `/${method.toUpperCase()}${path}`;
    const segs = expr.split('/').slice(1);

    const variables = new Map();
    const node = this.#root.match(segs, variables);

    const { route } = node ?? {};
    if (route) {
      return { handler: route.handler, params: Object.fromEntries(variables) };
    }
    return null;
  }
}
