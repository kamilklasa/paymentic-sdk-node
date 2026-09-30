import { isRecord } from './validation.js';

export interface PaymenticClientOptions {
  apiKey: string;
  environment: 'sandbox' | 'production';
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface PaymenticErrorDetail {
  code?: string;
  message?: string;
  docsUrl?: string;
  details?: unknown;
}

export class PaymenticApiError extends Error {
  override readonly name = 'PaymenticApiError';

  constructor(
    readonly status: number,
    readonly errors: ReadonlyArray<PaymenticErrorDetail>,
  ) {
    super(`Paymentic API returned HTTP ${status}`);
  }
}

export class PaymenticNetworkError extends Error {
  override readonly name = 'PaymenticNetworkError';
  constructor() {
    super('Paymentic request failed');
  }
}

export class PaymenticAbortError extends Error {
  override readonly name = 'PaymenticAbortError';
  constructor(readonly reason: 'signal' | 'timeout') {
    super(reason === 'timeout' ? 'Paymentic request timed out' : 'Paymentic request was aborted');
  }
}

export type Request = (
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  requestBody: unknown,
  options: RequestOptions,
) => Promise<unknown>;

const BASE_URLS = {
  sandbox: 'https://api.sandbox.paymentic.com/v1_2',
  production: 'https://api.paymentic.com/v1_2',
} as const;

export function createRequest(options: PaymenticClientOptions): Request {
  if (typeof options.apiKey !== 'string' || !options.apiKey.trim()) {
    throw new TypeError('apiKey must be a non-empty string');
  }
  if (options.environment !== 'sandbox' && options.environment !== 'production') {
    throw new TypeError('environment must be sandbox or production');
  }
  // Node timers clamp delays above the signed 32-bit limit to 1 ms.
  if (
    options.timeoutMs !== undefined &&
    (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 2_147_483_647)
  ) {
    throw new TypeError('timeoutMs must be an integer from 1 to 2147483647');
  }
  const apiKey = options.apiKey.trim();
  const baseUrl = (options.baseUrl ?? BASE_URLS[options.environment]).replace(/\/$/, '');
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs;

  return async (path, method, requestBody, requestOptions) => {
    const signal =
      timeoutMs === undefined
        ? requestOptions.signal
        : AbortSignal.any([...(requestOptions.signal ? [requestOptions.signal] : []), AbortSignal.timeout(timeoutMs)]);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }),
        signal,
      });
      const responseText = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(responseText);
      } catch {
        body = undefined;
      }
      if (!response.ok) {
        throw new PaymenticApiError(response.status, readErrors(body, apiKey));
      }
      return body;
    } catch (error) {
      if (error instanceof PaymenticApiError || error instanceof PaymenticNetworkError) throw error;
      if (signal?.aborted) {
        throw new PaymenticAbortError(requestOptions.signal?.aborted ? 'signal' : 'timeout');
      }
      throw new PaymenticNetworkError();
    }
  };
}

function readErrors(body: unknown, apiKey: string): PaymenticErrorDetail[] {
  if (!isRecord(body) || !Array.isArray(body.errors)) return [];
  return body.errors.filter(isRecord).map((error) => ({
    code: typeof error.code === 'string' ? redact(error.code, apiKey) : undefined,
    message: typeof error.message === 'string' ? redact(error.message, apiKey) : undefined,
    docsUrl: typeof error.docsUrl === 'string' ? redact(error.docsUrl, apiKey) : undefined,
    details: redactValue(error.details, apiKey),
  }));
}

function redactValue(value: unknown, apiKey: string): unknown {
  if (typeof value === 'string') return redact(value, apiKey);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, apiKey));
  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [redact(key, apiKey), redactValue(item, apiKey)]),
    );
  return value;
}

function redact(value: string, apiKey: string): string {
  return value.replaceAll(apiKey, '[REDACTED]');
}
