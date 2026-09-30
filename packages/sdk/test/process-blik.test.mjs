import { assertRequestContract, assertResponseContract } from './helpers/contract.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PaymenticApiError, PaymenticClient, PaymenticNetworkError } from '../dist/index.js';

const contract = JSON.parse(readFileSync(new URL('../../../contracts/paymentic-openapi-v1.2.json', import.meta.url)));
const path = '/payment/points/{pointId}/transactions/{transactionId}/blik';

test('processBlikTransaction sends the v1.2 request and returns the accepted action', async () => {
  const requests = [];
  const process = {
    type: 'CODE',
    code: '777123',
    alias: { value: 'new-alias-123', label: 'My phone', appId: 'my-app-id' },
  };
  const accepted = { actionId: '01kaqf5trc82bk6cqqanjcjwnq', alias: { value: 'new-alias-123' } };
  const client = new PaymenticClient({
    apiKey: 'test-token',
    environment: 'sandbox',
    fetch: async (input, init) => {
      requests.push({ input, init });
      return Response.json({ data: accepted }, { status: 202 });
    },
  });

  const operation = contract.paths[path].post;
  assert.equal(
    operation.requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/ProcessBlikTransactionRequest',
  );
  assert.equal(
    operation.responses['202'].content['application/json'].schema.properties.data.$ref,
    '#/components/schemas/ProcessBlikTransactionResource',
  );
  assert.deepEqual(await client.processBlikTransaction('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', process), accepted);
  assert.equal(requests.length, 1);
  assertRequestContract(path, 'post', requests[0].init.body);
  assertResponseContract(path, 'post', 202, { data: accepted });
  assert.equal(
    requests[0].input,
    `${contract.servers[1].url}/payment/points/b8e6e2fc/transactions/ABC1-AB2-AB3-ABC4/blik`,
  );
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(new Headers(requests[0].init.headers).get('authorization'), 'Bearer test-token');
  assert.equal(new Headers(requests[0].init.headers).get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(requests[0].init.body), process);
});

test('processBlikTransaction exposes a BLIK rejection and never retries the POST', async () => {
  let requests = 0;
  const errors = [
    {
      code: 'TRANSACTION_BLIK_PROCESSING_ERROR',
      message: 'Transaction BLIK processing error.',
      docsUrl: 'https://docs.paymentic.com/errors#TRANSACTION_BLIK_PROCESSING_ERROR',
      details: { blikErrorCode: 'DECLINED' },
    },
  ];
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => {
      requests += 1;
      return Response.json({ errors }, { status: 400 });
    },
  });

  const operation = contract.paths[path].post;
  assert.ok(
    operation.responses['400'].content['application/json'].schema.anyOf.some(
      (schema) => schema.$ref === '#/components/schemas/TransactionBlikProcessingErrorExceptionSchema',
    ),
  );
  await assert.rejects(
    client.processBlikTransaction('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', {
      type: 'CODE',
      code: '777123',
    }),
    (error) => {
      assert.ok(error instanceof PaymenticApiError);
      assert.equal(error.status, 400);
      assert.deepEqual(error.errors, errors);
      return true;
    },
  );
  assert.equal(requests, 1);
});

test('processBlikTransaction validates its IDs and required fields before sending', async () => {
  let requests = 0;
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => {
      requests += 1;
      return Response.json({ data: { actionId: '01kaqf5trc82bk6cqqanjcjwnq' } }, { status: 202 });
    },
  });
  const process = { type: 'CODE', code: '777123' };

  await assert.rejects(client.processBlikTransaction('', 'ABC1-AB2-AB3-ABC4', process), TypeError);
  await assert.rejects(client.processBlikTransaction('b8e6e2fc', '', process), TypeError);
  await assert.rejects(
    client.processBlikTransaction('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', { type: 'WRONG', code: '777123' }),
    TypeError,
  );
  await assert.rejects(
    client.processBlikTransaction('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', { type: 'CODE', code: 777123 }),
    TypeError,
  );
  assert.equal(requests, 0);
});

test('processBlikTransaction rejects a malformed accepted response', async () => {
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => Response.json({ data: { actionId: 123 } }, { status: 202 }),
  });
  await assert.rejects(
    client.processBlikTransaction('b8e6e2fc', 'ABC1-AB2-AB3-ABC4', {
      type: 'CODE',
      code: '777123',
    }),
    PaymenticNetworkError,
  );
});
