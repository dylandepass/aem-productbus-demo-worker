/**
 * Route registry.
 */

import Router from '../utils/router/index.js';
import authHandler from './auth/handler.js';
import ordersHandler from './orders/handler.js';
import customersHandler from './customers/handler.js';
import customerAddresses from './customers/addresses.js';
import placesHandler from './places/handler.js';
import { createCheckoutSession, getCheckoutSession } from './checkout/handler.js';
import stripeWebhookHandler from './webhooks/stripe.js';

const router = new Router();

router.add('POST', '/auth/:action', authHandler);
router.add('POST', '/orders', ordersHandler);
router.add('GET', '/orders/:orderId', ordersHandler);
router.add('GET', '/customers/:email', customersHandler);
router.add('GET', '/customers/:email/addresses', customerAddresses);
router.add('POST', '/customers/:email/addresses', customerAddresses);
router.add('GET', '/customers/:email/addresses/:addressId', customerAddresses);
router.add('DELETE', '/customers/:email/addresses/:addressId', customerAddresses);
router.add('GET', '/customers/:email/:subroute', customersHandler);
router.add('GET', '/places/:action', placesHandler);
router.add('POST', '/checkout', createCheckoutSession);
router.add('GET', '/checkout/session', getCheckoutSession);
router.add('POST', '/webhooks/stripe', stripeWebhookHandler);

export default router;
