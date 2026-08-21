/**
 * Invoice payments.
 *
 * The flow, which keeps every secret on the server:
 *   1. browser  -> POST /payments/orders          (amount comes from the invoice, server-side)
 *   2. server   -> creates the gateway order, returns its id + publishable key
 *   3. browser  -> opens the gateway's checkout with that order id
 *   4. gateway  -> calls the server's webhook; the server marks the invoice paid
 *   5. browser  -> POST /payments/verify for immediate UI feedback
 *
 * Step 4 is what actually settles the invoice. Never mark anything paid off
 * the browser callback alone — it is trivially forged.
 */

import { get, post } from './api.js';
import { config } from '../config.js';

/** GET /me/invoices -> [{ id, number, amount, currency, status, dueOn }] */
export function listInvoices(){
  return get('/me/invoices', { auth: true });
}

/** GET /me/invoices/:id */
export function getInvoice(invoiceId){
  return get(`/me/invoices/${encodeURIComponent(invoiceId)}`, { auth: true });
}

/** POST /payments/orders -> { orderId, amount, currency, publicKey } */
export function createOrder(invoiceId){
  return post('/payments/orders', { invoiceId }, { auth: true });
}

/** POST /payments/verify -> { status: 'paid' | 'pending' | 'failed' } */
export function verifyPayment(receipt){
  return post('/payments/verify', receipt, { auth: true });
}

/**
 * Opens the gateway checkout for an invoice and resolves with the verified
 * result. Wire the provider branch below once the gateway account exists.
 */
export async function payInvoice(invoiceId){
  const order = await createOrder(invoiceId);

  if(config.payments.provider === 'razorpay'){
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    return openRazorpay(order);
  }

  throw new Error(`Unsupported payment provider: ${config.payments.provider}`);
}

function openRazorpay(order){
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: order.publicKey || config.payments.publicKey,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency || config.payments.currency,
      name: config.firm.name,
      description: order.description || 'Professional fees',
      handler: (response) => verifyPayment(response).then(resolve, reject),
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
    });
    checkout.on('payment.failed', (e) => reject(new Error(e?.error?.description || 'Payment failed')));
    checkout.open();
  });
}

/** Loads a third-party script once and resolves when it is ready. */
function loadScript(src){
  const existing = document.querySelector(`script[src="${src}"]`);
  if(existing) return existing.dataset.loaded ? Promise.resolve() : waitFor(existing);

  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  document.head.appendChild(script);
  return waitFor(script);
}

function waitFor(script){
  return new Promise((resolve, reject) => {
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${script.src}`)));
  });
}
