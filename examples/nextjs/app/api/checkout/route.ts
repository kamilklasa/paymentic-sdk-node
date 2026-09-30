import { isIP } from 'node:net';
import { appOrigin, isSameOrigin, readBody, RequestBodyError, checkoutUrl } from '../../lib/security';
import { randomUUID } from 'node:crypto';
import { PaymenticApiError } from '@kamilklasa/paymentic-sdk-node';
import { checkoutSelection, TEST_PAYMENT } from '../../lib/test-payment';
import { getPaymentic } from '../../lib/paymentic';

export const runtime = 'nodejs';

function seeOther(location: string) {
  return new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  let appBaseUrl: string;
  try {
    appBaseUrl = appOrigin();
  } catch {
    return seeOther('/status?reason=config');
  }
  if (!isSameOrigin(request.headers, appBaseUrl)) return new Response(null, { status: 403 });
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') {
    return new Response(null, { status: 415 });
  }

  let createdStatusPath: string | undefined;
  try {
    const { client, pointId } = getPaymentic();
    const rawBody = await readBody(request, 8_192);
    const form = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
    if ([...form.keys()].some((key) => form.getAll(key).length !== 1)) return seeOther('/status?reason=input');
    const channels = await client.getPointChannels(pointId);
    const payment = form.get('payment');
    const selected = checkoutSelection(channels, payment, form.get('bank'));
    if (!selected) return seeOther('/status?reason=method');
    const manualCapture = form.get('manualCapture') === 'yes';
    if (manualCapture && payment !== 'card') return seeOther('/status?reason=method');

    const isBlikCode = payment === 'blik-code';
    const code = form.get('blikCode');
    const name = form.get('customerName');
    const email = form.get('customerEmail');
    const customerEmail = typeof email === 'string' ? email.trim() : '';
    const isDirect = 'paymentMethod' in selected;
    // Enable only behind a proxy that overwrites these headers, never one that simply appends.
    const ip =
      process.env.TRUST_PROXY === 'true'
        ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')
        : null;
    const userAgent = request.headers.get('user-agent');
    if (isDirect && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || customerEmail.length > 254)) {
      return seeOther('/status?reason=email');
    }
    if (isBlikCode) {
      if (
        typeof code !== 'string' ||
        !/^\d{6}$/.test(code) ||
        typeof name !== 'string' ||
        name.trim().length < 2 ||
        name.length > 120 ||
        !ip ||
        !isIP(ip) ||
        !userAgent ||
        userAgent.length > 512
      ) {
        return seeOther('/status?reason=blik-input');
      }
    }

    const externalReferenceId = `test-payment-${randomUUID()}`;
    const statusPath = `/status?ref=${encodeURIComponent(externalReferenceId)}`;
    const statusUrl = new URL(statusPath, appBaseUrl).toString();

    const transaction = await client.createTransaction(pointId, {
      amount: TEST_PAYMENT.amount,
      currency: TEST_PAYMENT.currency,
      title: TEST_PAYMENT.title,
      externalReferenceId,
      ...selected,
      ...(manualCapture ? { autoCapture: false } : {}),
      ...(isDirect
        ? {
            customer: {
              email: customerEmail,
              ...(isBlikCode && typeof name === 'string' && ip && userAgent
                ? { name: name.trim(), ip, userAgent }
                : {}),
            },
          }
        : {}),
      redirect: {
        success: statusUrl,
        failure: statusUrl,
      },
    });

    createdStatusPath = statusPath;
    if (isBlikCode && typeof code === 'string') {
      await client.processBlikTransaction(pointId, transaction.id, { type: 'CODE', code });
      return seeOther(statusPath);
    }

    if (!transaction.redirectUrl) {
      console.error('Paymentic did not return a checkout URL:', transaction.id);
      return seeOther(statusPath);
    }
    return seeOther(checkoutUrl(transaction.redirectUrl));
  } catch (error) {
    // A lost BLIK response does not mean payment failed. Keep the existing attempt reachable.
    if (createdStatusPath) {
      console.error('Could not complete checkout; checking the existing transaction status.');
      return seeOther(createdStatusPath);
    }
    if (error instanceof RequestBodyError) return new Response(null, { status: error.status });
    if (error instanceof TypeError) return seeOther('/status?reason=input');
    if (error instanceof PaymenticApiError) {
      console.error('Paymentic rejected the test payment:', error.status);
      return seeOther('/status?reason=payment');
    }
    console.error('Could not create the test payment.');
    return seeOther('/status?reason=checkout');
  }
}
