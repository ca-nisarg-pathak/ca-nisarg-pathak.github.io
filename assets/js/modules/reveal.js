/**
 * Fades elements in as they scroll into view. Add `class="reveal"` to opt in.
 */

export function initReveal(root = document){
  const elements = root.querySelectorAll('.reveal');
  if(!elements.length) return;

  // Without IntersectionObserver, or with motion turned down, just show them.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!('IntersectionObserver' in window) || reducedMotion){
    elements.forEach(el => el.classList.add('in'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) return;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.15 });

  elements.forEach(el => observer.observe(el));
}
