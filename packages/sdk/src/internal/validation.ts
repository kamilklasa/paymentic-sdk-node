export function assertPointId(pointId: string): void {
  if (typeof pointId !== 'string' || !pointId.trim()) {
    throw new TypeError('pointId must be a non-empty string');
  }
}

export function assertTransactionIds(pointId: string, transactionId: string): void {
  assertPointId(pointId);
  if (typeof transactionId !== 'string' || !transactionId.trim()) {
    throw new TypeError('transactionId must be a non-empty string');
  }
}

export function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

export function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
