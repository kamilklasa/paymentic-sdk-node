# Paymentic SDK for Node.js

An **unofficial**, community-maintained TypeScript SDK for the Paymentic HTTP API. This project is not published by or affiliated with Paymentic.

Supports payment-point channels, transactions, BLIK processing, refunds, manual capture, and signature verification for transaction, refund and BLIK status webhooks. Requires **Node.js 24+**. ESM, TypeScript declarations, and no runtime dependencies.

## Installation

```sh
npm install @kamilklasa/paymentic-sdk-node
```

The package is prepared for its first npm release. Until it is published, build it from this repository using the development commands below.

## Usage

```ts
import { PaymenticClient } from '@kamilklasa/paymentic-sdk-node';

const client = new PaymenticClient({
  apiKey: process.env.PAYMENTIC_API_KEY!,
  environment: 'sandbox',
});

const transaction = await client.createTransaction(process.env.PAYMENTIC_POINT_ID!, {
  amount: '29.00',
  title: 'Order #123',
  externalReferenceId: 'order-123',
});

console.log(transaction.id, transaction.redirectUrl);
```

Keep credentials on the server. Amounts are decimal strings. The SDK does not retry mutations automatically; reconcile a timed-out payment or refund before submitting it again.

- [SDK API and webhook examples](packages/sdk/README.md)
- [Runnable Next.js sandbox example](examples/nextjs/README.md)
- [API contract and compatibility](contracts/README.md)

## Development

Use Node.js 24+ and pnpm 10.32.1 (specified in `package.json`).

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check:release
```

The release check runs type checks, lint, formatting, SDK and tooling tests, the Next.js example tests and build, and a clean installation of the packed SDK. It does not need Paymentic credentials or create payments. CI runs the same checks on pushes and pull requests.

The SDK lives in `packages/sdk`; the Next.js example in `examples/nextjs` is a private workspace package and is not published to npm. BLIK Level 0 and manual capture have offline contract coverage; end-to-end verification in a compatible sandbox remains outstanding.

## Contributing

Open an [issue](https://github.com/kamilklasa/paymentic-sdk-node/issues) for bugs or proposed changes. For bugs, include the SDK and Node.js versions and a minimal reproduction with credentials and customer data removed. Add regression tests for behavior changes and run `pnpm check:release` before opening a pull request. Git hooks check staged files and require Conventional Commit messages, for example `fix: validate refund amounts`.

Maintainers: see [publishing to npm](RELEASE.md).

## License

[MIT](LICENSE). See [NOTICE.md](NOTICE.md) for attribution.
