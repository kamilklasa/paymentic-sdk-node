import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { sandboxConfig, verifiedInspection } from './sandbox-smoke.mjs';

test('sandbox runner rejects production, alternate hosts and missing credentials', () => {
  const valid = { PAYMENTIC_API_KEY: 'fake', PAYMENTIC_POINT_ID: 'point' };
  assert.equal(sandboxConfig(valid).pointId, 'point');
  for (const config of [
    {},
    { ...valid, PAYMENTIC_API_KEY: ' ' },
    { ...valid, PAYMENTIC_ENVIRONMENT: 'production' },
    { ...valid, PAYMENTIC_API_BASE_URL: 'https://api.paymentic.com/v1_2' },
  ]) {
    assert.throws(() => sandboxConfig(config));
  }
});

test('inspector verification uses original body bytes and rejects tampering', async () => {
  const secret = 'fake-signature-key';
  const event = 'PAYMENT.TRANSACTION_STATUS_CHANGED';
  const body = '{ "transactionId":"tx", "pointId":"point", "status":"PAID", "amount":"1.00", "currency":"PLN" }';
  const signature = createHmac('sha512', secret)
    .update(`${event}|1.2|${body}|notification|2026-09-30T00:00:00Z`)
    .digest('base64');
  const entry = {
    request: {
      headers: {
        'User-Agent': ['Paymentic/1.2'],
        'Content-Type': ['application/json'],
        'X-Paymentic-Event': [event],
        'X-Paymentic-Notification-Id': ['notification'],
        'X-Paymentic-Time': ['2026-09-30T00:00:00Z'],
        'X-Paymentic-Signature': [signature],
      },
      raw: Buffer.from(`POST /api/webhook HTTP/1.1\r\nContent-Type: application/json\r\n\r\n${body}`).toString(
        'base64',
      ),
    },
  };
  assert.equal((await verifiedInspection(entry, secret)).payload.status, 'PAID');
  entry.request.raw = Buffer.from(`POST /api/webhook HTTP/1.1\r\n\r\n${body} `).toString('base64');
  await assert.rejects(verifiedInspection(entry, secret), { name: 'PaymenticWebhookSignatureError' });
});
