/**
 * Counts the statement-strip figures up from zero the first time they are
 * scrolled into view. Targets come from `data-target` on `.stat .num`, with an
 * optional `data-suffix` appended once counting finishes (e.g. "1000" + "+").
 */

export function initCounters(selector = '[data-counters]'){
  const container = document.querySelector(selector);
  if(!container) return;

  const numbers = container.querySelectorAll('.num[data-target]');
  if(!numbers.length) return;

  // Not `forEach(countUp)` — forEach passes the index as the second argument,
  // which would land in countUp's `duration` and collapse the animation.
  const run = () => numbers.forEach(el => countUp(el));

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!('IntersectionObserver' in window) || reducedMotion){
    numbers.forEach(el => { el.textContent = render(el, Number(el.dataset.target)); });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if(!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    run();
  }, { threshold: 0.4 });

  observer.observe(container);
}

function countUp(el, duration = 1200){
  const target = Number(el.dataset.target);
  if(!Number.isFinite(target)) return;

  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = render(el, Math.round(target * easeOut(progress)));
    if(progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** The suffix only appears at the end, so "1000+" doesn't flicker while counting. */
function render(el, value){
  const suffix = el.dataset.suffix || '';
  return value >= Number(el.dataset.target) ? `${value}${suffix}` : String(value);
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
