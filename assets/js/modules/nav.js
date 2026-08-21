/**
 * Mobile nav toggle. Closes on link click, on Escape, and on resize back to
 * the desktop breakpoint so the panel can't be left stranded open.
 */

export function initNav(){
  const toggle = document.querySelector('[data-nav-toggle]');
  const links = document.querySelector('[data-nav-links]');
  if(!toggle || !links) return;

  const setOpen = (open) => {
    links.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => {
    setOpen(!links.classList.contains('is-open'));
  });

  links.addEventListener('click', (e) => {
    if(e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') setOpen(false);
  });

  window.matchMedia('(min-width:901px)').addEventListener('change', (e) => {
    if(e.matches) setOpen(false);
  });
}
