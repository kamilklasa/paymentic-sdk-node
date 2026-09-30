import { isTransactionStatus } from '../transaction-status.js';
import { PaymenticNetworkError, type Request, type RequestOptions } from '../internal/transport.js';
import {
  assertPointId,
  assertTransactionIds,
  isOptionalBoolean,
  isOptionalString,
  isOptionalNullableString,
  isRecord,
} from '../internal/validation.js';
import type {
  CreateTransactionRequest,
  CreateTransactionResponse,
  TransactionDetails,
  ListTransactionsParams,
  ListTransactionsResponse,
  ProcessBlikTransactionRequest,
  ProcessBlikTransactionResponse,
} from './transaction-types.js';

export async function createTransaction(
  request: Request,
  pointId: string,
  transaction: CreateTransactionRequest,
  options: RequestOptions = {},
): Promise<CreateTransactionResponse> {
  assertPointId(pointId);
  if (!transaction || typeof transaction.amount !== 'string' || typeof transaction.title !== 'string') {
    throw new TypeError('transaction must contain a string amount and title');
  }
  const body = await request(
    `/payment/points/${encodeURIComponent(pointId)}/transactions`,
    'POST',
    transaction,
    options,
  );
  if (!isCreateTransactionResponseEnvelope(body)) {
    throw new PaymenticNetworkError();
  }
  return body.data;
}

export async function getTransaction(
  request: Request,
  pointId: string,
  transactionId: string,
  options: RequestOptions = {},
): Promise<TransactionDetails> {
  assertTransactionIds(pointId, transactionId);
  const body = await request(
    `/payment/points/${encodeURIComponent(pointId)}/transactions/${encodeURIComponent(transactionId)}`,
    'GET',
    undefined,
    options,
  );
  if (!isTransactionDetailsEnvelope(body)) {
    throw new PaymenticNetworkError();
  }
  return body.data;
}

export async function listTransactions(
  request: Request,
  pointId: string,
  params: ListTransactionsParams = {},
  options: RequestOptions = {},
): Promise<ListTransactionsResponse> {
  assertPointId(pointId);
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params.filter ?? {})) {
    if (value != null) query.append(`filter[${name}]`, value);
  }
  for (const [name, value] of Object.entries(params.query ?? {})) {
    if (value != null) query.append(`query[${name}]`, value);
  }
  const { number, size } = params.page ?? {};
  if (number != null) {
    if (!Number.isInteger(number) || number < 1) throw new TypeError('page.number must be a positive integer');
    query.append('page[number]', String(number));
  }
  if (size != null) {
    if (!Number.isInteger(size) || size < 1 || size > 100)
      throw new TypeError('page.size must be an integer from 1 to 100');
    query.append('page[size]', String(size));
  }
  const suffix = query.size ? `?${query}` : '';
  const body = await request(
    `/payment/points/${encodeURIComponent(pointId)}/transactions${suffix}`,
    'GET',
    undefined,
    options,
  );
  if (!isListTransactionsResponse(body)) {
    throw new PaymenticNetworkError();
  }
  return body;
}

export async function captureTransaction(
  request: Request,
  pointId: string,
  transactionId: string,
  options: RequestOptions = {},
): Promise<Record<string, unknown>> {
  assertTransactionIds(pointId, transactionId);
  const body = await request(
    `/payment/points/${encodeURIComponent(pointId)}/transactions/${encodeURIComponent(transactionId)}/capture`,
    'PATCH',
    undefined,
    options,
  );
  if (!isRecord(body) || !isRecord(body.data)) {
    throw new PaymenticNetworkError();
  }
  return body.data;
}

export async function processBlikTransaction(
  request: Request,
  pointId: string,
  transactionId: string,
  process: ProcessBlikTransactionRequest,
  options: RequestOptions = {},
): Promise<ProcessBlikTransactionResponse> {
  assertTransactionIds(pointId, transactionId);
  if (!process || (process.type !== 'CODE' && process.type !== 'ALIAS') || typeof process.code !== 'string') {
    throw new TypeError('process must contain a BLIK type and string code');
  }
  const body = await request(
    `/payment/points/${encodeURIComponent(pointId)}/transactions/${encodeURIComponent(transactionId)}/blik`,
    'POST',
    process,
    options,
  );
  if (!isProcessBlikResponseEnvelope(body)) {
    throw new PaymenticNetworkError();
  }
  return body.data;
}

function isTransactionDetailsEnvelope(value: unknown): value is { data: TransactionDetails } {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  const data = value.data;
  return (
    typeof data.id === 'string' &&
    isTransactionStatus(data.status) &&
    typeof data.amount === 'string' &&
    ['currency', 'title'].every((name) => isOptionalString(data[name])) &&
    [
      'commission',
      'description',
      'externalReferenceId',
      'paymentMethod',
      'paymentChannel',
      'capturedAt',
      'paidAt',
      'createdAt',
      'expiresAt',
    ].every((name) => isOptionalNullableString(data[name])) &&
    ['whitelabel', 'autoCapture', 'isCaptured'].every((name) => isOptionalBoolean(data[name])) &&
    (data.customer === undefined || isTransactionCustomer(data.customer)) &&
    (data.order === undefined || isTransactionOrder(data.order)) &&
    ['billingAddress', 'shippingAddress'].every(
      (name) => data[name] === undefined || data[name] === null || isTransactionAddress(data[name]),
    ) &&
    (data.redirect === undefined ||
      (isRecord(data.redirect) &&
        isOptionalNullableString(data.redirect.success) &&
        isOptionalNullableString(data.redirect.failure))) &&
    (data.cart === undefined ||
      data.cart === null ||
      (Array.isArray(data.cart) &&
        data.cart.every(
          (item) =>
            isRecord(item) &&
            isOptionalNullableString(item.name) &&
            isOptionalNullableString(item.unitPrice) &&
            (item.quantity === undefined || item.quantity === null || Number.isInteger(item.quantity)),
        )))
  );
}

function isTransactionCustomer(value: unknown): boolean {
  return (
    isRecord(value) &&
    ['name', 'email', 'phone', 'country', 'locale', 'ip', 'userAgent', 'fingerprint'].every((name) =>
      isOptionalNullableString(value[name]),
    ) &&
    ['emailVerified', 'phoneVerified'].every((name) => value[name] === null || isOptionalBoolean(value[name]))
  );
}

function isTransactionAddress(value: unknown): boolean {
  return (
    isRecord(value) &&
    [
      'firstName',
      'lastName',
      'street',
      'buildingNumber',
      'flat',
      'city',
      'region',
      'postalCode',
      'state',
      'country',
      'company',
    ].every((name) => isOptionalNullableString(value[name]))
  );
}

function isTransactionOrder(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOptionalNullableString(value.id) &&
    isOptionalNullableString(value.trackingNumber) &&
    (value.customerType === undefined ||
      value.customerType === null ||
      value.customerType === 'B2B' ||
      value.customerType === 'B2C') &&
    (value.shippingMethod === undefined ||
      value.shippingMethod === null ||
      [
        'VIRTUAL',
        'TRACKED_DELIVERY',
        'UNTRACKED_DELIVERY',
        'IN_STORE_PICKUP',
        'PARCEL_PICKUP',
        'LOCKER_PICKUP',
        'HYBRID',
        'OTHER',
      ].includes(value.shippingMethod as string))
  );
}

function isProcessBlikResponseEnvelope(value: unknown): value is { data: ProcessBlikTransactionResponse } {
  return (
    isRecord(value) &&
    isRecord(value.data) &&
    typeof value.data.actionId === 'string' &&
    (value.data.alias === undefined || value.data.alias === null || isRecord(value.data.alias))
  );
}

function isListTransactionsResponse(value: unknown): value is ListTransactionsResponse {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.pagination)) return false;
  const pagination = value.pagination;
  const links = pagination.links;
  return (
    value.data.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        isTransactionStatus(item.status) &&
        typeof item.amount === 'string' &&
        typeof item.title === 'string' &&
        [
          'commission',
          'customerName',
          'customerEmail',
          'externalReferenceId',
          'paymentMethod',
          'paymentChannel',
          'orderId',
          'blikId',
          'cardBin',
          'paidAt',
          'createdAt',
        ].every((name) => isOptionalNullableString(item[name])),
    ) &&
    ['page', 'pageSize', 'total', 'totalPages'].every((name) => Number.isInteger(pagination[name])) &&
    (pagination.from === undefined || pagination.from === null || Number.isInteger(pagination.from)) &&
    (pagination.to === undefined || pagination.to === null || Number.isInteger(pagination.to)) &&
    (links === undefined ||
      (isRecord(links) && ['first', 'prev', 'next', 'last'].every((name) => isOptionalNullableString(links[name]))))
  );
}

function isCreateTransactionResponseEnvelope(value: unknown): value is { data: CreateTransactionResponse } {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  const data = value.data;
  return (
    typeof data.id === 'string' &&
    (data.redirectUrl === undefined || typeof data.redirectUrl === 'string') &&
    (data.whitelabel === undefined || data.whitelabel === null || isRecord(data.whitelabel))
  );
}
