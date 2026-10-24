# Thread & Co. (ecommerceapp)

Next.js 16 (App Router, TypeScript) clothing store with Postgres (Neon free tier) + Drizzle, Better Auth,
Razorpay (**test mode**, INR) and Tailwind 4. Amounts are integer paise; the server computes every price.

## Run

```
cp .env.example .env      # fill in DATABASE_URL, BETTER_AUTH_SECRET, RAZORPAY_* test keys
npm install
npx drizzle-kit migrate   # applies drizzle/*.sql
npm run db:seed           # 16 products, promo codes (WELCOME10, FREESHIP, FLAT200), admin (password printed once)
npm run dev               # http://localhost:3000
```

`PAYMENT_PROVIDER=mock` runs with no Razorpay account (simulated pay endpoint, disabled otherwise).

## Checks

| Command | What |
| --- | --- |
| `npm run typecheck` / `npm run lint` | tsc, eslint |
| `npm test` | Vitest: pricing, state machine, signatures, and **integration tests against the DB in `.env`** (oversell race, idempotency, webhook replay, amount tamper, reservation expiry, promo cap). They create tagged rows and delete them. |
| `npm run build && npm run test:e2e` | Playwright against the production build on :3100 (golden path to the real Razorpay test modal, forged-price request, axe on 5 pages). Leaves a pending order; clean up with `npx tsx scripts/release-test-orders.ts`. |

## Payments

Order is created server-side (`/api/checkout`) from the **server cart**. Paid is set in one idempotent function,
`markOrderPaid`, reached from `/api/razorpay/verify` (browser handler signature + a fetch of the payment from
Razorpay) and `/api/razorpay/webhook` (HMAC over the raw body, deduped on `X-Razorpay-Event-Id`).
For webhooks to work locally, expose the app with a tunnel, add the URL in the Razorpay dashboard (test mode) for
`payment.captured`, and put the secret in `RAZORPAY_WEBHOOK_SECRET`. Without it the webhook rejects everything.

## Production readiness

Added: `/api/health` (DB-backed probe), structured JSON logging (`lib/logger.ts`), HSTS, `global-error` boundary,
DB pool timeouts + idle-error handler, no SQL leakage from checkout errors, deployed-production env checks
(`CRON_SECRET`, webhook secret, https `APP_URL`, no mock provider), a Dockerfile (standalone output, non-root,
healthcheck) and CI (typecheck, lint, unit tests, build, `npm audit`).

Integrations (all configured by env, see `.env.example`):
- **Rate limiting:** Redis (`REDIS_URL`, `ioredis`, atomic INCR+PEXPIRE). Falls back to per-process memory when unset or if Redis errors.
- **Email:** Resend (`EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `EMAIL_FROM` on a verified domain). Never fails an order; idempotent per order.
- **Monitoring (all free tiers):** Sentry for errors (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`; server, client, and `log.error`), Axiom for searchable logs (`AXIOM_TOKEN`, `AXIOM_DATASET`; batched, best-effort), and an UptimeRobot (or Better Stack) HTTP check on `/api/health` for downtime alerts (configured in their dashboard, not in code). Source maps upload at build when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` are set (build-time secrets only).
- A deployed production boot fails fast if any of these (plus `CRON_SECRET`, webhook secret) are missing.
- **Test DB:** `.env.test` (git-ignored) holds a disposable Neon `DATABASE_URL`. `npm run db:migrate:test`, `npm run test:integration`.

Still needed: schedule `/api/cron/release` with `CRON_SECRET`; DB backups/PITR and a `drizzle-kit migrate` deploy step;
live Razorpay keys (blocked by `lib/env.ts` on purpose), refunds, tax compliance.
