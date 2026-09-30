import { assertRequestContract, assertResponseContract } from './helpers/contract.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PaymenticAbortError, PaymenticApiError, PaymenticClient, PaymenticNetworkError } from '../dist/index.js';

const contract = JSON.parse(readFileSync(new URL('../../../contracts/paymentic-openapi-v1.2.json', import.meta.url)));
const ping = {
  message: 'pong',
  environment: 'sandbox',
  tokenId: '2a77157f-7a73-413d-90a1-cd1263533d61',
  clientId: '72b631fe',
  version: '1.2',
  scopes: ['*'],
};

test('ping uses the pinned contract and returns its data', async () => {
  const requests = [];
  const client = new PaymenticClient({
    apiKey: 'test-token',
    environment: 'sandbox',
    fetch: async (input, init) => {
      requests.push({ input, init });
      return new Response(JSON.stringify({ data: ping }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(contract.info.version, '1.2');
  assert.ok(contract.paths['/payment/ping'].get.responses['200']);
  const responseFields = Object.keys(
    contract.paths['/payment/ping'].get.responses['200'].content['application/json'].schema.properties.data.properties,
  );
  assert.deepEqual(Object.keys(ping), responseFields);
  assert.equal(contract.components.securitySchemes.bearerToken.name, 'Authorization');
  assert.deepEqual(await client.ping(), ping);
  assert.equal(requests.length, 1);
  assertRequestContract('/payment/ping', 'get', requests[0].init.body);
  assertResponseContract('/payment/ping', 'get', 200, { data: ping });
  assert.equal(requests[0].input, `${contract.servers[1].url}/payment/ping`);
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(new Headers(requests[0].init.headers).get('authorization'), 'Bearer test-token');
});

test('production and a custom base URL select the request destination', async () => {
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    return Response.json({ data: ping });
  };
  await new PaymenticClient({ apiKey: 'key', environment: 'production', fetch }).ping();
  await new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    baseUrl: 'http://localhost:3000/v1_2/',
    fetch,
  }).ping();
  assert.deepEqual(urls, [`${contract.servers[0].url}/payment/ping`, 'http://localhost:3000/v1_2/payment/ping']);
});

test('ping accepts a partial data object allowed by the contract', async () => {
  const schema =
    contract.paths['/payment/ping'].get.responses['200'].content['application/json'].schema.properties.data;
  assert.equal(schema.required, undefined);
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => Response.json({ data: { message: 'pong' } }),
  });
  assert.deepEqual(await client.ping(), { message: 'pong' });
});

test('API errors expose status and redacted details', async () => {
  const client = new PaymenticClient({
    apiKey: 'secret-key',
    environment: 'sandbox',
    fetch: async () =>
      Response.json(
        {
          errors: [
            {
              code: 'UNAUTHORIZED',
              message: 'Bad secret-key',
              docsUrl: 'https://docs.paymentic.com/errors#UNAUTHORIZED',
              details: { nested: ['secret-key'] },
            },
          ],
        },
        { status: 401 },
      ),
  });
  await assert.rejects(client.ping(), (error) => {
    assert.ok(error instanceof PaymenticApiError);
    assert.equal(error.status, 401);
    assert.equal(error.errors[0].code, 'UNAUTHORIZED');
    assert.equal(error.errors[0].message, 'Bad [REDACTED]');
    assert.deepEqual(error.errors[0].details, { nested: ['[REDACTED]'] });
    assert.equal(JSON.stringify(error).includes('secret-key'), false);
    return true;
  });
});

test('API errors preserve the HTTP status when the error body is not JSON', async () => {
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => new Response('service unavailable', { status: 503 }),
  });
  await assert.rejects(client.ping(), (error) => {
    assert.ok(error instanceof PaymenticApiError);
    assert.equal(error.status, 503);
    assert.deepEqual(error.errors, []);
    return true;
  });
});

test('a transport failure is distinct from an API response', async () => {
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => {
      throw new Error('offline');
    },
  });
  await assert.rejects(client.ping(), PaymenticNetworkError);
});

test('an operation AbortSignal cancels ping', async () => {
  const controller = new AbortController();
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      }),
  });
  const request = client.ping({ signal: controller.signal });
  controller.abort();
  await assert.rejects(request, (error) => error instanceof PaymenticAbortError && error.reason === 'signal');
});

test('the configured timeout aborts ping', async () => {
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    timeoutMs: 5,
    fetch: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      }),
  });
  await assert.rejects(client.ping(), (error) => error instanceof PaymenticAbortError && error.reason === 'timeout');
});

test('invalid required configuration fails before sending a request', () => {
  assert.throws(() => new PaymenticClient({ apiKey: '', environment: 'sandbox' }), TypeError);
  assert.throws(() => new PaymenticClient({ apiKey: 'key', environment: 'invalid' }), TypeError);
  assert.throws(() => new PaymenticClient({ apiKey: 'key', environment: 'sandbox', timeoutMs: 0 }), TypeError);
});
