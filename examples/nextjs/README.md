# Next.js SDK example

Small App Router example for the unofficial `@kamilklasa/paymentic-sdk-node` SDK. It uses **sandbox only**, a fixed PLN 29.00 payment, and no database. Requires Node.js 24+ and pnpm 10.

## Run

From the workspace root:

```sh
pnpm install
pnpm build
cp examples/nextjs/.env.example examples/nextjs/.env.local
pnpm --filter paymentic-next-example dev
```

Before starting, fill in `.env.local`:

- `PAYMENTIC_API_KEY` and `PAYMENTIC_POINT_ID`: sandbox credentials.
- `APP_BASE_URL`: the exact browser origin, initially `http://localhost:3000`. Use your public HTTPS origin when tunneling; other origins cannot submit checkout or admin actions.
- `PAYMENTIC_WEBHOOK_SIGNATURE_KEY`: separate webhook signing key from the Paymentic panel.
- `EXAMPLE_ADMIN_PASSWORD`: a strong unique password for `/transactions` (username `admin`). Without it the panel is disabled.
- `TRUST_PROXY`: leave `false` locally. Set `true` only behind a proxy that **overwrites** incoming `X-Forwarded-For` / `X-Real-IP` with the actual client IP. This enables BLIK Level 0.

Open <http://localhost:3000>. Keep `.env.local` out of Git. Use HTTPS for remote access, including Basic authentication.

## Where to start

```text
app/
  page.tsx                  Load channels and render checkout
  layout.tsx                Fonts and styles
  globals.css               All styles, tokens, container and wrapper
  ui/
    page-shell.tsx          Shared header and page container
    payment-picker.tsx      Method selection and customer fields
    status-auto-refresh.tsx Bounded status polling
    submit-button.tsx       Pending state for admin mutations
  lib/
    paymentic.ts            Server-only sandbox client and admin authorization
    test-payment.ts         Fixed price, channel rules, status lookup
    security.ts             Origin, credentials, body limits, redirect validation
  api/checkout/route.ts      createTransaction and optional processBlikTransaction
  api/webhook/route.ts       Verify original webhook bytes
  status/page.tsx            Actual payment status and safe setup errors
  transactions/             Protected list, details, refund and capture actions
proxy.ts                    Basic authentication challenge for the panel
checkout.test.mjs           Payment rules, routes, status and webhook tests
```

To reuse the SDK, start with `lib/paymentic.ts` and the two route handlers. Copy the UI only if you need the demo checkout. Outside this workspace, install `@kamilklasa/paymentic-sdk-node` and `server-only` in your Next.js app instead of using the `workspace:*` dependency.

## Payment flow

1. The server loads available channels with `getPointChannels`. The browser can choose hosted checkout, BLIK, card or a bank transfer. Logos come directly from the channel response, with a text fallback.
2. `POST /api/checkout` checks the origin and form, reloads available channels, and creates a transaction. Amount, currency and title come from server configuration. Direct methods require customer email.
3. Hosted methods redirect to the HTTPS checkout URL. BLIK Level 0 submits the six-digit code with `processBlikTransaction`; it requires a validated client IP from the trusted proxy. Both paths return to `/status?ref=…`.
4. The status page looks up the random reference and checks the transaction through the SDK. Visiting `/status` alone never confirms payment. Both success and failure returns go to this same page. Pending payments refresh every five seconds for up to a minute. If sending a BLIK code fails after transaction creation, the reference is preserved so the page can read the actual status. Older `/success` and `/failure` URLs redirect here, preserving their query parameters.

The protected panel demonstrates `ping`, `listTransactions`, `getTransaction`, `createRefund`, `getRefund` and `captureTransaction`. For cards, “capture later” sends `autoCapture: false`; capture is allowed only after authorization and before funds have been captured. Capture rechecks the transaction before sending the request. Refund eligibility and amount are validated by Paymentic. Save the returned refund ID if you need to fetch it later.

## Webhooks and security boundaries

Configure `https://<your-host>/api/webhook` on the same sandbox point. The route passes the original bytes to `verifyWebhook`: 202 means verified, 401 means invalid signature/headers, 400 means unsupported/invalid payload, and 413 means oversized body. `GET` is not a webhook test.

The example keeps keys server-side, authenticates every admin page and action, requires the configured origin for mutations, limits checkout bodies to 8 KiB and webhook bodies to 64 KiB, and avoids logging customer details, BLIK codes or raw SDK errors. Security headers block framing and suppress referrer leakage. BLIK uses the shared reference-based status page instead of a public transaction-ID lookup. Treat the random return reference as a bearer link: anyone with it can see the limited status information.

This is a runnable integration example, not an order system. Before exposing it publicly, configure rate limits at your hosting proxy (checkout, status queries and admin login). For real orders, add user/ownership authorization, persist orders and deduplicate webhook `notificationId` before acknowledging delivery. Verified webhook events are only logged here; no goods are delivered. Pending buttons do not provide idempotency: persist operation state and prevent duplicate payment/refund/capture requests in your application. Replace demo Basic authentication with your application's authentication and permissions.

## Check

```sh
pnpm check:example
pnpm --filter paymentic-next-example check
```

The first command runs payment rules plus checkout/status/webhook flow tests against a mocked SDK transport, then a production build. The webhook tests use real signatures and verification. It does not create sandbox transactions.
