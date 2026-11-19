# EventPage

Event pages, ticketing and door check-in for electronic music — clubs, DJs, beach parties and small festivals.

**Vertical slice:** create event → design page → publish → buy ticket → verified payment → QR ticket → scan at the door.

## Quick start

Requires Node 24+, pnpm, and PostgreSQL 15+.

```bash
pnpm install
cp .env.example .env.local        # fill in secrets (see below)
createdb eventpage && createdb eventpage_test
pnpm db:migrate
pnpm db:seed                      # demo org, "Neon Tide" event, door-staff account
pnpm dev
```

Demo logins are written to `.seed-credentials.local` (gitignored). Then open:

| URL | What |
| --- | --- |
| `/` | Landing page |
| `/e/neon-tide` | Public event page + checkout |
| `/dashboard` | Organizer dashboard (sign in as the organizer) |
| `/scan` | Door scanner (sign in as door staff) |

### Payments in development

* **No Stripe keys** → paid checkouts go to a clearly-labelled **local test gateway** (`/test-gateway/…`). It delivers an HMAC-signed webhook to `/api/webhooks/test-gateway`; only that verified webhook issues tickets. It is hard-disabled when `NODE_ENV=production` or when Stripe is configured.
* **Stripe test mode** → set `STRIPE_SECRET_KEY=sk_test_…`, then forward webhooks:

  ```bash
  stripe listen --forward-to localhost:3000/api/webhooks/stripe
  ```

  and put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`. Subscribe production webhooks to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.

## Architecture

```
src/
  app/
    e/[slug]            public event page (server-rendered)
    orders/[id]         buyer's ticket wallet (bearer-token link, polls until payment verified)
    dashboard/…         organizer: events, metrics, inventory, attendees, staff, editor
    scan/…              door: event picker + camera scanner
    api/webhooks/…      Stripe + test-gateway webhooks (signature-verified, deduplicated)
    api/scan            atomic check-in
    actions/            server actions (auth, checkout, event management)
  components/event      EventView (shared by public page + editor preview), hero art, ticket selector
  components/editor     visual editor + panels
  lib/
    tickets/orders.ts   reservation, fulfilment, expiry, refunds  ← the ticketing engine
    tickets/checkin.ts  atomic admission
    auth/access.ts      tenant isolation (every organizer/staff check goes through here)
    security/           QR token signing, rate limiting, crypto helpers
    payments/           Stripe adapter, test gateway, webhook dispatch
```

**Stack:** Next.js 16 (App Router, server actions), TypeScript, Tailwind CSS 4, PostgreSQL via Drizzle ORM, Stripe Checkout, Vercel Blob (optional), self-hosted fonts via Fontsource.

### Ticketing guarantees

| Guarantee | How |
| --- | --- |
| No overselling | Checkout locks the event row (`FOR UPDATE`), reserves with a conditional `UPDATE … WHERE sold + reserved + qty <= capacity`, and a DB `CHECK (sold + reserved <= capacity)` backs it up. Event-wide capacity is enforced too. |
| No ticket before payment | Paid orders are created `pending`. Only `fulfillOrder()` issues tickets, and it is called only from signature-verified webhooks (or for €0 orders). The order page polls server state — it never infers success from a redirect. |
| Amount integrity | Fulfilment compares the provider's captured amount + currency to the order total; a mismatch issues nothing and is flagged for refund. |
| Idempotent issuance | Order row lock + `pending → paid` transition, `UNIQUE (order_item_id, seq)` on tickets, webhook-event dedupe table, Stripe idempotency keys. |
| Abandoned checkouts | Reservations expire after 35 min (outliving Stripe's 30-min session). A late payment re-acquires inventory if available, otherwise is auto-refunded. |
| No double admission | Check-in is one conditional `UPDATE tickets SET status='checked_in' WHERE id=… AND event_id=… AND status='valid'`. Concurrent scans have exactly one winner. Every scan is audit-logged. |
| Unforgeable QR | `EP1.<ticket id>.<HMAC-SHA256 truncated to 128 bits>`; validity (used/void/refunded) is still decided server-side. |
| Refunds | Unused tickets are voided immediately and returned to inventory; Stripe refund confirmed by `charge.refunded`. |

### Security model

* Sessions: random 256-bit tokens in `HttpOnly; SameSite=Lax; Secure` cookies; only SHA-256 hashes are stored.
* Passwords: scrypt (N=2¹⁵); constant-time compare; dummy hash for unknown emails.
* Tenant isolation: `canAccessEvent(user, event, "manage" | "scan")`. Staff only reach events they're assigned to, and only while still members of that org. Unauthorized resources return 404.
* CSRF: server actions have built-in origin checks; route handlers that mutate check `Origin`.
* Rate limits: sign-up, login (per IP, per email+IP, per email), checkout, scan, upload, order status. Client IP comes only from a proxy-controlled header (`TRUSTED_IP_HEADER`, auto on Vercel) — never from spoofable `X-Forwarded-For`.
* Anti-hoarding: one email can hold at most 20 unpaid tickets per event; free tiers are limited per person; each network has an hourly ticket budget per event.
* Post-login redirects are limited to `/dashboard` and `/scan` paths.
* Uploads: magic-byte sniffing (JPEG/PNG/WebP/AVIF only — no SVG), 6 MB cap, random names.
* User links: only `https://` URLs accepted; hero images only from our own storage.
* Personal data: buyer name + email only. Door staff see first name + last initial.
* Headers: HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer, camera limited to same origin.

## Tests

```bash
pnpm test        # integration tests against eventpage_test (real Postgres)
pnpm typecheck
pnpm lint
```

Covers: anti-hoarding caps, late payments vs. event-wide capacity, cancelled events (no fulfilment, no admission), redirect allow-list, IP-header trust, concurrent oversell attempts, event-wide capacity, draft/foreign ticket types, reservation expiry, no tickets before payment, concurrent duplicate webhooks, amount mismatch, late payment after resale, free orders, refunds, 12 concurrent scanners on one ticket, forged/tampered QR tokens, wrong-event tickets, manual codes, refunded tickets, tenant/staff authorization, password hashing, webhook signatures.

## Before going to production

Not done yet — deliberately listed so nobody mistakes this for production-ready:

1. **Shared rate-limit store + bot challenge.** The limiter is in-memory (correct for one process) — use Redis/Upstash for multiple instances, set `TRUSTED_IP_HEADER` off Vercel, and add Turnstile/hCaptcha to checkout for high-demand on-sales.
2. **Ticket email delivery** (e.g. Resend/Postmark). Today the buyer gets their wallet link on screen only; Stripe's receipt email is the fallback.
3. **Stripe end-to-end run** with real test keys + `stripe listen` (the adapter is implemented but was verified only via the local test gateway in this environment).
4. **Cron** for `/api/cron/expire-orders` every 5 min (checkout also expires stale holds opportunistically).
5. **Stripe Connect** for paying out organizers, plus fees/VAT handling.
6. Content-Security-Policy, error monitoring (Sentry), DB backups, and a load test of a busy on-sale.
7. Account features: password reset, email verification, 2FA for organizers.
8. Offline door mode (signed allow-list cache) for venues with bad signal.
