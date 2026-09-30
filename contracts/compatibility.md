# First SDK release coverage

The [pinned Paymentic HTTP v1.2 contract](paymentic-openapi-v1.2.json) decides the wire format when it differs from the PHP SDK reference. The reference's payment service contracts and `PaymentWebhookHandlerFactory` define the first release's functional scope. The tests below exercise the public Node.js client or `verifyWebhook` against that pinned contract.

| PHP SDK operation | Node.js SDK | HTTP v1.2 operation | Contract test |
| --- | --- | --- | --- |
| `system()->ping()` | `client.ping()` | `GET /payment/ping` | `ping.test.mjs` |
| `transactions()->create()` | `client.createTransaction()` | `POST /payment/points/{pointId}/transactions` | `create-transaction.test.mjs` |
| `transactions()->get()` | `client.getTransaction()` | `GET /payment/points/{pointId}/transactions/{transactionId}` | `transaction-details.test.mjs` |
| `transactions()->capture()` | `client.captureTransaction()` | `PATCH /payment/points/{pointId}/transactions/{transactionId}/capture` | `capture-transaction.test.mjs` |
| `transactions()->list()` | `client.listTransactions()` | `GET /payment/points/{pointId}/transactions` | `list-transactions.test.mjs` |
| `refunds()->create()` | `client.createRefund()` | `POST /payment/points/{pointId}/transactions/{transactionId}/refunds` | `refunds.test.mjs` |
| `refunds()->get()` | `client.getRefund()` | `GET /payment/points/{pointId}/transactions/{transactionId}/refunds/{refundId}` | `refunds.test.mjs` |
| `blik()->process()` | `client.processBlikTransaction()` | `POST /payment/points/{pointId}/transactions/{transactionId}/blik` | `process-blik.test.mjs` |
| `points()->getChannels()` | `client.getPointChannels()` | `GET /payment/points/{pointId}/channels` | `point-channels.test.mjs` |

| PHP SDK webhook payload | Node.js SDK event | HTTP v1.2 webhook | Contract test |
| --- | --- | --- | --- |
| `TransactionStatusChangedPayload` | `PAYMENT.TRANSACTION_STATUS_CHANGED` | Same event | `verify-webhook.test.mjs` |
| `RefundStatusChangedPayload` | `PAYMENT.REFUND_STATUS_CHANGED` | Same event | `verify-webhook.test.mjs` |
| `TransactionBlikStatusChangedPayload` | `PAYMENT.TRANSACTION_BLIK_STATUS_CHANGED` | Same event | `verify-webhook.test.mjs` |

## Contract decisions

- The pinned v1.2 refund request marks `title` as required even though its property definition omits it. The live API returns `422 validation.reject_extra_fields` for `title`, and the Paymentic refund guide lists only `amount`, `reason`, and `externalReferenceId`. The Node.js SDK follows the live API; an older caller's `title` is ignored for compatibility.
- The v1.2 BLIK request marks `code` as required for both `CODE` and `ALIAS`. The Node.js request follows that requirement and leaves channel rules to the API.
- The PHP SDK's capture method returns `void`; the HTTP success response has an empty `data` object. The Node.js method returns that object.
- The OpenAPI card processing operation and `PAYMENT.BLIK_ALIAS_STATUS_CHANGED` webhook have no PHP SDK equivalents and are outside this release. Laravel and Symfony integration classes are also outside this release.
