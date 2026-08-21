/**
 * Enquiry form on the home page.
 *
 * With `config.apiBaseUrl` set, the submission is POSTed to the backend and
 * real errors are surfaced. Until then the form keeps its current front-end
 * behaviour: it shows the confirmation panel and logs a warning, so the page
 * stays presentable while the backend is being built.
 */

import { submitEnquiry } from '../services/enquiries.js';
import { NoBackendError } from '../services/api.js';
import { hasBackend } from '../config.js';

export function initContactForm(){
  const form = document.getElementById('clientForm');
  if(!form) return;

  const panel = document.getElementById('formDefault');
  const success = document.getElementById('formSuccess');
  const error = document.getElementById('formError');
  const submit = form.querySelector('.form-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    hide(error);
    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Sending…';

    try{
      if(hasBackend()){
        await submitEnquiry(readForm(form));
      }else{
        console.warn('[enquiry] No backend configured — showing local confirmation only.', readForm(form));
      }
      hide(panel);
      show(success);
    }catch(err){
      const message = err instanceof NoBackendError
        ? 'This form is not connected yet. Please call or email us in the meantime.'
        : (err.message || 'Something went wrong. Please try again or call us directly.');
      error.textContent = message;
      show(error);
      console.error('[enquiry] submission failed', err);
    }finally{
      submit.disabled = false;
      submit.textContent = original;
    }
  });
}

function readForm(form){
  const data = new FormData(form);
  return {
    name: data.get('name')?.trim(),
    phone: data.get('phone')?.trim(),
    email: data.get('email')?.trim(),
    service: data.get('service'),
    message: data.get('message')?.trim(),
  };
}

function show(el){ if(el) el.hidden = false; }
function hide(el){ if(el) el.hidden = true; }
