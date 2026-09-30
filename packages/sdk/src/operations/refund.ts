import { isRefundStatus, type RefundStatus } from '../refund-status.js';
import { PaymenticNetworkError, type Request, type RequestOptions } from '../internal/transport.js';
import { assertTransactionIds, isOptionalNullableString, isRecord } from '../internal/validation.js';

export interface CreateRefundRequest {
  amount: string;
  /** @deprecated Paymentic does not accept this field. It is ignored for compatibility. */
  title?: string;
  reason?: string | null;
  externalReferenceId?: string;
}

export interface CreateRefundResponse {
  id: string;
  status: RefundStatus;
}

export interface RefundDetails extends CreateRefundResponse {
  amount: string;
  reason?: string | null;
  externalReferenceId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export async function createRefund(
  request: Request,
  pointId: string,
  transactionId: string,
  refund: CreateRefundRequest,
  options: RequestOptions = {},
): Promise<CreateRefundResponse> {
  assertTransactionIds(pointId, transactionId);
  if (!refund || typeof refund.amount !== 'string') {
    throw new TypeError('refund must contain a string amount');
  }
  const { amount, reason, externalReferenceId } = refund;
  const body = await request(
    `/payment/points/${encodeURIComponent(pointId)}/transactions/${encodeURIComponent(transactionId)}/refunds`,
    'POST',
    {
      amount,
      ...(reason !== undefined ? { reason } : {}),
      ...(externalReferenceId !== undefined ? { externalReferenceId } : {}),
    },
    options,
  );
  if (!isCreateRefundResponseEnvelope(body)) {
    throw new PaymenticNetworkError();
  }
  return body.data;
}

export async function getRefund(
  request: Request,
  pointId: string,
  transactionId: string,
  refundId: string,
  options: RequestOptions = {},
): Promise<RefundDetails> {
  assertTransactionIds(pointId, transactionId);
  if (typeof refundId !== 'string' || !refundId.trim()) {
    throw new TypeError('refundId must be a non-empty string');
  }
  const body = await request(
    `/payment/points/${encodeURIComponent(pointId)}/transactions/${encodeURIComponent(transactionId)}/refunds/${encodeURIComponent(refundId)}`,
    'GET',
    undefined,
    options,
  );
  if (!isRefundDetailsEnvelope(body)) {
    throw new PaymenticNetworkError();
  }
  return body.data;
}

function isCreateRefundResponseEnvelope(value: unknown): value is { data: CreateRefundResponse } {
  return (
    isRecord(value) && isRecord(value.data) && typeof value.data.id === 'string' && isRefundStatus(value.data.status)
  );
}

function isRefundDetailsEnvelope(value: unknown): value is { data: RefundDetails } {
  if (!isCreateRefundResponseEnvelope(value) || !isRecord(value.data)) return false;
  const data = value.data;
  return (
    typeof data.amount === 'string' &&
    ['reason', 'externalReferenceId', 'createdAt', 'updatedAt'].every((name) => isOptionalNullableString(data[name]))
  );
}
