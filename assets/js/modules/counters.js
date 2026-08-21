/**
 * Counts the statement-strip figures up from zero the first time they are
 * scrolled into view. Targets come from `data-target` on `.stat .num`.
 */

export function initCounters(selector = '[data-counters]'){
  const container = document.querySelector(selector);
  if(!container) return;

  const numbers = container.querySelectorAll('.num[data-target]');
  if(!numbers.length) return;

  const run = () => numbers.forEach(countUp);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!('IntersectionObserver' in window) || reducedMotion){
    numbers.forEach(el => { el.textContent = el.dataset.target; });
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
    el.textContent = Math.round(target * easeOut(progress));
    if(progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
