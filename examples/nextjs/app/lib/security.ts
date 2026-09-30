import { createHash, timingSafeEqual } from 'node:crypto';

// Shared by Proxy and the server-side authorization checks.
export function isAdmin(authorization: string | null, password = process.env.EXAMPLE_ADMIN_PASSWORD): boolean {
  if (!password || !authorization?.startsWith('Basic ') || authorization.length > 4096) return false;
  const credentials = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(credentials), digest(`admin:${password}`));
}

export function appOrigin(value = process.env.APP_BASE_URL): string {
  if (!value) throw new Error('Set APP_BASE_URL.');
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('APP_BASE_URL must be an HTTPS origin (HTTP is allowed on localhost).');
  return url.origin;
}

export function isSameOrigin(headers: Headers, origin: string): boolean {
  return headers.get('origin') === origin && headers.get('sec-fetch-site') !== 'cross-site';
}

export class RequestBodyError extends Error {
  readonly status: number;
  constructor(status: number) {
    super('Invalid request body.');
    this.status = status;
  }
}

// Count actual streamed bytes; Content-Length alone is controlled by the sender.
export async function readBody(request: Request, limit: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new RequestBodyError(413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new RequestBodyError(413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export function checkoutUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid checkout URL.');
  return url.href;
}
