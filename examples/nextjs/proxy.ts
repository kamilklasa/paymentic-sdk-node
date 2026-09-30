import { NextResponse, type NextRequest } from 'next/server';
import { isAdmin } from './app/lib/security';

export const config = { matcher: ['/transactions/:path*'] };

export function proxy(request: NextRequest) {
  if (!process.env.EXAMPLE_ADMIN_PASSWORD) {
    return new Response('Set EXAMPLE_ADMIN_PASSWORD before opening the transaction admin.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  if (!isAdmin(request.headers.get('authorization'))) {
    return new Response('Authentication required.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Paymentic sandbox admin"', 'Cache-Control': 'no-store' },
    });
  }
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
