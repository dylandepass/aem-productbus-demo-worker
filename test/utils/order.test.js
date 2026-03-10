import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { buildOrderPayload } from '../../src/utils/order.js';

describe('utils/order', () => {
  describe('buildOrderPayload', () => {
    it('maps customer, shipping, and items correctly', () => {
      const result = buildOrderPayload({
        customer: { email: 'test@example.com', firstName: 'Jane', lastName: 'Doe' },
        shipping: { name: 'Jane Doe', address1: '123 Main St', city: 'NYC', state: 'NY', zip: '10001', country: 'US' },
        items: [
          {
            sku: 'SKU1', name: 'Test Product', quantity: 2, price: 29.99, currency: 'USD', image: 'media_abc123.jpg', url: '/products/test-product/sku1',
          },
        ],
      });

      assert.equal(result.customer.email, 'test@example.com');
      assert.equal(result.shipping.address1, '123 Main St');
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].sku, 'SKU1');
      assert.equal(result.items[0].name, 'Test Product');
      assert.equal(result.items[0].quantity, 2);
      assert.equal(result.items[0].price.final, '29.99');
      assert.equal(result.items[0].price.currency, 'USD');
      assert.equal(result.items[0].path, 'sku1');
      assert.equal(result.items[0].custom.image, 'media_abc123.jpg');
      assert.equal(result.items[0].custom.url, '/products/test-product/sku1');
    });

    it('defaults currency to USD', () => {
      const result = buildOrderPayload({
        customer: { email: 'test@example.com' },
        shipping: {},
        items: [{ sku: 'A', name: 'Item', quantity: 1, price: 10 }],
      });

      assert.equal(result.items[0].price.currency, 'USD');
    });

    it('handles missing image and url', () => {
      const result = buildOrderPayload({
        customer: { email: 'test@example.com' },
        shipping: {},
        items: [{ sku: 'A', name: 'Item', quantity: 1, price: 10 }],
      });

      assert.equal(result.items[0].custom.image, '');
      assert.equal(result.items[0].custom.url, '');
      assert.equal(result.items[0].path, '');
    });

    it('extracts path from url path', () => {
      const result = buildOrderPayload({
        customer: { email: 'test@example.com' },
        shipping: {},
        items: [{ sku: 'A', name: 'Item', quantity: 1, price: 10, url: '/products/my-product/variant-1' }],
      });

      assert.equal(result.items[0].path, 'variant-1');
    });

    it('converts price to string', () => {
      const result = buildOrderPayload({
        customer: { email: 'test@example.com' },
        shipping: {},
        items: [{ sku: 'A', name: 'Item', quantity: 1, price: 49.99, currency: 'EUR' }],
      });

      assert.equal(result.items[0].price.final, '49.99');
      assert.equal(result.items[0].price.currency, 'EUR');
    });
  });
});
