import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { PaymenticApiError, PaymenticClient, PaymenticNetworkError } from '../dist/index.js';

for (const status of [307, 308]) {
  test(`a real HTTP ${status} never forwards a BLIK body to another origin`, async (t) => {
    let sourceRequests = 0;
    let destinationRequests = 0;
    const destination = createServer((req, res) => {
      destinationRequests++;
      req.resume();
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { actionId: 'unexpected' } }));
    });
    const source = createServer((req, res) => {
      sourceRequests++;
      req.resume();
      res.writeHead(status, { location: `http://127.0.0.1:${destination.address().port}/leak` });
      res.end();
    });
    t.after(async () => {
      await Promise.all(
        [source, destination].map(
          (server) =>
            new Promise((resolve) => {
              server.closeAllConnections();
              server.close(resolve);
            }),
        ),
      );
    });
    destination.listen(0, '127.0.0.1');
    await once(destination, 'listening');
    source.listen(0, '127.0.0.1');
    await once(source, 'listening');
    const client = new PaymenticClient({
      apiKey: 'test-token',
      environment: 'sandbox',
      timeoutMs: 2_000,
      baseUrl: `http://127.0.0.1:${source.address().port}`,
    });
    await assert.rejects(
      client.processBlikTransaction('point', 'transaction', { type: 'CODE', code: '123456' }),
      PaymenticNetworkError,
    );
    assert.equal(sourceRequests, 1);
    assert.equal(destinationRequests, 0);
  });
}

test('API key normalization and nested error redaction use the same credential', async () => {
  const token = 'test-secret-token';
  let authorization;
  const client = new PaymenticClient({
    apiKey: ` \t${token} \n`,
    environment: 'sandbox',
    fetch: async (_url, init) => {
      authorization = new Headers(init.headers).get('authorization');
      return Response.json(
        {
          errors: [
            {
              code: `INVALID_${token}`,
              message: `Invalid ${authorization}`,
              docsUrl: `https://example.test/${token}`,
              details: { [token]: [{ [`nested-${token}`]: token }], safe: 'preserved' },
            },
          ],
        },
        { status: 401 },
      );
    },
  });
  await assert.rejects(client.ping(), (error) => {
    assert.ok(error instanceof PaymenticApiError);
    assert.equal(error.status, 401);
    assert.equal(authorization, `Bearer ${token}`);
    assert.equal(JSON.stringify(error).includes(token), false);
    assert.deepEqual(error.errors[0].details, {
      '[REDACTED]': [{ 'nested-[REDACTED]': '[REDACTED]' }],
      safe: 'preserved',
    });
    assert.equal(error.errors[0].message, 'Invalid Bearer [REDACTED]');
    return true;
  });
});

test('invalid credentials and timer delays fail during construction', () => {
  for (const apiKey of [null, undefined, 42, {}, '', ' \t\n']) {
    assert.throws(() => new PaymenticClient({ apiKey, environment: 'sandbox' }), TypeError);
  }
  for (const timeoutMs of [0, -1, 0.5, 1.5, NaN, Infinity, '100', null, 2_147_483_648, 4_294_967_296]) {
    assert.throws(() => new PaymenticClient({ apiKey: 'key', environment: 'sandbox', timeoutMs }), TypeError);
  }
});

test('the largest supported timer delay still allows a request', async () => {
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    timeoutMs: 2_147_483_647,
    fetch: async (_url, init) => {
      assert.equal(init.signal.aborted, false);
      return Response.json({ data: { message: 'pong' } });
    },
  });
  assert.equal((await client.ping()).message, 'pong');
});

test('state-changing requests are never retried after a network failure', async () => {
  for (const operation of [
    (client) => client.createTransaction('point', { amount: '1.00', title: 'Order' }),
    (client) => client.createRefund('point', 'transaction', { amount: '1.00' }),
    (client) => client.captureTransaction('point', 'transaction'),
    (client) => client.processBlikTransaction('point', 'transaction', { type: 'CODE', code: '123456' }),
  ]) {
    let requests = 0;
    const client = new PaymenticClient({
      apiKey: 'key',
      environment: 'sandbox',
      fetch: async () => {
        requests++;
        throw new Error('connection closed after sending the request');
      },
    });
    await assert.rejects(operation(client), PaymenticNetworkError);
    assert.equal(requests, 1);
  }
});

test('an already aborted signal prevents a real HTTP request', async (t) => {
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    res.end('{}');
  });
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const controller = new AbortController();
  controller.abort();
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    timeoutMs: 1000,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  });
  await assert.rejects(
    client.ping({ signal: controller.signal }),
    (error) => error.name === 'PaymenticAbortError' && error.reason === 'signal',
  );
  assert.equal(requests, 0);
});

test('timeout covers a stalled real HTTP response body', async (t) => {
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"data":');
  });
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    timeoutMs: 200,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  });
  await assert.rejects(client.ping(), (error) => error.name === 'PaymenticAbortError' && error.reason === 'timeout');
  assert.equal(requests, 1);
});

test('caller cancellation remains effective with a configured timeout', async () => {
  const controller = new AbortController();
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    timeoutMs: 1000,
    fetch: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
        controller.abort();
      }),
  });
  await assert.rejects(
    client.ping({ signal: controller.signal }),
    (error) => error.name === 'PaymenticAbortError' && error.reason === 'signal',
  );
});
