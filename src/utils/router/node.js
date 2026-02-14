/**
 * Router tree node.
 * Copied from helix-commerce-api/src/utils/router/node.js
 */

export class Node {
  #label;

  #children;

  #star;

  #variable;

  #route;

  constructor(label) {
    this.#label = label;
    this.#children = [];
  }

  #getOrCreateChild(seg) {
    if (seg === '*') {
      if (!this.#star) {
        this.#star = new Node(seg);
      }
      return this.#star;
    }
    if (seg.startsWith(':')) {
      if (!this.#variable) {
        this.#variable = new Node(seg.substring(1));
      }
      return this.#variable;
    }
    let ret = this.#children.find((child) => child.#label === seg);
    if (!ret) {
      ret = new Node(seg);
      this.#children.push(ret);
    }
    return ret;
  }

  add(segs, route) {
    if (segs.length === 0) {
      this.#route = route;
      return this;
    }
    const seg = segs.shift();
    return this.#getOrCreateChild(seg).add(segs, route);
  }

  get route() {
    return this.#route;
  }

  match(segs, variables) {
    if (segs.length === 0) {
      return this;
    }
    const seg = segs.shift();

    const next = this.#children.find((child) => child.#label === seg);
    if (next) {
      return next.match(segs, variables);
    }

    if (this.#variable) {
      const key = this.#variable.#label;
      variables.set(key, seg);
      return this.#variable.match(segs, variables);
    }

    if (this.#star) {
      segs.unshift(seg);
      variables.set('path', `/${segs.join('/')}`);
      return this.#star;
    }
    return null;
  }

}
