/**
 * HTTP utilities.
 */

export class ResponseError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message Error message
   */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Create a JSON error response.
 *
 * @param {number} status
 * @param {string} message
 * @returns {Response}
 */
export function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
