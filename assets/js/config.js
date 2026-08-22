/**
 * Site configuration.
 *
 * The site is fully static (GitHub Pages) — there is no backend and no network
 * request anywhere. The enquiry form composes a message and hands it to the
 * visitor's own email or WhatsApp app, so these details are all it needs.
 */

export const config = {
  firm: {
    name: 'Nisarg Pathak & Co',
    email: 'nisargpathakandcompany@gmail.com',
    phoneDisplay: '+91 97371 67553',
    phoneDial: '+919737167553',
    whatsapp: '919737167553',            // digits only, for wa.me links
    address: {
      street: '210 Ramwadi Complex, Opp. Bhidbhanjan Mahadev Temple, Kalanala Road',
      locality: 'Bhavnagar',
      region: 'Gujarat',
      postalCode: '364001',
      country: 'IN',
    },
  },

  /**
   * Calendly scheduling link, e.g. 'https://calendly.com/nisarg-pathak/consultation'.
   * Leave empty and the booking section falls back to the direct-contact buttons
   * rather than rendering an empty calendar frame.
   */
  calendly: {
    url: 'https://calendly.com/canisargpathak/consultation',
  },
};
