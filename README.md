# Nisarg Pathak & Co — website

Static marketing site for the practice, structured so that a client portal
(per-client profiles) and invoice payments can be added without a rewrite.

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
  js/
    config.js                   API URL, feature flags, publishable keys
    main.js                     home page entry point
    modules/                    UI behaviour, one concern per file
      nav.js                    mobile nav toggle
      reveal.js                 scroll-reveal
      counters.js               count-up figures in the hero
      contact-form.js           enquiry form submit
    services/                   everything that talks to a backend
      api.js                    fetch wrapper: auth header, JSON, error shape
      auth.js                   sign-in / session for the client portal
      profile.js                per-client profile, documents, engagements
      payments.js               invoices and gateway checkout
      enquiries.js              consultation enquiry submissions
```

### Conventions

- **Styles:** anything used on more than one page goes in `core/`; page-specific
  styles go in `pages/<page>.css`. A page links `main.css` plus its own file.
  Never hard-code a colour — add a token.
- **Scripts:** `modules/` touch the DOM, `services/` touch the network, and
  they don't cross over. One entry point per page composes what it needs.
- **Reusable markup hooks:** `data-*` attributes (`data-nav-toggle`,
  `data-counters`), so styling classes stay free to change.
- Sections on the ivory background use `class="section--paper"`.

## Adding the client portal

1. Set `config.apiBaseUrl` and flip `config.features.clientPortal` to `true`.
2. Add `pages/sign-in.html` and `pages/profile.html`, each linking
   `assets/css/main.css` + a new `assets/css/pages/portal.css`, with
   `assets/js/portal.js` as the entry point.
3. `services/auth.js` and `services/profile.js` already define the endpoints
   the backend needs to expose (`/auth/login`, `/auth/me`, `/me/profile`,
   `/me/documents`, `/me/engagements`). Adjust there, not in the pages.
4. The profile endpoints are deliberately scoped to `/me/...` — the server
   resolves the client from the session token, never from a URL parameter, so
   one client cannot read another's filings.

Note: with no build step, nav and footer markup would be duplicated per page.
Two or three pages is fine to duplicate; beyond that, either inject the shared
chrome from a small module or introduce a static site generator.

## Adding payments

`services/payments.js` implements the browser half of the flow and documents
the server half. The two rules that matter:

- The amount is always determined server-side from the invoice. Never send an
  amount from the browser.
- The gateway **webhook** is what marks an invoice paid. The browser callback
  is for UI feedback only — it can be forged.

Set `config.payments.provider`, `config.payments.publicKey`, and flip
`config.features.payments`. The gateway secret stays on the server.

## Still to wire up

- The enquiry form has no backend yet. Until `config.apiBaseUrl` is set it
  shows the confirmation panel locally and logs the payload to the console;
  nothing is sent anywhere.
- `components.css` contains `.team-*` and `.testi-*` styles that no markup
  currently uses — kept for the team and testimonials sections the design
  anticipates. Delete them if those sections aren't happening.
- The hero figures (12 years, 300 clients, 15 team members, 99% on-time) are
  placeholders from the original page; confirm before going live.
