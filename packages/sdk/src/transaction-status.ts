export const TRANSACTION_STATUSES = ['CREATED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED'] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export function isTransactionStatus(value: unknown): value is TransactionStatus {
  return TRANSACTION_STATUSES.some((status) => status === value);
}
