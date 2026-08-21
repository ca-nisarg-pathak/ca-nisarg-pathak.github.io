/**
 * Runtime configuration.
 *
 * This is the only file that should need editing when moving between local,
 * staging and production. Nothing secret goes in here — it ships to the
 * browser. Secret keys (payment gateway secret, DB credentials, mail
 * credentials) belong on the server only.
 */

export const config = {
  /**
   * Base URL of the backend API. Leave empty until a backend exists — the
   * site then runs in "no backend" mode and the enquiry form falls back to a
   * local confirmation instead of a network call.
   */
  apiBaseUrl: '',

  /** Turn features on as their backend lands. */
  features: {
    clientPortal: false, // sign-in + per-client profile pages
    payments: false,     // invoice payment / checkout
  },

  /** Publishable (not secret) payment gateway details. */
  payments: {
    provider: 'razorpay', // 'razorpay' | 'stripe'
    publicKey: '',        // Razorpay key_id / Stripe publishable key
    currency: 'INR',
  },

  /** Firm details used in a few places in the UI. */
  firm: {
    name: 'Nisarg Pathak & Co',
    phone: '+919737167553',
    email: 'nisargpathakandcompany@gmail.com',
    whatsapp: 'https://wa.me/919737167553',
  },
};

/** True once `apiBaseUrl` is pointed at a real backend. */
export function hasBackend(){
  return Boolean(config.apiBaseUrl);
}
