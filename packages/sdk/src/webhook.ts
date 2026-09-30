import { isTransactionStatus, type TransactionStatus } from './transaction-status.js';
import { isRefundStatus, type RefundStatus } from './refund-status.js';

export interface TransactionStatusChangedPayload {
  transactionId: string;
  pointId: string;
  status: TransactionStatus;
  amount: string;
  currency: string;
  commission?: string | null;
  externalReferenceId?: string | null;
  paymentMethod?: string | null;
  paymentChannel?: string | null;
}

export interface TransactionStatusChangedWebhook {
  event: 'PAYMENT.TRANSACTION_STATUS_CHANGED';
  notificationId: string;
  time: string;
  payload: TransactionStatusChangedPayload;
}

export interface RefundStatusChangedPayload {
  refundId: string;
  transactionId: string;
  pointId: string;
  status: RefundStatus;
  amount: string;
  externalReferenceId?: string | null;
}

export interface RefundStatusChangedWebhook {
  event: 'PAYMENT.REFUND_STATUS_CHANGED';
  notificationId: string;
  time: string;
  payload: RefundStatusChangedPayload;
}

const BLIK_EXTERNAL_STATUSES = [
  'BLIK_AUTHORIZED',
  'BLIK_CODE_NOT_FOUND',
  'BLIK_CODE_EXPIRED',
  'BLIK_SYSTEM_DECLINED',
  'BLIK_CUSTOMER_DECLINED',
  'BLIK_INSUFFICIENT_FUNDS',
  'BLIK_TIMEOUT',
  'BLIK_CUSTOMER_LIMIT',
  'BLIK_ALIAS_NONUNIQUE',
  'BLIK_ERROR',
] as const;

export type TransactionBlikExternalStatus = (typeof BLIK_EXTERNAL_STATUSES)[number];

export interface TransactionBlikStatusChangedPayload {
  transactionId: string;
  actionId: string;
  externalStatus: TransactionBlikExternalStatus;
  externalId: string;
}

export interface TransactionBlikStatusChangedWebhook {
  event: 'PAYMENT.TRANSACTION_BLIK_STATUS_CHANGED';
  notificationId: string;
  time: string;
  payload: TransactionBlikStatusChangedPayload;
}

export class PaymenticWebhookHeaderError extends Error {
  override readonly name = 'PaymenticWebhookHeaderError';
  constructor() {
    super('Paymentic webhook is missing a required or valid header');
  }
}

export class PaymenticWebhookSignatureError extends Error {
  override readonly name = 'PaymenticWebhookSignatureError';
  constructor() {
    super('Invalid Paymentic webhook signature');
  }
}

export class PaymenticWebhookPayloadError extends Error {
  override readonly name = 'PaymenticWebhookPayloadError';
  constructor() {
    super('Invalid Paymentic webhook payload');
  }
}

export class PaymenticUnsupportedWebhookEventError extends Error {
  override readonly name = 'PaymenticUnsupportedWebhookEventError';
  constructor() {
    super('Unsupported Paymentic webhook event');
  }
}

const EVENT = 'PAYMENT.TRANSACTION_STATUS_CHANGED';
const REFUND_EVENT = 'PAYMENT.REFUND_STATUS_CHANGED';
const BLIK_EVENT = 'PAYMENT.TRANSACTION_BLIK_STATUS_CHANGED';
const REQUIRED_HEADERS = [
  'user-agent',
  'content-type',
  'x-paymentic-event',
  'x-paymentic-notification-id',
  'x-paymentic-time',
  'x-paymentic-signature',
] as const;

/** Verify a v1.2 notification before reading its JSON payload. */
export async function verifyWebhook(
  rawBody: string | Uint8Array,
  headers: HeadersInit,
  signatureKey: string,
): Promise<TransactionStatusChangedWebhook | RefundStatusChangedWebhook | TransactionBlikStatusChangedWebhook> {
  if (typeof signatureKey !== 'string' || !signatureKey) {
    throw new TypeError('signatureKey must be a non-empty string');
  }
  if (typeof rawBody !== 'string' && !(rawBody instanceof Uint8Array)) {
    throw new TypeError('rawBody must be a string or Uint8Array');
  }

  let requestHeaders: Headers;
  try {
    requestHeaders = new Headers(headers);
  } catch {
    throw new PaymenticWebhookHeaderError();
  }
  const values = REQUIRED_HEADERS.map((name) => requestHeaders.get(name));
  if (values.some((value) => !value)) throw new PaymenticWebhookHeaderError();
  const [userAgent, contentType, event, notificationId, time, signature] = values as string[];
  const version = /^Paymentic\/(\d+\.\d+)$/.exec(userAgent)?.[1];
  if (!version || contentType.toLowerCase() !== 'application/json') throw new PaymenticWebhookHeaderError();

  // Snapshot mutable input before the asynchronous verification step.
  const bodyBytes = typeof rawBody === 'string' ? new TextEncoder().encode(rawBody) : new Uint8Array(rawBody);
  const prefix = new TextEncoder().encode(`${event}|${version}|`);
  const suffix = new TextEncoder().encode(`|${notificationId}|${time}`);
  const signedBytes = new Uint8Array(prefix.length + bodyBytes.length + suffix.length);
  signedBytes.set(prefix);
  signedBytes.set(bodyBytes, prefix.length);
  signedBytes.set(suffix, prefix.length + bodyBytes.length);

  // SHA-512 HMAC is 64 bytes, or 88 Base64 characters including two padding characters.
  if (!/^[A-Za-z0-9+/]{86}==$/.test(signature)) {
    throw new PaymenticWebhookSignatureError();
  }
  const signatureBytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signatureKey),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['verify'],
  );
  // Web Crypto's HMAC verify performs the comparison in constant time.
  if (!(await crypto.subtle.verify('HMAC', key, signatureBytes, signedBytes))) {
    throw new PaymenticWebhookSignatureError();
  }

  if (version !== '1.2') throw new PaymenticWebhookHeaderError();
  if (event !== EVENT && event !== REFUND_EVENT && event !== BLIK_EVENT) {
    throw new PaymenticUnsupportedWebhookEventError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes));
  } catch {
    throw new PaymenticWebhookPayloadError();
  }
  if (event === REFUND_EVENT) {
    if (!isRefundStatusChangedPayload(payload)) throw new PaymenticWebhookPayloadError();
    return { event, notificationId, time, payload };
  }
  if (event === BLIK_EVENT) {
    if (!isTransactionBlikStatusChangedPayload(payload)) throw new PaymenticWebhookPayloadError();
    return { event, notificationId, time, payload };
  }
  if (!isTransactionStatusChangedPayload(payload)) throw new PaymenticWebhookPayloadError();
  return { event, notificationId, time, payload };
}

function isTransactionBlikStatusChangedPayload(value: unknown): value is TransactionBlikStatusChangedPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.transactionId === 'string' &&
    typeof payload.actionId === 'string' &&
    BLIK_EXTERNAL_STATUSES.some((status) => status === payload.externalStatus) &&
    typeof payload.externalId === 'string'
  );
}

function isRefundStatusChangedPayload(value: unknown): value is RefundStatusChangedPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.refundId === 'string' &&
    typeof payload.transactionId === 'string' &&
    typeof payload.pointId === 'string' &&
    isRefundStatus(payload.status) &&
    typeof payload.amount === 'string' &&
    (payload.externalReferenceId === undefined ||
      payload.externalReferenceId === null ||
      typeof payload.externalReferenceId === 'string')
  );
}

function isTransactionStatusChangedPayload(value: unknown): value is TransactionStatusChangedPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.transactionId === 'string' &&
    typeof payload.pointId === 'string' &&
    isTransactionStatus(payload.status) &&
    typeof payload.amount === 'string' &&
    typeof payload.currency === 'string' &&
    ['commission', 'externalReferenceId', 'paymentMethod', 'paymentChannel'].every(
      (name) => payload[name] === undefined || payload[name] === null || typeof payload[name] === 'string',
    )
  );
}
