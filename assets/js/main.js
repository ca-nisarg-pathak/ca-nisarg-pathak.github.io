/**
 * Home page entry point.
 *
 * Each page gets its own entry module that composes the pieces it needs.
 */

import { initNav } from './modules/nav.js';
import { initReveal } from './modules/reveal.js';
import { initCounters } from './modules/counters.js';
import { initCalendly } from './modules/calendly.js';

initNav();
initReveal();
initCounters();
initCalendly();
