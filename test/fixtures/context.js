/**
 * Shared test fixtures.
 */

export const DEFAULT_ENV = {
  API_ORIGIN: 'https://api.example.com',
  API_ORG: 'testorg',
  API_SITE: 'testsite',
  API_TOKEN: 'test-service-token',
  ALLOWED_ORIGIN: 'https://example.com',
};

/**
 * Create a minimal Request for testing.
 *
 * @param {string} url
 * @param {object} [opts]
 * @returns {Request}
 */
export function createRequest(url, opts = {}) {
  return new Request(url, opts);
}
