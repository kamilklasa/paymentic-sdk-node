import { assertRequestContract, assertResponseContract } from './helpers/contract.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PaymenticApiError, PaymenticClient } from '../dist/index.js';

const contract = JSON.parse(readFileSync(new URL('../../../contracts/paymentic-openapi-v1.2.json', import.meta.url)));

test('createTransaction sends the v1.2 request once and returns payment details', async () => {
  const requests = [];
  const transaction = {
    amount: '123.45',
    currency: 'PLN',
    title: 'Order #12345',
    description: 'Books',
    externalReferenceId: 'order-12345',
    redirect: { success: 'https://shop.example/success', failure: 'https://shop.example/failure' },
    customer: { name: 'Jan Kowalski', email: 'jan@example.com', emailVerified: true },
    order: { id: 'order-12345', shippingMethod: 'PARCEL_PICKUP', customerType: 'B2C' },
    billingAddress: { firstName: 'Jan', lastName: 'Kowalski', country: 'PL' },
    shippingAddress: { firstName: 'Jan', lastName: 'Kowalski', country: 'PL' },
    cart: [{ name: 'Book', quantity: 1, unitPrice: '123.45', type: 'PRODUCT', productType: 'PHYSICAL', sku: 'book-1' }],
    allowedPaymentMethods: [{ paymentMethod: 'BLIK', paymentChannel: 'blik-level0' }],
    createRegistration: false,
    whitelabel: false,
    autoCapture: true,
    expiresAt: '2026-10-01T12:00:00Z',
  };
  const created = {
    id: 'ABCD-123-XYZ-9876',
    redirectUrl: 'https://pay.paymentic.com/ABCD-123-XYZ-9876',
    whitelabel: null,
  };
  const client = new PaymenticClient({
    apiKey: 'test-token',
    environment: 'sandbox',
    fetch: async (input, init) => {
      requests.push({ input, init });
      return Response.json({ data: created }, { status: 201 });
    },
  });

  const operation = contract.paths['/payment/points/{pointId}/transactions'].post;
  assert.equal(
    operation.requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/CreateTransactionRequest',
  );
  assert.equal(
    operation.responses['201'].content['application/json'].schema.properties.data.$ref,
    '#/components/schemas/CreateTransactionResource',
  );
  assert.deepEqual(await client.createTransaction('b8e6e2fc', transaction), created);
  assert.equal(requests.length, 1);
  assertRequestContract('/payment/points/{pointId}/transactions', 'post', requests[0].init.body);
  assertResponseContract('/payment/points/{pointId}/transactions', 'post', 201, { data: created });
  assert.equal(requests[0].input, `${contract.servers[1].url}/payment/points/b8e6e2fc/transactions`);
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(new Headers(requests[0].init.headers).get('authorization'), 'Bearer test-token');
  assert.equal(new Headers(requests[0].init.headers).get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(requests[0].init.body), transaction);
});

test('createTransaction preserves HTTP validation details and does not retry the POST', async () => {
  let requests = 0;
  const errors = [
    {
      code: 'VALIDATION_ERROR',
      message: 'The title is too short.',
      docsUrl: 'https://docs.paymentic.com/errors#VALIDATION_ERROR',
      details: { field: 'title', messages: ['The title is too short.'] },
    },
  ];
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => {
      requests += 1;
      return Response.json({ errors }, { status: 422 });
    },
  });

  await assert.rejects(client.createTransaction('b8e6e2fc', { amount: '123.45', title: 'No' }), (error) => {
    assert.ok(error instanceof PaymenticApiError);
    assert.equal(error.status, 422);
    assert.deepEqual(error.errors, errors);
    return true;
  });
  assert.equal(requests, 1);
});

test('createTransaction leaves payment rules to the API but rejects missing path and field types', async () => {
  const requests = [];
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async (_input, init) => {
      requests.push(init);
      return Response.json({ errors: [{ code: 'VALIDATION_ERROR', details: { field: 'amount' } }] }, { status: 422 });
    },
  });

  await assert.rejects(
    client.createTransaction('b8e6e2fc', { amount: 'not-a-decimal', title: 'ok' }),
    PaymenticApiError,
  );
  assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0].body).amount, 'not-a-decimal');
  await assert.rejects(client.createTransaction('', { amount: '1.00', title: 'Order' }), TypeError);
  await assert.rejects(client.createTransaction('b8e6e2fc', { amount: 1, title: 'Order' }), TypeError);
  assert.equal(requests.length, 1);
});
