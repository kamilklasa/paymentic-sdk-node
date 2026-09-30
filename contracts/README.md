# Paymentic HTTP contract

`paymentic-openapi-v1.2.json` is a pinned copy of the official Paymentic Payment API OpenAPI 3.1 contract, version 1.2.

- Source: https://docs.paymentic.com/docs-payment-api.json
- Retrieved: 2026-09-26
- SHA-256: `7be4fbaecaf0f4e5e064f72dbcd1524264a80cf01ac37ad4b44964c15cb83158`

Review the source diff and update the checksum when refreshing this file. Contract tests run offline against this copy.

See the [first-release compatibility map](compatibility.md) for every PHP SDK operation and webhook in scope, its Node.js equivalent, and the matching contract test.

SDK tests validate captured JSON request bodies, successful response fixtures for every supported operation, and all three webhook payloads with Ajv (JSON Schema 2020-12). Existing HTTP method, URL, query, header and request-count assertions remain separate. Ajv and ajv-formats are development dependencies only; runtime validation does not depend on them.

`packages/sdk/test/helpers/contract.mjs` applies narrowly scoped corrections to an in-memory copy of the pinned document:

- Response references to OpenAPI Parameter Objects resolve to their contained `schema`.
- `TransactionIdSchema` has length 14, but its pattern and example require 17 characters including three hyphens; the tests use 17.
- Address name patterns contain PHP `/…/u` delimiters; the tests use the equivalent JavaScript Unicode pattern.
- The refund request requires an undefined `title` property that the live API rejects; tests require only `amount`, as documented in the SDK README.

The specific length, pattern and refund corrections assert their original values, so updating the contract requires reviewing these exceptions. The pinned JSON itself is unchanged. Standard formats use ajv-formats; custom decimal, ULID, country-code and currency-code formats validate their textual shape (country/currency codes are not checked against a registry).
