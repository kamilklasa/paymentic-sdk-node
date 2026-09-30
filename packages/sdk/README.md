# @kamilklasa/paymentic-sdk-node

Unofficial Paymentic SDK for Node.js 24+. This package is community maintained and is not affiliated with Paymentic. It currently exposes ping, transaction creation, retrieval, listing, manual capture, refund creation and retrieval, BLIK processing, payment-point channels, and webhook verification for transaction, refund, and transaction BLIK status changes.

```sh
pnpm add @kamilklasa/paymentic-sdk-node
```

```ts
import { PaymenticClient, PaymenticApiError } from '@kamilklasa/paymentic-sdk-node';

const client = new PaymenticClient({
  apiKey: process.env.PAYMENTIC_API_KEY!,
  environment: 'sandbox', // or 'production'
  timeoutMs: 5_000,
});

try {
  const ping = await client.ping();
  console.log(ping.message, ping.environment, ping.scopes);
} catch (error) {
  if (error instanceof PaymenticApiError) {
    console.error(error.status, error.errors);
  } else {
    throw error;
  }
}
```

Create a transaction with a point ID and a decimal string amount:

```ts
const transaction = await client.createTransaction('b8e6e2fc', {
  amount: '123.45',
  title: 'Order #12345',
  externalReferenceId: 'order-12345',
  redirect: {
    success: 'https://shop.example/success',
    failure: 'https://shop.example/failure',
  },
});

console.log(transaction.id, transaction.redirectUrl);
```

`createTransaction` also accepts the optional customer, order, address, cart, and payment method fields in Paymentic OpenAPI v1.2. The API decides payment rules and returns validation details through `PaymenticApiError` (`status` and `errors`). The SDK does not automatically retry the POST. The response includes `id`, an optional `redirectUrl`, and optional `whitelabel` data.

Retrieve current transaction details or request a manual capture:

```ts
const details = await client.getTransaction('b8e6e2fc', transaction.id);
console.log(details.status, details.amount, details.commission);

const accepted = await client.captureTransaction('b8e6e2fc', transaction.id);
console.log(accepted); // The v1.2 response data is an empty object.
```

`getTransaction` returns decimal amounts as strings. A missing transaction and a rejected capture throw `PaymenticApiError` with the HTTP status and available API errors. Capture sends one bodyless `PATCH` request and is never retried automatically.

List transactions with optional filters, search terms, and pagination:

```ts
const page = await client.listTransactions('b8e6e2fc', {
  filter: { status: 'PAID', providerId: 'blik', amount: '123.45' },
  query: { full: 'Order #12345' },
  page: { number: 1, size: 25 },
});

console.log(page.data[0]?.id, page.pagination.total, page.pagination.links?.next);
```

The SDK encodes filter and search names as `filter[...]` and `query[...]`, and pagination as `page[number]` and `page[size]`. Null and undefined values are omitted; empty strings are sent. Page numbers start at 1, and page size is 1–100. Date filters use the API's comma-separated date range format, such as `2024-01-01T00:00:00Z,2024-12-31T23:59:59Z`. List items preserve decimal amounts as strings, and an empty page returns `data: []` with pagination details.

Create a refund for a transaction, then read its status and details:

```ts
const refund = await client.createRefund('b8e6e2fc', transaction.id, {
  amount: '12.34',
  reason: 'Damaged item',
  externalReferenceId: 'return-123',
});

console.log(refund.id, refund.status);
const refundDetails = await client.getRefund('b8e6e2fc', transaction.id, refund.id);
console.log(refundDetails.status, refundDetails.amount, refundDetails.updatedAt);
```

Refund amounts remain decimal strings. The pinned v1.2 schema lists `title` as required but omits it from its property definitions; the live API rejects `title` as an extra field. `createRefund` sends only `amount`, optional `reason`, and optional `externalReferenceId`. Older callers may still pass `title`, but the SDK ignores it. The operation sends one POST without automatic retry. API rejections for either refund operation throw `PaymenticApiError` with the HTTP status and available error details.

Process BLIK for an existing transaction:

```ts
const blik = await client.processBlikTransaction('b8e6e2fc', transaction.id, {
  type: 'CODE',
  code: '777123',
});

console.log(blik.actionId, blik.alias);
```

The v1.2 request type also allows `type: 'ALIAS'` and an optional `alias` object with `value`, `label`, and `appId`. Its schema lists `code` as required for both types, so the SDK requires a string code in either case and leaves code format and payment rules to the API. A rejected BLIK process throws `PaymenticApiError`; inspect `status` and `errors` to distinguish a processing error and its `details.blikErrorCode`. The POST is sent once and is not retried automatically.

List the channels configured for a payment point:

```ts
const channels = await client.getPointChannels('b8e6e2fc');
for (const channel of channels) {
  console.log(channel.id, channel.name, channel.available, channel.amount?.minimum);
}
```

`getPointChannels` returns an empty array when the point has no channels. Channel fields follow the v1.2 resource, including payment method, availability, images, limits, currencies, commission, authorization, and compliance details. The OpenAPI resource does not mark individual fields as required, so the TypeScript fields are optional. A missing point throws `PaymenticApiError` with its HTTP status and available error details.

The client trims surrounding whitespace from `apiKey` before sending or redacting it. `timeoutMs`, when provided, must be an integer from 1 to 2,147,483,647 milliseconds; invalid configuration throws `TypeError` during construction. HTTP redirects are rejected to prevent forwarding payment data to another destination. A replacement `fetch` must honor the supplied redirect and abort options.

`baseUrl` overrides the selected environment URL for controlled integrations. `fetch` accepts a replacement transport. Pass `{ signal }` to any operation for cancellation. Errors are `PaymenticApiError` (HTTP status and available, redacted API details), `PaymenticNetworkError`, or `PaymenticAbortError` (with `reason` set to `signal` or `timeout`). The client does not retry requests.

Verify a v1.2 webhook with the **webhook signature key** from the Paymentic panel (separate from the API key). Pass the original body bytes or unchanged body string and the incoming headers:

```ts
import { verifyWebhook, PaymenticWebhookSignatureError } from '@kamilklasa/paymentic-sdk-node';

try {
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const notification = await verifyWebhook(rawBody, request.headers, webhookSignatureKey);
  console.log(notification.notificationId, notification.time, notification.payload.status);
} catch (error) {
  if (error instanceof PaymenticWebhookSignatureError) {
    // Reject the unauthenticated request.
  } else {
    throw error;
  }
}
```

`verifyWebhook` returns a discriminated event for `PAYMENT.TRANSACTION_STATUS_CHANGED`, `PAYMENT.REFUND_STATUS_CHANGED`, or `PAYMENT.TRANSACTION_BLIK_STATUS_CHANGED`. Each result includes `notificationId`, `time`, and its typed `payload`; transaction and refund amounts remain decimal strings. Narrow on `notification.event` to access event-specific fields:

```ts
import type { verifyWebhook } from '@kamilklasa/paymentic-sdk-node';

function handleNotification(notification: Awaited<ReturnType<typeof verifyWebhook>>) {
  switch (notification.event) {
    case 'PAYMENT.REFUND_STATUS_CHANGED':
      console.log(notification.payload.refundId, notification.payload.status);
      break;
    case 'PAYMENT.TRANSACTION_BLIK_STATUS_CHANGED':
      console.log(notification.payload.actionId, notification.payload.externalStatus);
      break;
    case 'PAYMENT.TRANSACTION_STATUS_CHANGED':
      console.log(notification.payload.transactionId, notification.payload.status);
      break;
  }
}
```

It distinguishes missing or invalid signature headers (`PaymenticWebhookHeaderError`), invalid signatures (`PaymenticWebhookSignatureError`), unsupported events (`PaymenticUnsupportedWebhookEventError`), and invalid JSON or payload fields (`PaymenticWebhookPayloadError`). The signature is checked before JSON parsing. The SDK does not store notification IDs or reject older notifications; the receiving application decides how to handle retries and freshness.

## Server deployment

Keep API and webhook-signature keys in server-only secrets. Set a finite timeout (for example, `timeoutMs: 5_000`) and pass a request-scoped `AbortSignal` where appropriate. Default destinations use HTTPS; an overridden `baseUrl` or injected `fetch` is trusted infrastructure with access to the API key.

Authenticate and authorize your own payment/refund endpoints, derive amounts from server-side orders, and persist transaction/refund IDs. A network error or timeout after a mutation does not prove that the mutation failed: reconcile its state before submitting another request. The SDK does not retry it automatically.

For webhook processing, preserve the raw body, verify the signature, check the payment point, order reference, amount and currency against the stored order, and persist `notificationId` with the state update before acknowledging delivery. Treat duplicate delivery idempotently. For manual capture, a `PAID` status alone does not establish that funds have been captured; inspect `isCaptured` as well.

BLIK Level 0 and manual capture are covered by offline contract tests; end-to-end verification in a compatible sandbox remains outstanding. Verify the channels and operations used by your integration before deploying them.
