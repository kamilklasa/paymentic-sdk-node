import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { PaymenticClient, verifyWebhook } from '../packages/sdk/dist/index.js';

export function sandboxConfig(env) {
  for (const name of ['PAYMENTIC_API_KEY', 'PAYMENTIC_POINT_ID']) {
    if (!env[name]?.trim()) throw new Error(`Missing ${name}`);
  }
  if (env.PAYMENTIC_API_BASE_URL || (env.PAYMENTIC_ENVIRONMENT && env.PAYMENTIC_ENVIRONMENT !== 'sandbox')) {
    throw new Error('Sandbox checks forbid a custom API URL or production environment');
  }
  return {
    apiKey: env.PAYMENTIC_API_KEY,
    pointId: env.PAYMENTIC_POINT_ID,
    signatureKey: env.PAYMENTIC_WEBHOOK_SIGNATURE_KEY,
  };
}

export function verifiedInspection(entry, signatureKey) {
  const raw = Buffer.from(entry.request.raw, 'base64');
  const boundary = raw.indexOf('\r\n\r\n');
  assert.ok(boundary >= 0, 'Inspector request must contain original HTTP headers and body');
  const headers = Object.fromEntries(
    Object.entries(entry.request.headers).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.join(', ') : value,
    ]),
  );
  return verifyWebhook(raw.subarray(boundary + 4), headers, signatureKey);
}

function save(path, run) {
  writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600 });
}

async function poll(read, accept, label) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await read();
    if (accept(result)) return result;
    await delay(2_000);
  }
  throw new Error(`${label} did not finish; inspect the run before resuming`);
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      run: { type: 'string' },
      scenario: { type: 'string', default: 'hosted' },
    },
  });
  const command = positionals[0];
  assert.ok(
    ['start', 'verify', 'capture', 'refund', 'webhooks'].includes(command),
    'Use start|verify|capture|refund|webhooks [--run path] [--scenario hosted|blik|capture]',
  );
  const config = sandboxConfig(env);
  const client = new PaymenticClient({ apiKey: config.apiKey, environment: 'sandbox', timeoutMs: 10_000 });
  assert.equal((await client.ping()).environment, 'sandbox', 'API must confirm sandbox before any mutation');

  if (command === 'start') {
    assert.ok(['hosted', 'blik', 'capture'].includes(values.scenario), 'Unknown scenario');
    const channels = await client.getPointChannels(config.pointId);
    const channel = channels.find(
      (item) =>
        item.available &&
        (values.scenario === 'capture'
          ? item.method === 'CARD'
          : item.id === (values.scenario === 'blik' ? 'blik-level0' : 'blik')),
    );
    assert.ok(channel, `Required channel unavailable for ${values.scenario}; enable it on the sandbox point`);
    const reference = `sdk-release-${randomUUID()}`;
    const runFile = resolve('.scratch/sdk-release', `${reference}.json`);
    mkdirSync(dirname(runFile), { recursive: true });
    const run = {
      reference,
      scenario: values.scenario,
      pointId: config.pointId,
      startedAt: new Date().toISOString(),
      environment: 'sandbox',
      sdkVersion: JSON.parse(readFileSync(new URL('../packages/sdk/package.json', import.meta.url))).version,
      amount: '10.00',
      create: 'attempted',
      checks: { ping: true, channels: true },
    };
    save(runFile, run);
    // Persist intent before each mutation: an ambiguous failure is never retried automatically.
    console.log(JSON.stringify({ runFile, stage: 'creating' }));
    const transaction = await client.createTransaction(config.pointId, {
      amount: run.amount,
      currency: 'PLN',
      title: 'SDK sandbox release check',
      externalReferenceId: reference,
      paymentMethod: values.scenario === 'capture' ? 'CARD' : 'BLIK',
      paymentChannel: channel.id,
      ...(values.scenario === 'capture' ? { autoCapture: false } : {}),
      customer: {
        name: 'Jan Testowy',
        email: 'sdk-test@example.com',
        ip: '203.0.113.1',
        userAgent: 'Paymentic SDK sandbox check',
      },
    });
    run.transactionId = transaction.id;
    run.create = 'accepted';
    if (transaction.redirectUrl) {
      const checkout = new URL(transaction.redirectUrl);
      assert.equal(checkout.protocol, 'https:');
      assert.equal(checkout.hostname, 'pay.sandbox.paymentic.com');
      run.checkoutUrl = checkout.href;
    }
    save(runFile, run);
    if (values.scenario === 'blik') {
      run.blik = 'attempted';
      save(runFile, run);
      const action = await client.processBlikTransaction(config.pointId, run.transactionId, {
        type: 'CODE',
        code: '777123',
      });
      run.actionId = action.actionId;
      run.blik = 'accepted';
      save(runFile, run);
    }
    console.log(
      JSON.stringify({
        runFile,
        transactionId: run.transactionId,
        next:
          values.scenario === 'blik'
            ? 'verify'
            : 'Complete sandbox checkout using checkoutUrl in the private run file, then verify',
      }),
    );
    return;
  }

  assert.ok(values.run, '--run is required');
  const runFile = resolve(values.run);
  const run = JSON.parse(readFileSync(runFile, 'utf8'));
  assert.equal(run.environment, 'sandbox');
  assert.equal(run.pointId, config.pointId, 'Run belongs to another point');
  assert.ok(run.transactionId, 'Creation result unknown; reconcile in Paymentic, do not blindly repeat it');
  const read = () => client.getTransaction(config.pointId, run.transactionId);
  const checkIdentity = (transaction) => {
    assert.equal(transaction.id, run.transactionId);
    assert.equal(transaction.externalReferenceId, run.reference);
    assert.equal(transaction.amount, run.amount);
    assert.equal(transaction.currency, 'PLN');
  };

  if (command === 'verify') {
    const transaction = await poll(read, (item) => ['PAID', 'FAILED', 'EXPIRED'].includes(item.status), 'Payment');
    checkIdentity(transaction);
    assert.equal(transaction.status, 'PAID', 'Payment did not succeed');
    const listed = await client.listTransactions(config.pointId, { filter: { externalReferenceId: run.reference } });
    assert.ok(
      listed.data.some((item) => item.id === run.transactionId),
      'Created transaction missing from filtered list',
    );
    run.checks.getTransaction = true;
    run.checks.listTransactions = true;
    run.status = transaction.status;
    run.isCaptured = transaction.isCaptured;
    if (run.scenario === 'capture') assert.equal(transaction.autoCapture, false);
  } else if (command === 'capture') {
    assert.equal(run.scenario, 'capture', 'Only capture a manual-capture transaction created by this runner');
    const transaction = await read();
    checkIdentity(transaction);
    assert.equal(transaction.status, 'PAID');
    assert.equal(transaction.autoCapture, false);
    if (transaction.isCaptured !== true) {
      assert.equal(transaction.isCaptured, false);
      assert.equal(
        run.capture,
        undefined,
        'Capture already attempted; reconcile ambiguous result before another request',
      );
      run.capture = 'attempted';
      save(runFile, run);
      await client.captureTransaction(config.pointId, run.transactionId);
      run.capture = 'accepted';
      save(runFile, run);
    }
    await poll(read, (item) => item.isCaptured === true, 'Capture');
    assert.ok(run.capture, 'Cannot attribute an external capture to this SDK run');
    run.checks.capture = true;
  } else if (command === 'refund') {
    const transaction = await read();
    checkIdentity(transaction);
    assert.equal(transaction.status, 'PAID');
    if (run.scenario === 'capture') assert.equal(run.checks.capture, true);
    if (!run.refundId) {
      assert.equal(
        run.refund,
        undefined,
        'Refund already attempted; reconcile ambiguous result before another request',
      );
      run.refund = 'attempted';
      save(runFile, run);
      const refund = await client.createRefund(config.pointId, run.transactionId, {
        amount: '1.00',
        reason: 'SDK sandbox release check',
        externalReferenceId: run.reference,
      });
      run.refundId = refund.id;
      run.refund = 'accepted';
      save(runFile, run);
    }
    const refund = await poll(
      () => client.getRefund(config.pointId, run.transactionId, run.refundId),
      (item) => ['DONE', 'REJECTED', 'CANCELLED'].includes(item.status),
      'Refund',
    );
    assert.equal(refund.status, 'DONE');
    assert.equal(refund.amount, '1.00');
    assert.equal(refund.externalReferenceId, run.reference);
    run.checks.createRefund = true;
    run.checks.getRefund = true;
  } else if (command === 'webhooks') {
    assert.ok(config.signatureKey, 'Missing PAYMENTIC_WEBHOOK_SIGNATURE_KEY');
    // Use only the local inspector; never send webhook signatures or keys to another service.
    const inspection = await fetch('http://127.0.0.1:4040/api/requests/http', {
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(inspection.ok, true);
    const records = (await inspection.json()).requests;
    const events = [];
    for (const entry of records) {
      if (entry.request.method !== 'POST' || !entry.request.uri.includes('/api/webhook')) continue;
      let event;
      try {
        event = await verifiedInspection(entry, config.signatureKey);
      } catch {
        continue;
      }
      if (event.payload.transactionId !== run.transactionId) continue;
      if ('pointId' in event.payload) assert.equal(event.payload.pointId, config.pointId);
      if (event.event === 'PAYMENT.REFUND_STATUS_CHANGED' && event.payload.refundId !== run.refundId) continue;
      if (event.event === 'PAYMENT.TRANSACTION_BLIK_STATUS_CHANGED' && event.payload.actionId !== run.actionId)
        continue;
      assert.ok(
        entry.response.status_code >= 200 && entry.response.status_code < 300,
        'Example rejected a signed webhook',
      );
      events.push({
        event: event.event,
        notificationId: event.notificationId,
        status: event.payload.status ?? event.payload.externalStatus,
        receivedAt: entry.start,
      });
    }
    run.webhooks = events;
    save(runFile, run);
    assert.ok(
      events.some((item) => item.event === 'PAYMENT.TRANSACTION_STATUS_CHANGED' && item.status === 'PAID'),
      'Missing genuine PAID webhook',
    );
    if (run.refundId)
      assert.ok(
        events.some((item) => item.event === 'PAYMENT.REFUND_STATUS_CHANGED' && item.status === 'DONE'),
        'Missing genuine DONE refund webhook',
      );
    if (run.actionId)
      assert.ok(
        events.some(
          (item) => item.event === 'PAYMENT.TRANSACTION_BLIK_STATUS_CHANGED' && item.status === 'BLIK_AUTHORIZED',
        ),
        'Missing genuine BLIK_AUTHORIZED webhook',
      );
    run.checks.webhooks = true;
  }
  run.updatedAt = new Date().toISOString();
  save(runFile, run);
  console.log(
    JSON.stringify({ command, transactionId: run.transactionId, refundId: run.refundId, checks: run.checks }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Error details may echo personal data; keep console output to classification only.
    console.error(
      JSON.stringify({
        error: error.name,
        status: error.status,
        ...(error.name === 'AssertionError' || error.name === 'Error' ? { message: error.message } : {}),
      }),
    );
    process.exitCode = 1;
  });
}
