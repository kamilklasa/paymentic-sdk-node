import { assertRequestContract, assertResponseContract } from './helpers/contract.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PaymenticApiError, PaymenticClient, PaymenticNetworkError } from '../dist/index.js';

const contract = JSON.parse(readFileSync(new URL('../../../contracts/paymentic-openapi-v1.2.json', import.meta.url)));
const path = '/payment/points/{pointId}/transactions/{transactionId}/capture';

test('captureTransaction sends one bodyless PATCH and returns the accepted data', async () => {
  const requests = [];
  const client = new PaymenticClient({
    apiKey: 'test-token',
    environment: 'sandbox',
    fetch: async (input, init) => {
      requests.push({ input, init });
      return Response.json({ data: {} }, { status: 202 });
    },
  });

  const operation = contract.paths[path].patch;
  assert.equal(operation.requestBody, undefined);
  assert.deepEqual(operation.responses['202'].content['application/json'].schema.properties.data.properties, {});
  assert.deepEqual(await client.captureTransaction('b8e6e2fc', 'ABC1-AB2-AB3-ABC4'), {});
  assert.equal(requests.length, 1);
  assertRequestContract(path, 'patch', requests[0].init.body);
  assertResponseContract(path, 'patch', 202, { data: {} });
  assert.equal(
    requests[0].input,
    `${contract.servers[1].url}/payment/points/b8e6e2fc/transactions/ABC1-AB2-AB3-ABC4/capture`,
  );
  assert.equal(requests[0].init.method, 'PATCH');
  assert.equal(new Headers(requests[0].init.headers).get('authorization'), 'Bearer test-token');
  assert.equal(requests[0].init.body, undefined);
});

test('captureTransaction exposes a rejected capture and never retries it', async () => {
  let requests = 0;
  const errors = [{ code: 'TRANSACTION_INVALID_STATUS', message: 'Transaction invalid status.', details: null }];
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => {
      requests += 1;
      return Response.json({ errors }, { status: 400 });
    },
  });

  assert.ok(contract.paths[path].patch.responses['400']);
  await assert.rejects(client.captureTransaction('b8e6e2fc', 'ABC1-AB2-AB3-ABC4'), (error) => {
    assert.ok(error instanceof PaymenticApiError);
    assert.equal(error.status, 400);
    assert.deepEqual(
      error.errors,
      errors.map((entry) => ({ ...entry, docsUrl: undefined })),
    );
    return true;
  });
  assert.equal(requests, 1);
});

test('captureTransaction validates IDs and rejects a malformed accepted response', async () => {
  let requests = 0;
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => {
      requests++;
      return Response.json({ data: null }, { status: 202 });
    },
  });
  await assert.rejects(client.captureTransaction('', 'ABC1-AB2-AB3-ABC4'), TypeError);
  await assert.rejects(client.captureTransaction('b8e6e2fc', ''), TypeError);
  assert.equal(requests, 0);
  await assert.rejects(client.captureTransaction('b8e6e2fc', 'ABC1-AB2-AB3-ABC4'), PaymenticNetworkError);
  assert.equal(requests, 1);
});
