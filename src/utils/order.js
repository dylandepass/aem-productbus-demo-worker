/**
 * Shared order payload builder.
 * Used by both Stripe webhook and PayPal capture to create Commerce API orders.
 */

/**
 * Build the order payload for the Commerce API.
 *
 * @param {object} opts
 * @param {object} opts.customer - { email, firstName, lastName }
 * @param {object} opts.shipping - Shipping address
 * @param {Array} opts.items - Cart items
 * @returns {object} Order payload for Commerce API
 */
export function buildOrderPayload({ customer, shipping, items }) {
  return {
    customer,
    shipping,
    items: items.map((item) => {
      const image = item.image || '';
      return {
        sku: item.sku,
        path: (item.url || '').split('/').pop() || '',
        name: item.name,
        quantity: item.quantity,
        price: {
          currency: item.currency || 'USD',
          final: String(item.price),
        },
        custom: { image, url: item.url || '' },
      };
    }),
  };
}
