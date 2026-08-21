/**
 * Home page entry point.
 *
 * Each page gets its own entry module that composes the pieces it needs, e.g.
 * a future assets/js/portal.js would pull in nav + an auth guard + profile.
 */

import { initNav } from './modules/nav.js';
import { initReveal } from './modules/reveal.js';
import { initCounters } from './modules/counters.js';
import { initContactForm } from './modules/contact-form.js';

initNav();
initReveal();
initCounters();
initContactForm();
