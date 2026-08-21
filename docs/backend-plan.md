# Backend plan — auth, credits, payments

Decisions this plan is built on:

| | |
|---|---|
| Auth | Firebase Authentication — Google sign-in + email/password |
| Database | Cloud Firestore |
| Backend | Firebase Cloud Functions (v2), region `asia-south1` |
| Payments | Razorpay Orders API + Checkout, UPI, INR |
| Credit unit | 1 credit = one async written query answered by a CA |
| Free credits | 3, granted once per verified phone number, ever |

---

## 1. The one rule everything else follows

**The browser never writes a credit balance, an order status, or a price.**

Firestore security rules deny all client writes to money-bearing documents. Every
balance change goes through a Cloud Function using the Admin SDK, which bypasses
rules. If a path can be reached without that function, it's a bug.

```
  BROWSER                      CLOUD FUNCTIONS              FIRESTORE
  (untrusted)                  (trusted, Admin SDK)
  ─────────────────────────────────────────────────────────────────────
  Firebase Auth SDK
   └─ ID token ───────────────▶ verifyIdToken()
                                     │
  read own profile ────────────────────────────────────────▶ rules: own uid
  read own ledger  ────────────────────────────────────────▶ rules: read-only
  read credit packs ───────────────────────────────────────▶ rules: public read

  buy credits ───────────────▶ POST /credits/orders
                                 price read server-side ──▶ creditPacks/{id}
                                 razorpay.orders.create()
                                 write order ─────────────▶ orders/{id}
                              ◀── orderId + keyId
   └─ Razorpay Checkout (UPI)
        │
        ├─ handler ──────────▶ POST /credits/verify ───┐
        │                       (HMAC, fast feedback)  │  both call the same
  RAZORPAY ──── webhook ─────▶ POST /razorpay/webhook ─┤  idempotent function
                                (HMAC, authoritative)  │
                                                       ▼
                                            grantCreditsForOrder()
                                              transaction ─────▶ balance + ledger

  ask a question ────────────▶ POST /consultations
                                transaction: debit 1 ───▶ balance + ledger + thread
```

Two independent paths can confirm a payment (browser callback and webhook) and
both funnel into one idempotent function. Whichever arrives first grants the
credits; the second is a no-op. This matters specifically for UPI — see §5.

---

## 2. Firestore data model

The ledger is the source of truth; `creditBalance` is a denormalised cache of it
so the UI can read a balance in one document read. Every mutation writes both, in
the same transaction. For an accounting practice this is the right shape — the
credit history is append-only and auditable, and you can always recompute a
balance from the ledger to prove the cache is honest.

```
users/{uid}
  displayName, email, emailVerified
  phone, phoneVerifiedAt          ← set when the phone credential is linked
  pan, gstin, billingAddress      ← client-editable profile fields
  role: 'client' | 'staff' | 'admin'
  creditBalance: number           ← server-written only
  freeCreditsGrantedAt: timestamp ← presence = already granted, idempotency flag
  createdAt, updatedAt

users/{uid}/creditLedger/{entryId}          ← append-only, never updated or deleted
  delta: number                   ← +3, +10, -1
  reason: 'signup_grant' | 'purchase' | 'consultation_spend'
        | 'consultation_refund' | 'admin_adjust'
  balanceAfter: number            ← lets you audit the cache without replaying
  orderId?, consultationId?, actorUid?, note?
  createdAt

creditPacks/{packId}                        ← public read; the only source of price
  credits: 5
  amountPaise: 250000             ← integer paise, never a float, never from client
  label: '5 consultations'
  active: bool
  sortOrder: number

orders/{razorpayOrderId}                    ← Razorpay's order id as the doc id
  uid, packId, credits, amountPaise, currency: 'INR'
  status: 'created' | 'paid' | 'failed' | 'refunded'
  razorpayPaymentId?, method?     ← 'upi', for reconciliation
  createdAt, paidAt?, failureReason?

consultations/{id}
  uid, subject
  category                        ← reuse the service list already in the site form
  body
  attachments: [{ path, name, sizeBytes, contentType }]
  status: 'open' | 'in_progress' | 'answered' | 'closed_refunded'
  creditCost: 1
  ledgerEntryId                   ← the debit, so a refund can reference it
  assignedStaffUid?
  createdAt, slaDueAt, answeredAt?

consultations/{id}/messages/{msgId}
  authorUid, authorRole: 'client' | 'staff'
  body, attachments, createdAt

freeCreditGrants/{phoneHash}                ← server-only; one doc per phone, ever
  uid, grantedAt                  ← doc id = HMAC(phone, pepper), see §4

webhookEvents/{razorpayEventId}             ← server-only; idempotency guard
  type, orderId, receivedAt

invoices/{invoiceNumber}                    ← see §9, GST
```

### Follow-up messages are free

A credit buys a resolved question, not a single reply. Charging per message
pushes clients to cram everything into one badly-worded question and makes them
feel metered mid-conversation. Debit on thread creation; replies within the
thread cost nothing until staff mark it `answered`.

---

## 3. Security rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn()   { return request.auth != null; }
    function isOwner(uid) { return signedIn() && request.auth.uid == uid; }
    function isStaff()    { return signedIn() && request.auth.token.role in ['staff','admin']; }
    function touchedKeys(){ return request.resource.data.diff(resource.data).affectedKeys(); }

    match /users/{uid} {
      allow read:   if isOwner(uid) || isStaff();
      // A client may edit their own profile fields and nothing else. Note what is
      // absent: creditBalance, role, freeCreditsGrantedAt, phoneVerifiedAt.
      allow update: if isOwner(uid) && touchedKeys().hasOnly(
        ['displayName','pan','gstin','billingAddress','updatedAt']);
      allow create, delete: if false;

      match /creditLedger/{entryId} {
        allow read:  if isOwner(uid) || isStaff();
        allow write: if false;
      }
    }

    match /creditPacks/{packId} {
      allow read:  if true;
      allow write: if false;
    }

    match /orders/{orderId} {
      allow read:  if signedIn() && resource.data.uid == request.auth.uid;
      allow write: if false;
    }

    match /consultations/{id} {
      allow read:  if signedIn() && (resource.data.uid == request.auth.uid || isStaff());
      allow write: if false;          // creating one must debit a credit → server only
      match /messages/{msgId} {
        allow read:  if signedIn() && (get(/databases/$(database)/documents/consultations/$(id))
                                        .data.uid == request.auth.uid || isStaff());
        allow write: if false;        // server enforces thread state and authorship
      }
    }

    match /freeCreditGrants/{phoneHash} { allow read, write: if false; }
    match /webhookEvents/{eventId}      { allow read, write: if false; }
  }
}
```

Storage rules for attachments — the client uploads directly to Storage, then
sends the paths to the API, which verifies the objects exist and are owned by
that uid before attaching them:

```javascript
match /consultations/{uid}/{allPaths=**} {
  allow read:  if request.auth.uid == uid
               || request.auth.token.role in ['staff','admin'];
  allow write: if request.auth.uid == uid
               && request.resource.size < 20 * 1024 * 1024
               && request.resource.contentType.matches('application/pdf|image/.*');
}
```

Write rules tests for these. `@firebase/rules-unit-testing` against the emulator
turns "I think clients can't write their own balance" into a test that fails
loudly when someone loosens a rule.

---

## 4. Auth and the free-credit grant

### Sign-in

Google (`signInWithPopup`) and email/password. Two things to handle:

- **Email verification.** Grant nothing to an unverified email/password account.
  `sendEmailVerification()` on signup, and check `emailVerified` on the ID token
  server-side. Customise the Firebase email templates — the defaults look like
  phishing and will hurt trust for a firm handling people's tax data.
- **Account collision.** A user who signs up with email/password and later clicks
  "Sign in with Google" on the same address hits
  `auth/account-exists-with-different-credential`. Handle it by prompting for the
  password and calling `linkWithCredential`, so they end up with one account
  instead of a dead end. This *will* happen with both methods enabled.

### Phone verification, and why the grant is keyed on it

Free credits are the one thing on the site with a direct cost to the firm and no
payment attached, so it's the one thing worth hardening. Google accounts and
email addresses are free and unlimited; phone numbers are not.

After sign-in, the portal asks the user to verify a phone number
(`linkWithPhoneNumber` + `RecaptchaVerifier`), which links a phone credential to
their existing account. On success:

```
POST /me/claim-free-credits

  decoded = verifyIdToken(idToken)
  if (!decoded.phone_number) → 403 PHONE_NOT_VERIFIED

  phoneHash = HMAC_SHA256(decoded.phone_number, PHONE_PEPPER)   // pepper in Secret Manager

  transaction:
    user = get(users/{uid})
    if (user.freeCreditsGrantedAt) → return { alreadyGranted: true }

    transaction.create(freeCreditGrants/{phoneHash}, { uid, grantedAt })
      // create() fails if the doc exists → this phone already claimed, ever.
      // Catch and return 409 PHONE_ALREADY_CLAIMED.

    user.creditBalance += 3
    user.freeCreditsGrantedAt = now
    create ledger entry { delta: +3, reason: 'signup_grant', balanceAfter }
```

Two guards, both needed. `freeCreditsGrantedAt` stops the same account claiming
twice. The `freeCreditGrants/{phoneHash}` document stops someone deleting their
account and re-registering with the same phone — the phone record outlives the
user record deliberately.

**Hash the phone number with a server-side pepper.** A plain SHA-256 of a
10-digit Indian mobile is trivially brute-forced, so an unpeppered collection is
a plaintext phone directory in all but name. The pepper lives in Secret Manager
and never rotates without a migration.

**Don't grant on an Auth `onCreate` trigger.** It runs outside the signup
transaction, fails silently, and fires before a phone is linked. Grant on an
explicit authenticated call instead: it's idempotent, observable, and returns a
real error to the UI.

### Staff and admin

Custom claims: `setCustomUserClaims(uid, { role: 'staff' })`, set from an admin-only
function or a one-off script. Claims land in the ID token, which is how the
`isStaff()` rule works. They only refresh when the token does (up to an hour), so
call `getIdToken(true)` after a role change.

---

## 5. Payments — Razorpay, UPI, INR

### Order creation

```
POST /credits/orders  { packId }

  decoded = verifyIdToken(idToken)
  pack = get(creditPacks/{packId})            ← price comes from here, never the request
  if (!pack.active) → 400

  order = razorpay.orders.create({
    amount:   pack.amountPaise,               ← integer paise. ₹500 = 50000
    currency: 'INR',
    receipt:  `np_${uid}_${Date.now()}`,
    notes:    { uid, packId, credits: String(pack.credits) }
  })

  write orders/{order.id} { uid, packId, credits: pack.credits,
                            amountPaise: pack.amountPaise, status: 'created', createdAt }

  return { orderId: order.id, amountPaise, currency: 'INR', keyId: RAZORPAY_KEY_ID }
```

The request carries a `packId` and nothing else. If it carried an amount, someone
would send `amount: 100` for ten credits.

### Checkout

`config.payments.publicKey` in the existing `assets/js/config.js` holds the
`key_id` (publishable). `key_secret` never leaves the server.

```javascript
new Razorpay({
  key: keyId,
  order_id: orderId,
  amount, currency: 'INR',
  name: 'Nisarg Pathak & Co',
  description: 'Consultation credits',
  prefill: { name, email, contact },       // contact prefill matters for UPI
  handler: (res) => verify(res),           // → POST /credits/verify
  modal: { ondismiss: () => {} },
});
```

UPI is enabled by default on an activated INR account; use `config.display.blocks`
if you want UPI shown first.

### Verification — two paths, one grant

```
POST /credits/verify  { razorpay_order_id, razorpay_payment_id, razorpay_signature }

  expected = HMAC_SHA256(`${order_id}|${payment_id}`, RAZORPAY_KEY_SECRET)
  if (!timingSafeEqual(expected, signature)) → 400
  grantCreditsForOrder(order_id, payment_id)
  return current balance
```

```
POST /razorpay/webhook            ← public endpoint, no ID token

  expected = HMAC_SHA256(req.rawBody, RAZORPAY_WEBHOOK_SECRET)
  if (!timingSafeEqual(expected, req.headers['x-razorpay-signature'])) → 400

  transaction.create(webhookEvents/{event.id})    ← duplicate delivery → no-op
  switch (event.event) {
    case 'order.paid':
    case 'payment.captured':  grantCreditsForOrder(...); break;
    case 'payment.failed':    mark order failed; break;
    case 'refund.processed':  claw back credits; break;
  }
  return 200
```

Four things that bite here:

1. **The webhook is not optional.** With UPI the user leaves your page for their
   payment app. They may approve the collect request and never come back, or the
   browser may be killed. The `handler` callback is best-effort UI feedback; the
   webhook is the only path that always fires. Building card-first and adding the
   webhook later means silently losing UPI payments you've been paid for.
2. **Sign the raw body, not the parsed JSON.** Re-serialising changes bytes and
   the HMAC won't match. Firebase Functions exposes `req.rawBody` on `onRequest`
   — use it, and don't put body-parsing middleware in front that discards it.
3. **The webhook secret is a different secret** from `key_secret`. You set it
   yourself when creating the webhook in the Razorpay dashboard.
4. **Don't enforce App Check on the webhook.** Razorpay can't send an App Check
   token. That endpoint's authentication *is* the HMAC signature. Enforce App
   Check on every other endpoint.

Razorpay retries non-2xx responses, so return 200 quickly and do slow work
afterwards — but grant the credits before responding, since that's the whole job.

### The only function that creates credits

```
grantCreditsForOrder(orderId, paymentId):
  transaction:
    order = get(orders/{orderId})
    if (!order) → throw
    if (order.status === 'paid') → return { alreadyGranted: true }    ← idempotency
    user = get(users/{order.uid})
    balanceAfter = user.creditBalance + order.credits
    update order { status: 'paid', paidAt, razorpayPaymentId: paymentId }
    update user  { creditBalance: balanceAfter }
    create users/{order.uid}/creditLedger/{auto} {
      delta: +order.credits, reason: 'purchase', orderId, balanceAfter }
```

The status check *inside* the transaction is what makes concurrent webhook and
verify calls safe. Read-then-write outside a transaction double-grants.

---

## 6. Spending a credit

```
POST /consultations  { subject, category, body, attachmentPaths[] }

  decoded = verifyIdToken(idToken)
  verify each attachmentPath exists in Storage under consultations/{uid}/
  transaction:
    user = get(users/{uid})
    if (user.creditBalance < 1) → 409 INSUFFICIENT_CREDITS
    balanceAfter = user.creditBalance - 1
    update user { creditBalance: balanceAfter }
    ledgerRef = create ledger { delta: -1, reason: 'consultation_spend', balanceAfter }
    create consultations/{auto} { ..., status: 'open', creditCost: 1,
                                  ledgerEntryId: ledgerRef.id, slaDueAt }
```

Transactional, so two tabs submitting at once can't both spend the last credit.

**Refund policy — decide this before launch.** If staff close a question without
answering it (out of scope, duplicate, unanswerable), the credit should come
back: `reason: 'consultation_refund'`, status `closed_refunded`, referencing
`ledgerEntryId`. Without this, the first out-of-scope question a client asks
feels like theft. Also decide whether credits expire; if they do, expiry is
another ledger reason, and prepaid credits that expire have GST implications
you'll want to look at (§9).

---

## 7. Project structure

Building on the existing layout. The `services/` and `modules/` split already in
place holds up — `services/` gains Firebase, `modules/` gains portal UI.

```
index.html
pages/
  sign-in.html            Google + email/password, account-linking recovery
  dashboard.html          balance, open questions, phone-verification prompt
  ask.html                new consultation form (spends a credit)
  consultation.html       one thread
  credits.html            packs + Razorpay Checkout + ledger history
  terms.html  privacy.html  refund-policy.html      ← Razorpay needs these, §10
assets/
  css/pages/portal.css, credits.css
  js/
    config.js             + firebaseConfig, + packs cache
    portal.js  ask.js  credits.js                   ← per-page entry points
    modules/
      auth-guard.js       redirect if signed out; wait for onAuthStateChanged
      phone-verify.js     linkWithPhoneNumber + reCAPTCHA
      credit-meter.js     balance display
    services/
      firebase.js         initializeApp, getAuth, getFirestore, App Check
      auth.js             REWRITE for Firebase (see below)
      api.js              MODIFY: bearer = await getIdToken()
      credits.js          packs, balance, ledger, buy flow
      payments.js         REWRITE: order → Checkout → verify
      consultations.js    create, list, thread, reply
functions/                                          ← new, Node 20, TypeScript
  src/
    index.ts
    middleware/auth.ts        verifyIdToken, requireRole, App Check
    http/credits.ts           POST /credits/orders, /credits/verify
    http/consultations.ts     POST /consultations, replies
    http/me.ts                profile, claim-free-credits
    webhooks/razorpay.ts      HMAC + idempotency
    lib/credits.ts            grantCreditsForOrder, spendCredit, refundCredit
    lib/razorpay.ts           SDK client, signature helpers
    lib/firestore.ts          typed converters
firestore.rules  firestore.indexes.json  storage.rules  firebase.json
```

### Changes to code that already exists

- **`services/auth.js` gets replaced.** It currently posts to `/auth/login` and
  keeps a token in `sessionStorage`. Firebase owns the session instead, and the
  bearer token becomes a short-lived ID token from
  `auth.currentUser.getIdToken()`. Don't cache it yourself — it expires hourly and
  the SDK refreshes it for you.
- **`services/api.js` needs one change:** `getToken()` becomes
  `await getIdToken()`, so the header assembly in `request()` becomes async. The
  `ApiError` / `NetworkError` / `NoBackendError` shapes stay as they are.
- **`services/payments.js` gets replaced** with the order → Checkout → verify
  flow above. The documented contract in the current stub is close, but the
  amount must come from a `packId`.
- **`config.js`** gains `firebaseConfig` and keeps `payments.publicKey` for
  `key_id`. Still nothing secret in it.

### Nav and footer duplication

The README already flags this. Ten-plus pages is past the point where duplicating
chrome by hand is fine. Either inject shared nav/footer from a small module on
DOM ready, or accept a build step. Worth settling before writing the portal pages,
not after.

---

## 8. Environment and secrets

| Secret | Where | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID` | function param / config.js | ships to the browser, not secret |
| `RAZORPAY_KEY_SECRET` | Secret Manager | signs the checkout HMAC |
| `RAZORPAY_WEBHOOK_SECRET` | Secret Manager | different value, set in dashboard |
| `PHONE_PEPPER` | Secret Manager | rotating it orphans every grant record |

Use `defineSecret()` from `firebase-functions/params`. `functions.config()` is
gone in v2. Firebase service-account credentials are implicit inside Functions —
no key file needed.

**Region: `asia-south1` (Mumbai)** for Firestore, Functions and Storage. Lowest
latency for Indian clients and it keeps data in-country.

> A Firestore database's location is **permanent**. It cannot be changed after
> creation — the only fix is a new project and a data migration. Set it correctly
> on the very first day.

Run everything locally against `firebase emulators:start` (auth, firestore,
functions, storage). For webhooks, point a `cloudflared`/`ngrok` tunnel at the
functions emulator and register that URL as a test webhook.

---

## 9. GST and invoicing

You are the domain expert here, so this is a flag rather than advice. Two things
the build needs from you:

- **Treatment of prepaid credits.** Money taken for credits is received before the
  service is delivered. Whether that's an advance receipt at purchase or a supply
  at consumption changes what you invoice, when, and what the ledger has to
  record. It also affects credit expiry. Settle this before the schema is
  populated with real money, because retrofitting it means rewriting history.
- **Invoice fields.** Whatever the answer, the `invoices` collection needs a
  gapless invoice number series, the client's GSTIN where they have one, place of
  supply, SAC code, and the tax breakup. Gapless numbering under concurrency needs
  a Firestore counter document in a transaction — not `Date.now()`.

Also worth checking against your own compliance work: what you must retain and for
how long, and what a client is entitled to have deleted, given the portal will
hold PAN numbers and financial documents.

---

## 10. Razorpay account prerequisites — start now

Activation is gated on KYC (PAN, GST registration if you have one, bank proof) and
on your site having these pages **live and reachable**:

- Terms & Conditions
- Privacy Policy
- Refund / Cancellation Policy
- Contact Us
- Pricing

Activation takes days, and this is the classic thing that turns out to be the
blocker after the code works. Start the application while building against test
keys (`rzp_test_...`; test VPAs `success@razorpay` and `failure@razorpay`).

---

## 11. Build order

Each milestone ends somewhere demoable and safe to stop.

**M1 — Auth and profile, no money.** Firebase project in `asia-south1`, both
sign-in methods, account-collision handling, email verification, `users/{uid}`
document, sign-in and dashboard pages, rules + rules tests. Rewrite `auth.js`,
make `api.js` async.
*Done when:* a client signs in, edits their profile, and cannot write
`creditBalance` from the console — with a test proving it.

**M2 — Credits ledger, no payments.** Ledger schema, `spendCredit`,
`grantCreditsForOrder` (called from a script), phone linking, `claim-free-credits`
with both idempotency guards, balance UI.
*Done when:* a verified user gets 3 credits exactly once, spends them one at a
time, and hits `INSUFFICIENT_CREDITS` at zero. Test the delete-and-re-register path.

**M3 — Razorpay, test mode.** Packs collection, order creation, Checkout, verify
endpoint, webhook with HMAC and idempotency. Submit the activation application.
*Done when:* a test UPI payment grants credits, and it still works if you close
the browser before the callback fires (webhook-only path). Fire a duplicate
webhook and confirm credits are granted once.

**M4 — Consultations.** Thread schema, ask form, attachment upload with Storage
rules, free follow-up replies, SLA field, refund-on-close.
*Done when:* a client asks a question, a credit is debited, and staff can reply.

**M5 — Staff console.** Custom claims, queue view, assignment, answering, admin
credit adjustment (always via the ledger, never a direct balance write).

**M6 — Go live.** Policy pages, GST invoicing, live keys, App Check enforced,
webhook retry alerting, a scheduled job that recomputes balances from the ledger
and reports drift, and a runbook for the case where a client paid and the webhook
never landed.

---

## 12. Open questions

1. **SLA for an answer** — one business day, two, three? It goes in the UI, in
   `slaDueAt`, and in your refund policy.
2. **Pack pricing** — how many packs, what sizes, what price per credit? Needed to
   seed `creditPacks`. A single ₹X for N credits is enough to launch.
3. **Do credits expire?** Affects GST treatment and the ledger.
4. **Refund on unanswerable questions** — recommended yes; confirm.
5. **File-size and type limits** on attachments. The draft rule above allows PDFs
   and images up to 20 MB.
6. **Who is staff on day one** — just you, or a team needing the M5 console
   sooner?
