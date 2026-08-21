/**
 * Consultation enquiries submitted from the public site.
 */

import { post } from './api.js';

/**
 * POST /enquiries
 * @param {{name:string, phone:string, email:string, service:string, message:string}} enquiry
 */
export function submitEnquiry(enquiry){
  return post('/enquiries', enquiry);
}
