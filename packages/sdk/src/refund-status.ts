const REFUND_STATUSES = ['CREATED', 'ACCEPTED', 'PENDING', 'DONE', 'REJECTED', 'CANCELLED'] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

export function isRefundStatus(value: unknown): value is RefundStatus {
  return REFUND_STATUSES.some((status) => status === value);
}
