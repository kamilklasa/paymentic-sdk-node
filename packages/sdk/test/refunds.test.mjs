import { assertRequestContract, assertResponseContract } from './helpers/contract.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PaymenticApiError, PaymenticClient, PaymenticNetworkError } from '../dist/index.js';

const contract = JSON.parse(readFileSync(new URL('../../../contracts/paymentic-openapi-v1.2.json', import.meta.url)));
const refundsPath = '/payment/points/{pointId}/transactions/{transactionId}/refunds';
const refundDetailsPath = `${refundsPath}/{refundId}`;

test('createRefund omits an older caller’s unsupported title and sends one v1.2 request', async () => {
  const requests = [];
  const refund = { amount: '12.34', title: 'Returned book', reason: 'Damaged item', externalReferenceId: 'return-123' };
  const created = { id: 'AB1-AB2-AB3', status: 'CREATED' };
  const client = new PaymenticClient({
    apiKey: 'test-token',
    environment: 'sandbox',
    fetch: async (input, init) => {
      requests.push({ input, init });
      if (Object.hasOwn(JSON.parse(init.body), 'title')) {
        return Response.json(
          {
            errors: [
              { code: 'VALIDATION_ERROR', message: 'validation.reject_extra_fields', details: { field: 'title' } },
            ],
          },
          { status: 422 },
        );
      }
      return Response.json({ data: created }, { status: 201 });
    },
  });

  const operation = contract.paths[refundsPath].post;
  assert.equal(
    operation.requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/CreateTransactionRefundRequest',
  );
  assert.equal(
    operation.responses['201'].content['application/json'].schema.properties.data.$ref,
    '#/components/schemas/CreateTransactionRefundResource',
  );
  assert.equal(contract.components.schemas.CreateTransactionRefundRequest.properties.amount.type, 'string');
  assert.deepEqual(await client.createRefund('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', refund), created);
  assert.equal(requests.length, 1);
  assertRequestContract(refundsPath, 'post', requests[0].init.body);
  assertResponseContract(refundsPath, 'post', 201, { data: created });
  assert.equal(
    requests[0].input,
    `${contract.servers[1].url}/payment/points/b8e6e2fc/transactions/ABC1-AB2-AB3-ABC4/refunds`,
  );
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(new Headers(requests[0].init.headers).get('authorization'), 'Bearer test-token');
  assert.equal(new Headers(requests[0].init.headers).get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    amount: refund.amount,
    reason: refund.reason,
    externalReferenceId: refund.externalReferenceId,
  });
});

test('getRefund retrieves typed details from the v1.2 route', async () => {
  const requests = [];
  const details = {
    id: 'AB1-AB2-AB3',
    status: 'DONE',
    amount: '12.34',
    reason: null,
    externalReferenceId: 'return-123',
    createdAt: '2026-09-29T11:00:00Z',
    updatedAt: null,
  };
  const client = new PaymenticClient({
    apiKey: 'test-token',
    environment: 'sandbox',
    fetch: async (input, init) => {
      requests.push({ input, init });
      return Response.json({ data: details });
    },
  });

  const operation = contract.paths[refundDetailsPath].get;
  assert.equal(
    operation.responses['200'].content['application/json'].schema.properties.data.$ref,
    '#/components/schemas/GetRefundDetailsResource',
  );
  assert.deepEqual(Object.keys(details), Object.keys(contract.components.schemas.GetRefundDetailsResource.properties));
  assert.deepEqual(await client.getRefund('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', details.id), details);
  assert.equal(requests.length, 1);
  assertRequestContract(refundDetailsPath, 'get', requests[0].init.body);
  assertResponseContract(refundDetailsPath, 'get', 200, { data: details });
  assert.equal(
    requests[0].input,
    `${contract.servers[1].url}/payment/points/b8e6e2fc/transactions/ABC1-AB2-AB3-ABC4/refunds/AB1-AB2-AB3`,
  );
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(new Headers(requests[0].init.headers).get('authorization'), 'Bearer test-token');
  assert.equal(requests[0].init.body, undefined);
});

test('createRefund exposes API validation details and never retries the POST', async () => {
  let requests = 0;
  const errors = [{ code: 'VALIDATION_ERROR', message: 'Invalid refund amount.', details: { field: 'amount' } }];
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => {
      requests += 1;
      return Response.json({ errors }, { status: 422 });
    },
  });

  assert.ok(contract.paths[refundsPath].post.responses['422']);
  await assert.rejects(
    client.createRefund('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', {
      amount: 'not-a-decimal',
    }),
    (error) => {
      assert.ok(error instanceof PaymenticApiError);
      assert.equal(error.status, 422);
      assert.deepEqual(
        error.errors,
        errors.map((entry) => ({ ...entry, docsUrl: undefined })),
      );
      return true;
    },
  );
  assert.equal(requests, 1);
});

test('getRefund exposes a missing refund through the public API error', async () => {
  const errors = [{ code: 'REFUND_NOT_FOUND', message: 'Refund not found.' }];
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => Response.json({ errors }, { status: 404 }),
  });

  assert.ok(contract.paths[refundDetailsPath].get.responses['404']);
  await assert.rejects(client.getRefund('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', 'AB1-AB2-AB3'), (error) => {
    assert.ok(error instanceof PaymenticApiError);
    assert.equal(error.status, 404);
    assert.deepEqual(
      error.errors,
      errors.map((entry) => ({ ...entry, docsUrl: undefined, details: undefined })),
    );
    return true;
  });
});

test('refund methods reject missing IDs and malformed success responses', async () => {
  let requests = 0;
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => {
      requests += 1;
      return Response.json({ data: { id: 'AB1-AB2-AB3', amount: 12.34 } });
    },
  });
  const refund = { amount: '12.34' };

  await assert.rejects(client.createRefund('', 'ABC1-AB2-AB3-ABC4', refund), TypeError);
  await assert.rejects(client.createRefund('b8e6e2fc', '', refund), TypeError);
  await assert.rejects(client.createRefund('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', { amount: 12.34 }), TypeError);
  await assert.rejects(client.getRefund('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', ''), TypeError);
  assert.equal(requests, 0);

  await assert.rejects(client.createRefund('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', refund), PaymenticNetworkError);
  await assert.rejects(client.getRefund('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', 'AB1-AB2-AB3'), PaymenticNetworkError);
  assert.equal(requests, 2);
});
