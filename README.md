# Nisarg Pathak & Co — website

Static marketing site for the practice, hosted on GitHub Pages at
<https://ca-nisarg-pathak.github.io/>.

There is no backend. No accounts, no database, no payments. Booking is an
embedded Calendly calendar; everything else is a WhatsApp, phone or `mailto:`
link. Nothing to deploy, no domain or DKIM setup, and no server holding client
data.

No build step, no dependencies. Plain HTML, CSS and ES modules.

## Running locally

The JavaScript uses ES modules, which browsers refuse to load over `file://`.
Serve the folder instead of double-clicking `index.html`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Layout

```
index.html                      home page
assets/
  css/
    main.css                    entry point — @imports the four core files
    core/
      tokens.css                colour, type and spacing variables
      base.css                  reset, typography, .tag / .reveal / .fade-up
      layout.css                nav, section scaffolding, footer, WhatsApp button
      components.css            buttons, cards, forms, ledger rows, stat strip
    pages/
      home.css                  hero + the sections unique to index.html
  img/
    ca-india-logo.png           ICAI CA India mark, shown in the footer
  js/
    config.js                   firm contact details, in one place
    main.js                     home page entry point
    modules/                    UI behaviour, one concern per file
      nav.js                    mobile nav toggle
      reveal.js                 scroll-reveal
      counters.js               count-up figures in the hero
      calendly.js               lazy-loaded Calendly embed + fallbacks
```

### Conventions

- **Styles:** anything used on more than one page goes in `core/`; page-specific
  styles go in `pages/<page>.css`. A page links `main.css` plus its own file.
  Never hard-code a colour — add a token.
- **Scripts:** `modules/` touch the DOM, one concern per file. One entry point
  per page composes what it needs.
- **Reusable markup hooks:** `data-*` attributes (`data-nav-toggle`,
  `data-counters`), so styling classes stay free to change.
- Sections on the ivory background use `class="section--paper"`.

## Booking

Set your scheduling link in `assets/js/config.js`:

```js
calendly: {
  url: 'https://calendly.com/your-handle/consultation',
},
```

That's the only change needed. While it's empty the embed is skipped entirely and
the section falls back to the WhatsApp / Call / Email buttons, so the live site
never shows an empty calendar frame.

`modules/calendly.js` handles three things worth knowing about:

- **Lazy loading.** Calendly's widget is a ~100KB third-party script. It's only
  fetched once the booking section is within 400px of the viewport, so visitors
  who never scroll that far don't pay for it.
- **Failure fallback.** If the script is blocked by an ad blocker, or Calendly is
  down, or the configured URL is malformed, the embed is hidden and the
  direct-contact buttons take over. Booking is the primary way to reach the firm,
  so it must not be able to become a dead end.
- **Theming.** The embed URL gets `background_color`, `text_color` and
  `primary_color` appended to match the site palette, plus `hide_gdpr_banner=1`.
  Whether Calendly honours the colour parameters depends on the plan; the layout
  works either way.

Two Calendly plan limits to keep in mind: the free tier allows **one event type**,
so there's a single consultation link rather than one per service, and "Powered by
Calendly" branding stays on free.

**Height is driven by Calendly, not guessed.** The injected iframe has no
dimensions of its own — left alone it collapses to the HTML default of 150px and
the calendar is invisible below the header. Calendly posts a
`calendly.page_height` message whenever its view changes, and `calendly.js`
resizes the container to match (origin-checked, so a hostile frame can't drive
our layout). The 700px `min-height` in CSS is only the placeholder shown while
loading.

## Still to wire up

- `components.css` contains `.team-*` and `.testi-*` styles that no markup
  currently uses — kept for the team and testimonials sections the design
  anticipates. Delete them if those sections aren't happening.
- The hero figures are the firm's own stated numbers (1000+ clients served,
  100% on-time filing), confirmed 22 Aug 2026 — not placeholders. The count-up
  reads `data-target`, with an optional `data-suffix` for the "+".
