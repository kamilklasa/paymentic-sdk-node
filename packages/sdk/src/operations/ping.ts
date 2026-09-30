import { PaymenticNetworkError, type Request, type RequestOptions } from '../internal/transport.js';
import { isRecord } from '../internal/validation.js';

export interface PingResponse {
  message?: string;
  environment?: 'sandbox' | 'production';
  tokenId?: string;
  clientId?: string;
  version?: string;
  scopes?: string[];
}

export async function ping(request: Request, options: RequestOptions = {}): Promise<PingResponse> {
  const body = await request('/payment/ping', 'GET', undefined, options);
  if (!isPingResponseEnvelope(body)) {
    throw new PaymenticNetworkError();
  }
  return body.data;
}

function isPingResponseEnvelope(value: unknown): value is { data: PingResponse } {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  const data = value.data;
  return (
    (data.message === undefined || typeof data.message === 'string') &&
    (data.environment === undefined || data.environment === 'sandbox' || data.environment === 'production') &&
    (data.tokenId === undefined || typeof data.tokenId === 'string') &&
    (data.clientId === undefined || typeof data.clientId === 'string') &&
    (data.version === undefined || typeof data.version === 'string') &&
    (data.scopes === undefined ||
      (Array.isArray(data.scopes) && data.scopes.every((scope) => typeof scope === 'string')))
  );
}
