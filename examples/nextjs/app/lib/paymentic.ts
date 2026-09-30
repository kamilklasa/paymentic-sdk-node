import 'server-only';
import { headers } from 'next/headers';
import { appOrigin, isAdmin, isSameOrigin } from './security';
import { PaymenticClient } from '@kamilklasa/paymentic-sdk-node';

export function getPaymentic() {
  const apiKey = process.env.PAYMENTIC_API_KEY;
  const pointId = process.env.PAYMENTIC_POINT_ID;
  if (!apiKey || !pointId) {
    throw new Error('Set PAYMENTIC_API_KEY and PAYMENTIC_POINT_ID in .env.local.');
  }

  return {
    client: new PaymenticClient({
      apiKey,
      environment: 'sandbox',
      timeoutMs: 5_000,
    }),
    pointId,
  };
}

// Every admin page and action checks credentials at the point of use.
export async function requireAdmin(mutation = false) {
  const requestHeaders = await headers();
  if (!isAdmin(requestHeaders.get('authorization'))) throw new Error('Unauthorized.');
  if (mutation && !isSameOrigin(requestHeaders, appOrigin())) throw new Error('Forbidden origin.');
}
