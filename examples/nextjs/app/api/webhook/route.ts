import { readBody, RequestBodyError } from '../../lib/security';
import {
  PaymenticWebhookHeaderError,
  PaymenticWebhookPayloadError,
  PaymenticWebhookSignatureError,
  PaymenticUnsupportedWebhookEventError,
  verifyWebhook,
} from '@kamilklasa/paymentic-sdk-node';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const signatureKey = process.env.PAYMENTIC_WEBHOOK_SIGNATURE_KEY;
  if (!signatureKey) {
    console.error('Set PAYMENTIC_WEBHOOK_SIGNATURE_KEY before receiving webhooks.');
    return new Response(null, { status: 500 });
  }

  try {
    const rawBody = await readBody(request, 65_536);
    const notification = await verifyWebhook(rawBody, request.headers, signatureKey);

    // Persist and deduplicate notificationId before acknowledging delivery in a real application.
    console.info('Verified Paymentic notification:', {
      event: notification.event,
      notificationId: notification.notificationId,
      transactionId: notification.payload.transactionId,
      status: 'status' in notification.payload ? notification.payload.status : notification.payload.externalStatus,
    });
    return new Response(null, { status: 202 });
  } catch (error) {
    if (error instanceof RequestBodyError) return new Response(null, { status: error.status });
    if (error instanceof PaymenticWebhookHeaderError || error instanceof PaymenticWebhookSignatureError) {
      return new Response(null, { status: 401 });
    }
    if (error instanceof PaymenticWebhookPayloadError || error instanceof PaymenticUnsupportedWebhookEventError) {
      return new Response(null, { status: 400 });
    }
    console.error('Webhook processing failed.');
    return new Response(null, { status: 500 });
  }
}
