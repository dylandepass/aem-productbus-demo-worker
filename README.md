# AEM Product Bus Demo Worker

Cloudflare Worker that serves as the middleware layer between the [AEM Product Bus Demo](https://github.com/dylandepass/aem-productbus-demo) storefront and the Helix Commerce API. It handles authentication, order management, customer profiles, Stripe payments, and address autocomplete.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm i -g wrangler`)
- A Cloudflare account with Workers enabled

### Install dependencies

```bash
npm install
```

### Configure secrets

The worker requires several secrets that are not committed to source control:

```bash
# Helix Commerce API token
npx wrangler secret put API_TOKEN

# Google Places API key (for address autocomplete)
npx wrangler secret put GOOGLE_PLACES_API_KEY

# Stripe secret key (sk_test_... or sk_live_...)
npx wrangler secret put STRIPE_SECRET_KEY

# Stripe webhook signing secret (whsec_...)
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

### Environment variables

Configured in `wrangler.jsonc`:

| Variable | Description | Default |
|----------|-------------|---------|
| `API_ORIGIN` | Helix Commerce API base URL | `https://api.adobecommerce.live` |
| `API_ORG` | Organization identifier | `dylandepass` |
| `API_SITE` | Site identifier | `aem-productbus-demo` |
| `ALLOWED_ORIGIN` | CORS allowed origin | `*` |

### Local development

```bash
npm run dev
```

Starts a local Wrangler dev server at `http://localhost:8787`.

For testing Stripe webhooks locally, use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:8787/webhooks/stripe
```

### Deploy

```bash
npm run deploy
```

### Run tests

```bash
npm test
```

## API reference

### Authentication

#### `POST /auth/login`

Request a one-time password (OTP) for passwordless login.

```bash
curl -X POST https://{worker-url}/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

#### `POST /auth/callback`

Verify an OTP code and receive a JWT.

```bash
curl -X POST https://{worker-url}/auth/callback \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "code": "123456", "hash": "...", "exp": "..."}'
```

**Response:**
```json
{
  "email": "user@example.com",
  "token": "eyJhbG...",
  "roles": ["user"]
}
```

The worker extracts the JWT from the upstream API's `Set-Cookie` header and returns it in the JSON body so the client can store it in `sessionStorage`.

#### `POST /auth/logout`

Invalidate the current session.

```bash
curl -X POST https://{worker-url}/auth/logout \
  -H "Authorization: Bearer {jwt}"
```

---

### Orders

#### `POST /orders`

Create a new order.

```bash
curl -X POST https://{worker-url}/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {jwt}" \
  -d '{
    "customer": {"email": "user@example.com", "firstName": "Jane", "lastName": "Doe"},
    "shipping": {"name": "Jane Doe", "address1": "123 Main St", "city": "NYC", "state": "NY", "zip": "10001", "country": "US"},
    "items": [
      {
        "sku": "SKU001",
        "name": "Product Name",
        "quantity": 1,
        "price": {"currency": "USD", "final": "29.99"},
        "custom": {"image": "media_abc123.jpg", "url": "/products/product-name/sku001"}
      }
    ]
  }'
```

**Auth mode:** `auto` — uses the user's JWT if provided, otherwise falls back to the API token.

#### `GET /orders/{orderId}`

Retrieve a single order.

```bash
curl https://{worker-url}/orders/{orderId} \
  -H "Authorization: Bearer {jwt}"
```

---

### Customers

#### `GET /customers/{email}`

Retrieve a customer profile.

```bash
curl https://{worker-url}/customers/user@example.com \
  -H "Authorization: Bearer {jwt}"
```

#### `GET /customers/{email}/orders`

Retrieve a customer's order history.

```bash
curl https://{worker-url}/customers/user@example.com/orders \
  -H "Authorization: Bearer {jwt}"
```

#### `GET /customers/{email}/addresses`

List all saved addresses.

#### `POST /customers/{email}/addresses`

Create a new address.

```bash
curl -X POST https://{worker-url}/customers/user@example.com/addresses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {jwt}" \
  -d '{"name": "Jane Doe", "address1": "123 Main St", "city": "NYC", "state": "NY", "zip": "10001", "country": "US"}'
```

#### `GET /customers/{email}/addresses/{addressId}`

Retrieve a single address.

#### `DELETE /customers/{email}/addresses/{addressId}`

Delete an address.

---

### Checkout (Stripe)

#### `POST /checkout`

Create a Stripe Checkout Session. The client sends the cart contents and customer/shipping details; the worker creates a session with Stripe and returns the redirect URL.

```bash
curl -X POST https://{worker-url}/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {"email": "user@example.com", "firstName": "Jane", "lastName": "Doe"},
    "shipping": {"name": "Jane Doe", "address1": "123 Main St", "city": "NYC", "state": "NY", "zip": "10001", "country": "US"},
    "items": [
      {"sku": "SKU001", "name": "Product", "quantity": 1, "price": 29.99, "currency": "USD", "image": "https://example.com/img.jpg", "url": "/products/product/sku001"}
    ]
  }'
```

**Response:**
```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

The client redirects to this URL. After payment, Stripe redirects back to `/order-confirmation?session_id={CHECKOUT_SESSION_ID}`.

**Shipping logic:**
- Orders $150+ get free shipping
- Orders under $150 have a $10 flat-rate shipping fee

**Metadata handling:**
Item images are stored as short `media_{hash}.{ext}` references to stay within Stripe's 500-character metadata value limit.

#### `GET /checkout/session?id={sessionId}`

Retrieve session details for the order confirmation page.

```bash
curl https://{worker-url}/checkout/session?id=cs_test_abc123
```

**Response:**
```json
{
  "id": "cs_test_abc123",
  "status": "complete",
  "payment_status": "paid",
  "customer_email": "user@example.com",
  "amount_total": 3999,
  "currency": "usd",
  "metadata": { ... }
}
```

---

### Webhooks

#### `POST /webhooks/stripe`

Handles Stripe webhook events. This endpoint is called server-to-server by Stripe and does not include CORS headers.

**Supported events:**
- `checkout.session.completed` — When payment succeeds, the handler extracts customer, shipping, and item data from the session metadata and creates an order in the Helix Commerce API.

**Security:**
- Verifies the `Stripe-Signature` header using HMAC-SHA256 (Web Crypto API)
- Validates timestamp within a 5-minute tolerance window
- No external SDK required

**Setup:**
1. In the Stripe Dashboard, go to **Developers > Webhooks**
2. Add endpoint: `https://{worker-url}/webhooks/stripe`
3. Select event: `checkout.session.completed`
4. Copy the signing secret and set it as `STRIPE_WEBHOOK_SECRET`

---

### Places (address autocomplete)

#### `GET /places/autocomplete?input={query}`

Proxy for the Google Places Autocomplete API. Keeps the API key server-side.

```bash
curl "https://{worker-url}/places/autocomplete?input=123+Main&sessiontoken=uuid"
```

#### `GET /places/details?place_id={id}`

Proxy for the Google Places Details API. Returns address components for form auto-fill.

```bash
curl "https://{worker-url}/places/details?place_id=ChIJ...&sessiontoken=uuid"
```

**Origin restrictions:** These endpoints only accept requests from allowed origins (the AEM EDS preview/live/network domains and `localhost:3000`).

## Authentication modes

The `proxyFetch()` utility supports four auth modes for upstream API calls:

| Mode | Behavior | Used by |
|------|----------|---------|
| `token` | Uses `API_TOKEN` | Server-side operations |
| `user` | Passes the user's `Authorization` header | Logout |
| `auto` | Prefers user JWT, falls back to `API_TOKEN` | Orders, customers, addresses |
| `public` | No `Authorization` header | Login, callback |

## Payment flow

```
1. User fills cart + shipping form ──► clicks "Pay Now"
2. Client POSTs to /checkout ──► worker creates Stripe Checkout Session
3. Client redirects to Stripe hosted payment page
4. User enters card details on Stripe's domain (PCI SAQ-A compliant)
5. On success, Stripe redirects to /order-confirmation?session_id=cs_xxx
6. Confirmation page calls GET /checkout/session to verify payment
7. Stripe sends webhook to POST /webhooks/stripe
8. Worker verifies signature, creates order in Helix Commerce API
```

No card data ever touches the worker or the storefront.

## External services

| Service | Purpose | Auth |
|---------|---------|------|
| Helix Commerce API | Product catalog, orders, customers | Bearer token (API_TOKEN) |
| Stripe | Payment processing | Secret key (STRIPE_SECRET_KEY) |
| Google Places | Address autocomplete | API key (GOOGLE_PLACES_API_KEY) |
