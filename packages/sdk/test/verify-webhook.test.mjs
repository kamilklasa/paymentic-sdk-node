import { assertWebhookContract } from './helpers/contract.mjs';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  PaymenticWebhookHeaderError,
  PaymenticWebhookPayloadError,
  PaymenticWebhookSignatureError,
  PaymenticUnsupportedWebhookEventError,
  verifyWebhook,
} from '../dist/index.js';

const contract = JSON.parse(readFileSync(new URL('../../../contracts/paymentic-openapi-v1.2.json', import.meta.url)));
const event = 'PAYMENT.TRANSACTION_STATUS_CHANGED';
const secret = 'test-webhook-secret';
const notificationId = '01j96yn02bhbv8j1jjtk36zn2t';
const time = '2020-01-01T12:00:00+00:00';
const payload = {
  transactionId: 'FJRS-LY7-3W0-30K9',
  pointId: '000cb241',
  status: 'PAID',
  amount: '10.23',
  currency: 'PLN',
  commission: null,
  externalReferenceId: 'order-7',
  paymentMethod: 'BLIK',
  paymentChannel: null,
};
const rawBody = JSON.stringify(payload);

function signedHeaders(body = rawBody, overrides = {}) {
  const headers = {
    'user-agent': 'Paymentic/1.2',
    'content-type': 'application/json',
    'x-paymentic-event': event,
    'x-paymentic-notification-id': notificationId,
    'x-paymentic-time': time,
    ...overrides,
  };
  const version = headers['user-agent'].split('/')[1];
  headers['x-paymentic-signature'] = createHmac('sha512', secret)
    .update(
      `${headers['x-paymentic-event']}|${version}|${body}|${headers['x-paymentic-notification-id']}|${headers['x-paymentic-time']}`,
    )
    .digest('base64');
  return headers;
}

test('verifyWebhook verifies the raw v1.2 request and returns a typed transaction event', async () => {
  const webhook = contract.webhooks[event].post;
  assert.deepEqual(
    webhook.parameters.map(({ $ref }) => $ref.split('/').at(-1)),
    [
      'User-Agent',
      'Content-Type',
      'X-Paymentic-Event',
      'X-Paymentic-Notification-Id',
      'X-Paymentic-Time',
      'X-Paymentic-Signature',
    ],
  );
  assert.equal(webhook.requestBody.content['application/json'].schema.properties.amount.type, 'string');

  const result = await verifyWebhook(Buffer.from(rawBody), new Headers(signedHeaders()), secret);
  assertWebhookContract(event, result.payload);
  assert.deepEqual(result, { event, notificationId, time, payload });
  assert.deepEqual(await verifyWebhook(rawBody, signedHeaders(), secret), result);
});

test('verifyWebhook returns a signed refund status event with its contract fields and notification metadata', async () => {
  const refundEvent = 'PAYMENT.REFUND_STATUS_CHANGED';
  const refundPayload = {
    refundId: 'AB1-AB2-AB3',
    transactionId: payload.transactionId,
    pointId: payload.pointId,
    status: 'DONE',
    amount: '4.20',
    externalReferenceId: null,
  };
  assertWebhookContract(refundEvent, refundPayload);
  const schema = contract.webhooks[refundEvent].post.requestBody.content['application/json'].schema;
  assert.deepEqual(Object.keys(refundPayload).sort(), Object.keys(schema.properties).sort());
  const body = JSON.stringify(refundPayload);
  const headers = signedHeaders(body, { 'x-paymentic-event': refundEvent });
  assert.deepEqual(await verifyWebhook(body, headers, secret), {
    event: refundEvent,
    notificationId,
    time,
    payload: refundPayload,
  });
});

test('verifyWebhook rejects a changed raw body and a wrong or malformed signature', async () => {
  const headers = signedHeaders();
  await assert.rejects(verifyWebhook(`${rawBody} `, headers, secret), PaymenticWebhookSignatureError);
  await assert.rejects(
    verifyWebhook(rawBody, { ...headers, 'x-paymentic-signature': 'A'.repeat(88) }, secret),
    PaymenticWebhookSignatureError,
  );
  await assert.rejects(
    verifyWebhook(rawBody, { ...headers, 'x-paymentic-signature': 'not-base64' }, secret),
    PaymenticWebhookSignatureError,
  );
  await assert.rejects(verifyWebhook(rawBody, headers, 'wrong-secret'), PaymenticWebhookSignatureError);
});

test('verifyWebhook parses the same bytes that were signed when a caller reuses its buffer', async () => {
  const bytes = Buffer.from(rawBody);
  const verification = verifyWebhook(bytes, signedHeaders(), secret);
  bytes.fill(0x20);
  assert.deepEqual((await verification).payload, payload);
});

test('verifyWebhook distinguishes missing signature headers from signature failure', async () => {
  for (const name of [
    'user-agent',
    'content-type',
    'x-paymentic-event',
    'x-paymentic-notification-id',
    'x-paymentic-time',
    'x-paymentic-signature',
  ]) {
    const headers = signedHeaders();
    delete headers[name];
    await assert.rejects(verifyWebhook(rawBody, headers, secret), PaymenticWebhookHeaderError);
  }
});

test('verifyWebhook rejects a signed notification with an unsupported body version', async () => {
  const headers = signedHeaders(rawBody, { 'user-agent': 'Paymentic/1.1' });
  await assert.rejects(verifyWebhook(rawBody, headers, secret), PaymenticWebhookHeaderError);
});

test('verifyWebhook rejects invalid JSON and malformed transaction data after signature verification', async () => {
  await assert.rejects(verifyWebhook('{bad json', signedHeaders('{bad json'), secret), PaymenticWebhookPayloadError);
  const badBody = JSON.stringify({ ...payload, amount: 10.23 });
  await assert.rejects(verifyWebhook(badBody, signedHeaders(badBody), secret), PaymenticWebhookPayloadError);
});

test('verifyWebhook distinguishes a signed unsupported event', async () => {
  const headers = signedHeaders(rawBody, { 'x-paymentic-event': 'PAYMENT.BLIK_ALIAS_STATUS_CHANGED' });
  await assert.rejects(verifyWebhook(rawBody, headers, secret), PaymenticUnsupportedWebhookEventError);
});

test('verifyWebhook returns a signed transaction BLIK status event with its contract fields and notification metadata', async () => {
  const blikEvent = 'PAYMENT.TRANSACTION_BLIK_STATUS_CHANGED';
  const blikPayload = {
    transactionId: payload.transactionId,
    actionId: '01J8ME1QDJKZT7YB9V54K4Q2ZC',
    externalStatus: 'BLIK_AUTHORIZED',
    externalId: 'bank-42',
  };
  assertWebhookContract(blikEvent, blikPayload);
  const schema = contract.webhooks[blikEvent].post.requestBody.content['application/json'].schema;
  assert.deepEqual(Object.keys(blikPayload).sort(), Object.keys(schema.properties).sort());
  const body = JSON.stringify(blikPayload);
  const headers = signedHeaders(body, { 'x-paymentic-event': blikEvent });
  assert.deepEqual(await verifyWebhook(Buffer.from(body), headers, secret), {
    event: blikEvent,
    notificationId,
    time,
    payload: blikPayload,
  });
});

test('verifyWebhook distinguishes invalid signatures, JSON, and refund payloads', async () => {
  const refundEvent = 'PAYMENT.REFUND_STATUS_CHANGED';
  const valid = {
    refundId: 'AB1-AB2-AB3',
    transactionId: payload.transactionId,
    pointId: payload.pointId,
    status: 'DONE',
    amount: '4.20',
  };
  const body = JSON.stringify(valid);
  await assert.rejects(
    verifyWebhook(`${body} `, signedHeaders(body, { 'x-paymentic-event': refundEvent }), secret),
    PaymenticWebhookSignatureError,
  );
  await assert.rejects(
    verifyWebhook('{broken', signedHeaders('{broken', { 'x-paymentic-event': refundEvent }), secret),
    PaymenticWebhookPayloadError,
  );
  for (const bad of [
    { ...valid, status: 'UNKNOWN' },
    { ...valid, amount: 4.2 },
  ]) {
    const invalidBody = JSON.stringify(bad);
    await assert.rejects(
      verifyWebhook(invalidBody, signedHeaders(invalidBody, { 'x-paymentic-event': refundEvent }), secret),
      PaymenticWebhookPayloadError,
    );
  }
});

test('verifyWebhook distinguishes invalid signatures, JSON, and transaction BLIK payloads', async () => {
  const blikEvent = 'PAYMENT.TRANSACTION_BLIK_STATUS_CHANGED';
  const valid = {
    transactionId: payload.transactionId,
    actionId: '01J8ME1QDJKZT7YB9V54K4Q2ZC',
    externalStatus: 'BLIK_AUTHORIZED',
    externalId: 'bank-42',
  };
  const body = JSON.stringify(valid);
  await assert.rejects(
    verifyWebhook(`${body} `, signedHeaders(body, { 'x-paymentic-event': blikEvent }), secret),
    PaymenticWebhookSignatureError,
  );
  await assert.rejects(
    verifyWebhook('{broken', signedHeaders('{broken', { 'x-paymentic-event': blikEvent }), secret),
    PaymenticWebhookPayloadError,
  );
  for (const bad of [
    { ...valid, externalStatus: 'UNKNOWN' },
    { ...valid, actionId: 123 },
  ]) {
    const invalidBody = JSON.stringify(bad);
    await assert.rejects(
      verifyWebhook(invalidBody, signedHeaders(invalidBody, { 'x-paymentic-event': blikEvent }), secret),
      PaymenticWebhookPayloadError,
    );
  }
});

for (const [name, changed] of [
  ['x-paymentic-event', 'PAYMENT.REFUND_STATUS_CHANGED'],
  ['x-paymentic-notification-id', 'different-id'],
  ['x-paymentic-time', '2026-01-01T00:00:00Z'],
  ['user-agent', 'Paymentic/1.1'],
]) {
  test(`verifyWebhook rejects unsigned changes to ${name}`, async () => {
    await assert.rejects(
      verifyWebhook(rawBody, { ...signedHeaders(), [name]: changed }, secret),
      PaymenticWebhookSignatureError,
    );
  });
}

test('verifyWebhook verifies the signature before reporting malformed JSON', async () => {
  await assert.rejects(verifyWebhook('{bad json', signedHeaders(), secret), PaymenticWebhookSignatureError);
});

test('verifyWebhook rejects signed invalid UTF-8 instead of replacing its bytes', async () => {
  const body = Buffer.concat([Buffer.from(rawBody.slice(0, -1)), Buffer.from([0xff]), Buffer.from('}')]);
  const headers = signedHeaders();
  headers['x-paymentic-signature'] = createHmac('sha512', secret)
    .update(`${event}|1.2|`)
    .update(body)
    .update(`|${notificationId}|${time}`)
    .digest('base64');
  await assert.rejects(verifyWebhook(body, headers, secret), PaymenticWebhookPayloadError);
});
