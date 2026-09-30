# Using this SDK in an application

This file guides coding agents implementing a Paymentic integration with `@kamilklasa/paymentic-sdk-node`. Read `README.md` for usage examples. Treat `src/index.ts` and the exported TypeScript definitions as the source of truth when an API detail matters; update this map when the public API changes.

## Start here

1. Use this package on the server with Node.js 24+. Construct `new PaymenticClient({ apiKey, environment: 'sandbox' | 'production', timeoutMs? })`. Optional `baseUrl` and `fetch` are transport overrides.
2. Keep the API key and webhook signature key in server-side secrets. The webhook key is separate from the API key.
3. Pass a Paymentic payment point ID as `pointId`. Amounts are decimal **strings**, including amounts returned by the API. Use the exported request and response types for optional fields instead of guessing their shape.
4. Each client method accepts an optional final `{ signal?: AbortSignal }` argument. The client never retries requests. Reconcile a timed-out mutation before submitting it again.

## Public operations

All methods below belong to `PaymenticClient`. The types and exact optional fields are exported from `src/index.ts`.

| Method | Arguments before optional `RequestOptions` | Returns | Use |
| --- | --- | --- | --- |
| `ping` | none | `PingResponse` | Check API connectivity and token information. |
| `getPointChannels` | `pointId` | `PointChannel[]` | Read the point's available payment channels and limits. |
| `createTransaction` | `pointId, CreateTransactionRequest` | `CreateTransactionResponse` | Create a payment. Requires string `amount` and `title`; response has `id` and may have `redirectUrl`. |
| `getTransaction` | `pointId, transactionId` | `TransactionDetails` | Read status, amount, payment details, and capture state. |
| `listTransactions` | `pointId, ListTransactionsParams?` | `ListTransactionsResponse` | Filter, search, and page transactions. Results are in `data`; page metadata is in `pagination`. |
| `captureTransaction` | `pointId, transactionId` | `Record<string, unknown>` | Request manual capture; the v1.2 success data is an empty object. |
| `processBlikTransaction` | `pointId, transactionId, ProcessBlikTransactionRequest` | `ProcessBlikTransactionResponse` | Submit BLIK `CODE` or `ALIAS` processing; `code` is required for both request types. |
| `createRefund` | `pointId, transactionId, CreateRefundRequest` | `CreateRefundResponse` | Create a refund with string `amount`, optional `reason` and `externalReferenceId`. |
| `getRefund` | `pointId, transactionId, refundId` | `RefundDetails` | Read refund status and amount. |

Call `verifyWebhook(rawBody, headers, signatureKey)` separately from the client. Pass the original body as a string or `Uint8Array` and the incoming headers as `HeadersInit`. It verifies the signature before parsing the JSON and returns a union discriminated by `event`: `PAYMENT.TRANSACTION_STATUS_CHANGED`, `PAYMENT.REFUND_STATUS_CHANGED`, or `PAYMENT.TRANSACTION_BLIK_STATUS_CHANGED`. Handle each event explicitly and persist `notificationId` with the state update so duplicate delivery is idempotent.

## Types and error handling

- `TransactionStatus`: `CREATED | PENDING | PAID | FAILED | EXPIRED`. `RefundStatus`: `CREATED | ACCEPTED | PENDING | DONE | REJECTED | CANCELLED`.
- `CreateTransactionRequest` includes optional customer, order, addresses, cart, redirect, and payment method settings. `ListTransactionsParams` has `filter`, `query`, and `page` fields. Consult their exported definitions for the accepted keys.
- `PaymenticApiError` exposes HTTP `status` and an `errors` array. `PaymenticNetworkError` covers transport failures or malformed successful responses. `PaymenticAbortError.reason` is `signal` or `timeout`. Invalid local arguments can throw `TypeError`.
- Webhook errors are `PaymenticWebhookHeaderError`, `PaymenticWebhookSignatureError`, `PaymenticWebhookPayloadError`, and `PaymenticUnsupportedWebhookEventError`.
- The deprecated `title` property on `CreateRefundRequest` is ignored by the SDK; Paymentic does not accept it.

For application code, verify webhook signatures before using payloads, compare the point, order reference, amount, and currency with server-side order data, and inspect `isCaptured` when confirming manual capture. See `README.md` for examples and deployment guidance.
