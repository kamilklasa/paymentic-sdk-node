import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkoutChannels, checkoutSelection } from './app/lib/test-payment.ts';
import { findTestPaymentTransaction, isTestPaymentReference } from './app/lib/test-payment.ts';
import { canCaptureTransaction } from './app/lib/test-payment.ts';
import { appOrigin, checkoutUrl, isAdmin, isSameOrigin, readBody, RequestBodyError } from './app/lib/security.ts';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import ts from 'typescript';
import * as sdk from '@kamilklasa/paymentic-sdk-node';
import { renderToStaticMarkup } from 'react-dom/server';

const channels = [
  { id: 'blik', method: 'BLIK', name: 'BLIK', available: true, currencies: ['PLN'] },
  {
    id: 'mbank',
    method: 'PBL',
    name: 'mBank',
    available: true,
    currencies: ['PLN'],
    amount: { minimum: '0.01', maximum: '100.00' },
  },
  { id: 'large-only', method: 'PBL', available: true, currencies: ['PLN'], amount: { minimum: '30.00' } },
  { id: 'euro-only', method: 'PBL', available: true, currencies: ['EUR'] },
  { id: 'disabled', method: 'PBL', available: false, currencies: ['PLN'] },
  { id: 'blik-level0', method: 'BLIK', available: true, currencies: ['PLN'] },
  { id: 'card', method: 'CARD', available: true, currencies: ['PLN'] },
];

test('store shows only channels usable for the fixed-price test payment', () => {
  assert.deepEqual(
    checkoutChannels(channels).map((channel) => channel.id),
    ['blik', 'mbank', 'blik-level0', 'card'],
  );
});

test('store resolves only a currently available submitted method and bank', () => {
  assert.deepEqual(checkoutSelection(channels, 'gateway', null), {});
  assert.deepEqual(checkoutSelection(channels, 'blik', null), { paymentMethod: 'BLIK', paymentChannel: 'blik' });
  assert.deepEqual(checkoutSelection(channels, 'blik-code', null), {
    paymentMethod: 'BLIK',
    paymentChannel: 'blik-level0',
  });
  assert.deepEqual(checkoutSelection(channels, 'card', null), { paymentMethod: 'CARD' });
  assert.deepEqual(checkoutSelection(channels, 'bank', 'mbank'), { paymentMethod: 'PBL', paymentChannel: 'mbank' });
  assert.equal(checkoutSelection(channels, 'bank', 'disabled'), null);
  assert.equal(checkoutSelection(channels, 'bank', 'euro-only'), null);
  assert.equal(checkoutSelection(channels, 'blik-level0', null), null);
});

test('return page resolves the exact test payment transaction and reads its current status', async () => {
  const reference = 'test-payment-00000000-0000-4000-8000-000000000001';
  assert.equal(isTestPaymentReference(reference), true);
  assert.equal(isTestPaymentReference('test-payment-other'), false);
  const calls = [];
  const client = {
    async listTransactions(pointId, params) {
      calls.push({ pointId, params });
      return {
        data: [
          { id: 'WRONG', externalReferenceId: 'test-payment-other', amount: '29.00', title: 'Płatność testowa' },
          { id: 'RIGHT', externalReferenceId: reference, amount: '29.00', title: 'Płatność testowa' },
        ],
      };
    },
    async getTransaction(pointId, id) {
      calls.push({ pointId, id });
      return { id, status: 'PAID', amount: '29.00', externalReferenceId: reference };
    },
  };
  assert.deepEqual(await findTestPaymentTransaction(client, 'point', reference), {
    id: 'RIGHT',
    status: 'PAID',
    autoCapture: undefined,
    isCaptured: undefined,
  });
  assert.deepEqual(calls[0], {
    pointId: 'point',
    params: { filter: { externalReferenceId: reference }, page: { size: 10 } },
  });
  assert.deepEqual(calls[1], { pointId: 'point', id: 'RIGHT' });
});

test('return page does not trust an unrelated row from the transaction list', async () => {
  let detailsRequested = false;
  const client = {
    async listTransactions() {
      return {
        data: [{ id: 'OTHER', externalReferenceId: 'test-payment-other', amount: '29.00', title: 'Płatność testowa' }],
      };
    },
    async getTransaction() {
      detailsRequested = true;
    },
  };
  assert.equal(
    await findTestPaymentTransaction(client, 'point', 'test-payment-00000000-0000-4000-8000-000000000001'),
    null,
  );
  assert.equal(detailsRequested, false);
});

test('capture is offered only for an authorized manual-capture transaction', () => {
  assert.equal(canCaptureTransaction({ status: 'PAID', autoCapture: false, isCaptured: false }), true);
  assert.equal(canCaptureTransaction({ status: 'PAID', autoCapture: true, isCaptured: false }), false);
  assert.equal(canCaptureTransaction({ status: 'PAID', autoCapture: false, isCaptured: true }), false);
  assert.equal(canCaptureTransaction({ status: 'PENDING', autoCapture: false, isCaptured: false }), false);
});

test('channels with invalid amount limits are not offered', () => {
  assert.deepEqual(checkoutChannels([{ ...channels[1], amount: { minimum: 'NaN' } }]), []);
  assert.deepEqual(checkoutChannels([{ ...channels[1], amount: { maximum: '-1.00' } }]), []);
});

test('return page rejects changed references and currencies in transaction details', async () => {
  const reference = 'test-payment-00000000-0000-4000-8000-000000000001';
  for (const details of [{}, { externalReferenceId: 'other' }, { externalReferenceId: reference, currency: 'EUR' }]) {
    const client = {
      async listTransactions() {
        return { data: [{ id: 'RIGHT', amount: '29.00', title: 'Płatność testowa', externalReferenceId: reference }] };
      },
      async getTransaction() {
        return { id: 'RIGHT', amount: '29.00', status: 'PAID', ...details };
      },
    };
    assert.equal(await findTestPaymentTransaction(client, 'point', reference), null);
  }
});

test('admin authentication fails closed and checks the complete credentials', () => {
  const basic = (value) => `Basic ${Buffer.from(value).toString('base64')}`;
  assert.equal(isAdmin(basic('admin:secret:password'), 'secret:password'), true);
  for (const input of [null, '', 'Bearer secret', 'Basic ???', basic('guest:secret'), basic('admin:wrong')]) {
    assert.equal(isAdmin(input, 'secret'), false);
  }
  assert.equal(isAdmin(basic('admin:'), ''), false);
  assert.equal(isAdmin(basic('admin:secret'), ''), false);
});

test('checkout origin requires exact configured origin and HTTPS outside localhost', () => {
  assert.equal(appOrigin('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(appOrigin('https://shop.example/'), 'https://shop.example');
  for (const input of ['', 'http://shop.example', 'https://user:pass@shop.example', 'https://shop.example/path']) {
    assert.throws(() => appOrigin(input));
  }
  for (const origin of [null, 'null', 'https://shop.example.attacker.test', 'http://shop.example']) {
    assert.equal(isSameOrigin(new Headers(origin ? { origin } : {}), 'https://shop.example'), false);
  }
  assert.equal(isSameOrigin(new Headers({ origin: 'https://shop.example' }), 'https://shop.example'), true);
  assert.equal(
    isSameOrigin(
      new Headers({ origin: 'https://shop.example', 'sec-fetch-site': 'cross-site' }),
      'https://shop.example',
    ),
    false,
  );
});

test('body limit counts streamed bytes even when content-length is missing or false', async () => {
  for (const headers of [{}, { 'content-length': '1' }, { 'content-length': '100' }]) {
    const request = new Request('https://shop.example', { method: 'POST', body: '123456789', headers });
    await assert.rejects(readBody(request, 8), (error) => error instanceof RequestBodyError && error.status === 413);
  }
  const bytes = new Uint8Array([0, 255, 10, 13, 128]);
  assert.deepEqual(
    new Uint8Array(await readBody(new Request('https://shop.example', { method: 'POST', body: bytes }), 5)),
    bytes,
  );
});

test('checkout redirect must be an absolute HTTPS URL without embedded credentials', () => {
  assert.equal(checkoutUrl('https://checkout.example/pay?id=1'), 'https://checkout.example/pay?id=1');
  for (const url of [
    'javascript:alert(1)',
    '//attacker.test',
    '/path',
    'http://checkout.example',
    'https://user:pass@checkout.example',
  ]) {
    assert.throws(() => checkoutUrl(url));
  }
});

// Execute the actual TypeScript handlers and server page without starting Next.
// Only the server configuration and client-only refresh component are substituted.

function loadExample(relativePath, getPaymentic) {
  const cache = new Map();
  function load(filename) {
    if (filename.endsWith('/lib/paymentic.ts')) return { getPaymentic };
    if (filename.endsWith('/ui/status-auto-refresh.tsx')) return { default: () => null, __esModule: true };
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const localRequire = createRequire(filename);
    const require = (name) => {
      if (name === '@kamilklasa/paymentic-sdk-node') return sdk;
      if (!name.startsWith('.')) return localRequire(name);
      const base = resolve(dirname(filename), name);
      const dependency = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      assert.ok(dependency, `Missing dependency: ${name}`);
      return load(dependency);
    };
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    new Function('require', 'module', 'exports', outputText)(require, module, module.exports);
    return module.exports;
  }
  return load(fileURLToPath(new URL(relativePath, import.meta.url)));
}

function setTestEnv(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

const origin = 'https://shop.example';
const reference = 'test-payment-00000000-0000-4000-8000-000000000001';

function flowFixture({ status = 'PAID', blikTimeout = false, autoCapture = true, isCaptured = true } = {}) {
  const calls = [];
  let currentReference = reference;
  const client = new sdk.PaymenticClient({
    apiKey: 'flow-test-key',
    environment: 'sandbox',
    fetch: async (input, init) => {
      const url = new URL(input);
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ url, method: init.method, body });
      if (url.pathname.endsWith('/channels')) return Response.json({ data: channels });
      if (url.pathname.endsWith('/transactions') && init.method === 'POST') {
        currentReference = body.externalReferenceId;
        return Response.json({ data: { id: 'DEMO-1234-5678', redirectUrl: 'https://checkout.example/payment' } });
      }
      if (url.pathname.endsWith('/blik')) {
        if (blikTimeout) throw new Error('Simulated response lost after acceptance');
        return Response.json({ data: { actionId: 'demo-action' } });
      }
      const row = {
        id: 'DEMO-1234-5678',
        amount: '29.00',
        currency: 'PLN',
        title: 'Płatność testowa',
        externalReferenceId: currentReference,
        status,
        autoCapture,
        isCaptured,
      };
      if (url.pathname.endsWith('/transactions')) {
        assert.equal(url.searchParams.get('filter[externalReferenceId]'), currentReference);
        return Response.json({
          data: [row],
          pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, from: 1, to: 1 },
        });
      }
      assert.ok(url.pathname.endsWith('/transactions/DEMO-1234-5678'), `Unexpected API request: ${url}`);
      return Response.json({ data: row });
    },
  });
  const getPaymentic = () => ({ client, pointId: 'demo-point' });
  return {
    calls,
    checkout: loadExample('./app/api/checkout/route.ts', getPaymentic).POST,
    statusPage: loadExample('./app/status/page.tsx', getPaymentic).default,
  };
}

function checkoutRequest(fields = { payment: 'gateway' }, requestOrigin = origin) {
  return new Request(`${origin}/api/checkout`, {
    method: 'POST',
    headers: {
      Origin: requestOrigin,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Forwarded-For': '127.0.0.1',
      'User-Agent': 'flow-test',
    },
    body: new URLSearchParams(fields),
  });
}

test('checkout and status flow uses server price and the same verified return for success and failure', async (t) => {
  setTestEnv(t, { APP_BASE_URL: origin });
  const fixture = flowFixture();
  const response = await fixture.checkout(
    checkoutRequest({ payment: 'gateway', amount: '0.01', currency: 'EUR', title: 'tampered' }),
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://checkout.example/payment');
  const transaction = fixture.calls.find((call) => call.method === 'POST').body;
  assert.equal(transaction.amount, '29.00');
  assert.equal(transaction.currency, 'PLN');
  assert.equal(transaction.title, 'Płatność testowa');
  assert.equal(transaction.redirect.success, transaction.redirect.failure);
  const returnUrl = new URL(transaction.redirect.success);
  assert.equal(returnUrl.origin, origin);
  assert.equal(returnUrl.pathname, '/status');
  assert.equal(isTestPaymentReference(returnUrl.searchParams.get('ref')), true);
  const html = renderToStaticMarkup(
    await fixture.statusPage({ searchParams: Promise.resolve({ ref: returnUrl.searchParams.get('ref') }) }),
  );
  assert.match(html, /Płatność potwierdzona\./);
  assert.equal(fixture.calls.at(-1).url.pathname.endsWith('/transactions/DEMO-1234-5678'), true);
});

test('checkout rejects a foreign origin before any SDK request', async (t) => {
  setTestEnv(t, { APP_BASE_URL: origin });
  const fixture = flowFixture();
  const response = await fixture.checkout(checkoutRequest({ payment: 'gateway' }, 'https://attacker.example'));
  assert.equal(response.status, 403);
  assert.equal(fixture.calls.length, 0);
});

test('checkout rejects oversized input before calling the SDK', async (t) => {
  setTestEnv(t, { APP_BASE_URL: origin });
  const fixture = flowFixture();
  assert.equal((await fixture.checkout(checkoutRequest({ payment: 'gateway', extra: 'x'.repeat(8192) }))).status, 413);
  assert.equal(fixture.calls.length, 0);
});

test('BLIK response loss keeps the created transaction reachable through the status page', async (t) => {
  setTestEnv(t, { APP_BASE_URL: origin, TRUST_PROXY: 'true' });
  t.mock.method(console, 'error', () => {});
  const fixture = flowFixture({ blikTimeout: true });
  const response = await fixture.checkout(
    checkoutRequest({
      payment: 'blik-code',
      blikCode: '123456',
      customerName: 'Test User',
      customerEmail: 'test@example.test',
    }),
  );
  const created = fixture.calls.find((call) => call.url.pathname.endsWith('/transactions') && call.method === 'POST');
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `/status?ref=${created.body.externalReferenceId}`);
  assert.equal(fixture.calls.filter((call) => call.method === 'POST').length, 2);
  const html = renderToStaticMarkup(
    await fixture.statusPage({ searchParams: Promise.resolve({ ref: created.body.externalReferenceId }) }),
  );
  assert.match(html, /Płatność potwierdzona\./);
});

test('status reads API state instead of trusting return parameters', async () => {
  for (const [status, title] of [
    ['PENDING', 'Czekamy na potwierdzenie płatności.'],
    ['FAILED', 'Płatność nie została opłacona.'],
  ]) {
    const fixture = flowFixture({ status });
    const html = renderToStaticMarkup(
      await fixture.statusPage({
        searchParams: Promise.resolve({ ref: reference, status: 'PAID', reason: 'payment' }),
      }),
    );
    assert.ok(html.includes(title));
    assert.ok(!html.includes('Płatność potwierdzona.'));
    assert.equal(fixture.calls.length, 2);
  }
  const fixture = flowFixture({ autoCapture: false, isCaptured: false });
  const html = renderToStaticMarkup(await fixture.statusPage({ searchParams: Promise.resolve({ ref: reference }) }));
  assert.ok(html.includes('Karta autoryzowana. Czeka na pobranie środków.'));
});

test('bare or invalid status links cannot claim payment or query the SDK', async () => {
  const fixture = flowFixture();
  for (const ref of [undefined, 'invalid', [reference, reference]]) {
    const html = renderToStaticMarkup(
      await fixture.statusPage({ searchParams: Promise.resolve({ ref, status: 'PAID' }) }),
    );
    assert.ok(html.includes('Nie znamy statusu tej płatności.'));
  }
  const html = renderToStaticMarkup(await fixture.statusPage({ searchParams: Promise.resolve({ reason: 'email' }) }));
  assert.ok(html.includes('Podaj poprawny adres e-mail'));
  assert.equal(fixture.calls.length, 0);
});

test('webhook verifies the original bytes before acknowledgement and rejects tampering', async (t) => {
  const secret = 'flow-test-signature-key';
  setTestEnv(t, { PAYMENTIC_WEBHOOK_SIGNATURE_KEY: secret });
  const log = t.mock.method(console, 'info', () => {});
  const { POST } = loadExample('./app/api/webhook/route.ts');
  const body =
    JSON.stringify(
      {
        transactionId: 'DEMO-1234-5678',
        pointId: 'demo-point',
        status: 'PAID',
        amount: '29.00',
        currency: 'PLN',
        externalReferenceId: reference,
      },
      null,
      2,
    ) + '\n';
  const event = 'PAYMENT.TRANSACTION_STATUS_CHANGED';
  const notificationId = '01j96yn02bhbv8j1jjtk36zn2t';
  const time = new Date().toISOString();
  const signature = createHmac('sha512', secret)
    .update(`${event}|1.2|${body}|${notificationId}|${time}`)
    .digest('base64');
  const headers = {
    'user-agent': 'Paymentic/1.2',
    'content-type': 'application/json',
    'x-paymentic-event': event,
    'x-paymentic-notification-id': notificationId,
    'x-paymentic-time': time,
    'x-paymentic-signature': signature,
  };
  const request = (raw, signatureHeaders = headers) =>
    new Request(`${origin}/api/webhook`, { method: 'POST', headers: signatureHeaders, body: raw });
  assert.equal((await POST(request(body))).status, 202);
  assert.equal(log.mock.callCount(), 1);
  assert.equal((await POST(request(body + ' '))).status, 401);
  assert.equal((await POST(request(body, { ...headers, 'x-paymentic-signature': 'A'.repeat(88) }))).status, 401);
  assert.equal((await POST(request('x'.repeat(65537)))).status, 413);
  assert.equal(log.mock.callCount(), 1, 'Rejected notifications must not reach event handling');
});
