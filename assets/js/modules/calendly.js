/**
 * Inline Calendly embed for the booking section.
 *
 * Two things this guards against, because the calendar is the primary way to
 * reach the firm and must not be a dead end:
 *
 *   - No URL configured yet → skip the embed, reveal the direct-contact note.
 *   - Calendly blocked or unreachable (ad blocker, offline, outage) → same.
 *
 * The widget script is a ~100KB third-party request, so it is only fetched once
 * the section is near the viewport rather than on every page load.
 */

import { config } from '../config.js';

const WIDGET_JS = 'https://assets.calendly.com/assets/external/widget.js';
const WIDGET_CSS = 'https://assets.calendly.com/assets/external/widget.css';

export function initCalendly(){
  const mount = document.getElementById('calendlyEmbed');
  if(!mount) return;

  const url = buildUrl(config.calendly?.url);
  if(!url){ showFallback(mount); return; }

  whenNearViewport(mount, () => load(url, mount));
}

/**
 * Adds the theme parameters so the embed sits in the site's palette instead of
 * Calendly's default white. Colour params are hex without the leading `#`.
 * Whether they take effect depends on the Calendly plan — the layout works
 * either way.
 */
function buildUrl(base){
  if(!base) return '';
  try{
    const url = new URL(base);
    Object.entries({
      hide_gdpr_banner: '1',
      background_color: 'F5F1E8',   // --ivory
      text_color: '2A2A28',         // --charcoal
      primary_color: 'B8935F',      // --brass
    }).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  }catch{
    console.warn('[calendly] config.calendly.url is not a valid URL:', base);
    return '';
  }
}

async function load(url, mount){
  mount.dataset.state = 'loading';
  try{
    injectStylesheet(WIDGET_CSS);
    await injectScript(WIDGET_JS);
    if(!window.Calendly) throw new Error('Calendly global missing after load');
    trackHeight(mount);
    window.Calendly.initInlineWidget({ url, parentElement: mount });
    mount.dataset.state = 'ready';
  }catch(error){
    console.error('[calendly] embed failed to load', error);
    showFallback(mount);
  }
}

/**
 * Sizes the container to whatever Calendly says it needs.
 *
 * The injected iframe has no height of its own, so without this it falls back to
 * the HTML default of 150px and the calendar is invisible below the header.
 * Calendly posts a fresh height whenever its view changes — picking a date grows
 * the panel — so this also keeps the embed fitted instead of scrolling inside a
 * fixed box.
 */
function trackHeight(mount){
  window.addEventListener('message', (event) => {
    // Never take a layout instruction from an unverified origin.
    if(!/^https:\/\/([a-z0-9-]+\.)?calendly\.com$/.test(event.origin)) return;
    if(event.data?.event !== 'calendly.page_height') return;

    const height = parseInt(event.data.payload?.height, 10);
    // Calendly emits a couple of near-zero heights while booting; ignore those.
    if(Number.isFinite(height) && height > 200) mount.style.height = `${height}px`;
  });
}

function showFallback(mount){
  mount.hidden = true;
  mount.dataset.state = 'unavailable';
  document.getElementById('calendlyFallback')?.removeAttribute('hidden');
}

/** Defers work until the element is within 400px of the viewport. */
function whenNearViewport(el, callback){
  if(!('IntersectionObserver' in window)){ callback(); return; }
  const observer = new IntersectionObserver((entries) => {
    if(!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    callback();
  }, { rootMargin: '400px' });
  observer.observe(el);
}

function injectStylesheet(href){
  if(document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function injectScript(src){
  const existing = document.querySelector(`script[src="${src}"]`);
  if(existing?.dataset.loaded) return Promise.resolve();

  const script = existing || Object.assign(document.createElement('script'), { src, async: true });
  const done = new Promise((resolve, reject) => {
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
  });
  if(!existing) document.head.appendChild(script);
  return done;
}
