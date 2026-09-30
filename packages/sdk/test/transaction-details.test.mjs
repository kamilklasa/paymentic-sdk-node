import { assertRequestContract, assertResponseContract } from './helpers/contract.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PaymenticApiError, PaymenticClient, PaymenticNetworkError } from '../dist/index.js';

const contract = JSON.parse(readFileSync(new URL('../../../contracts/paymentic-openapi-v1.2.json', import.meta.url)));
const path = '/payment/points/{pointId}/transactions/{transactionId}';

test('getTransaction retrieves typed details from the v1.2 route', async () => {
  const requests = [];
  const details = {
    id: 'ABC1-AB2-AB3-ABC4',
    status: 'PAID',
    amount: '123.45',
    currency: 'PLN',
    title: 'Order #12345',
    commission: '1.23',
    description: null,
    customer: { name: 'Jan Kowalski', email: 'jan@example.com' },
    order: { id: 'order-12345', customerType: 'B2C' },
    billingAddress: null,
    shippingAddress: { city: 'Warsaw', country: 'PL' },
    externalReferenceId: 'order-12345',
    redirect: { success: 'https://shop.example/success', failure: null },
    paymentMethod: 'VISA',
    paymentChannel: null,
    whitelabel: false,
    cart: [{ name: 'Book', quantity: 1, unitPrice: '123.45' }],
    autoCapture: false,
    isCaptured: false,
    capturedAt: null,
    paidAt: '2026-09-29T12:00:00Z',
    createdAt: '2026-09-29T11:00:00Z',
    expiresAt: null,
  };
  const client = new PaymenticClient({
    apiKey: 'test-token',
    environment: 'sandbox',
    fetch: async (input, init) => {
      requests.push({ input, init });
      return Response.json({ data: details });
    },
  });

  assert.equal(
    contract.paths[path].get.responses['200'].content['application/json'].schema.properties.data.$ref,
    '#/components/schemas/GetTransactionDetailsResource',
  );
  assert.deepEqual(
    Object.keys(details),
    Object.keys(contract.components.schemas.GetTransactionDetailsResource.properties),
  );
  assert.equal(contract.components.schemas.GetTransactionDetailsResource.properties.amount.type, 'string');
  assert.deepEqual(await client.getTransaction('b8e6e2fc', details.id), details);
  assert.equal(requests.length, 1);
  assertRequestContract(path, 'get', requests[0].init.body);
  assertResponseContract(path, 'get', 200, { data: details });
  assert.equal(requests[0].input, `${contract.servers[1].url}/payment/points/b8e6e2fc/transactions/${details.id}`);
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(new Headers(requests[0].init.headers).get('authorization'), 'Bearer test-token');
  assert.equal(requests[0].init.body, undefined);
});

test('getTransaction exposes a missing transaction through the public API error', async () => {
  const errors = [
    {
      code: 'TRANSACTION_NOT_FOUND',
      message: 'Transaction not found.',
      docsUrl: 'https://docs.paymentic.com/errors#TRANSACTION_NOT_FOUND',
    },
  ];
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => Response.json({ errors }, { status: 404 }),
  });
  await assert.rejects(client.getTransaction('b8e6e2fc', 'ABC1-AB2-AB3-ABC4'), (error) => {
    assert.ok(error instanceof PaymenticApiError);
    assert.equal(error.status, 404);
    assert.deepEqual(
      error.errors,
      errors.map((entry) => ({ ...entry, details: undefined })),
    );
    return true;
  });
});

test('getTransaction rejects missing IDs and malformed details', async () => {
  let requests = 0;
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => {
      requests++;
      return Response.json({ data: { id: 'ABC1-AB2-AB3-ABC4', amount: 123.45 } });
    },
  });
  await assert.rejects(client.getTransaction('', 'ABC1-AB2-AB3-ABC4'), TypeError);
  await assert.rejects(client.getTransaction('b8e6e2fc', ''), TypeError);
  assert.equal(requests, 0);
  await assert.rejects(client.getTransaction('b8e6e2fc', 'ABC1-AB2-AB3-ABC4'), PaymenticNetworkError);
});

const minimalDetails = { id: 'ABC1-AB2-AB3-ABC4', status: 'PAID', amount: '123.45' };
const invalidDetails = [
  ...[
    'currency',
    'title',
    'commission',
    'description',
    'externalReferenceId',
    'paymentMethod',
    'paymentChannel',
    'capturedAt',
    'paidAt',
    'createdAt',
    'expiresAt',
  ].map((name) => [name, { [name]: 42 }]),
  ...['isCaptured', 'autoCapture', 'whitelabel'].flatMap((name) => [
    [`${name}: string`, { [name]: 'false' }],
    [`${name}: null`, { [name]: null }],
  ]),
  ...['customer', 'order', 'redirect'].flatMap((name) => [
    [`${name}: null`, { [name]: null }],
    [`${name}: array`, { [name]: [] }],
  ]),
  ...[
    'name',
    'email',
    'phone',
    'country',
    'locale',
    'ip',
    'userAgent',
    'fingerprint',
    'emailVerified',
    'phoneVerified',
  ].map((name) => [`customer.${name}`, { customer: { [name]: 42 } }]),
  ...['id', 'trackingNumber', 'shippingMethod', 'customerType'].map((name) => [
    `order.${name}`,
    { order: { [name]: 'UNKNOWN', ...(name === 'id' || name === 'trackingNumber' ? { [name]: 42 } : {}) } },
  ]),
  ...['billingAddress', 'shippingAddress'].flatMap((address) => [
    [address, { [address]: [] }],
    ...[
      'firstName',
      'lastName',
      'street',
      'buildingNumber',
      'flat',
      'city',
      'region',
      'postalCode',
      'state',
      'country',
      'company',
    ].map((name) => [`${address}.${name}`, { [address]: { [name]: 42 } }]),
  ]),
  ['redirect.success', { redirect: { success: false } }],
  ['redirect.failure', { redirect: { failure: 42 } }],
  ['cart: object', { cart: {} }],
  ['cart: null item', { cart: [null] }],
  ['cart.name', { cart: [{ name: 42 }] }],
  ['cart.quantity: string', { cart: [{ quantity: '1' }] }],
  ['cart.quantity: fraction', { cart: [{ quantity: 1.5 }] }],
  ['cart.unitPrice', { cart: [{ unitPrice: 0.1 }] }],
];

for (const [name, fields] of invalidDetails) {
  test(`getTransaction rejects malformed ${name}`, async () => {
    const client = new PaymenticClient({
      apiKey: 'key',
      environment: 'sandbox',
      fetch: async () => Response.json({ data: { ...minimalDetails, ...fields } }),
    });
    await assert.rejects(client.getTransaction('point', minimalDetails.id), PaymenticNetworkError);
  });
}

test('getTransaction preserves false flags, nullable fields, omitted fields and additive data', async () => {
  for (const fields of [
    {},
    {
      isCaptured: false,
      autoCapture: false,
      whitelabel: false,
      commission: null,
      description: null,
      externalReferenceId: null,
      paymentMethod: null,
      paymentChannel: null,
      capturedAt: null,
      paidAt: null,
      createdAt: null,
      expiresAt: null,
      customer: { name: null, email: null, emailVerified: null, phoneVerified: false },
      order: { id: null, shippingMethod: null, trackingNumber: null, customerType: null },
      billingAddress: null,
      shippingAddress: { city: null },
      redirect: { success: null, failure: null },
      cart: [{ name: null, quantity: null, unitPrice: null }],
      futureField: { preserved: true },
    },
    { cart: null },
  ]) {
    const details = { ...minimalDetails, ...fields };
    const client = new PaymenticClient({
      apiKey: 'key',
      environment: 'sandbox',
      fetch: async () => Response.json({ data: details }),
    });
    assert.deepEqual(await client.getTransaction('point', details.id), details);
  }
});
