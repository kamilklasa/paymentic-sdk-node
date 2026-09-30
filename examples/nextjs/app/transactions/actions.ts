'use server';

import { PaymenticApiError } from '@kamilklasa/paymentic-sdk-node';
import { redirect } from 'next/navigation';
import { canCaptureTransaction } from '../lib/test-payment';
import { getPaymentic, requireAdmin } from '../lib/paymentic';

export async function createRefund(id: string, formData: FormData) {
  await requireAdmin(true);

  const amount = formData.get('amount');
  const confirmed = formData.get('confirm');
  const path = `/transactions/${encodeURIComponent(id)}`;
  if (
    typeof amount !== 'string' ||
    !/^(?:0|[1-9]\d{0,7})\.\d{2}$/.test(amount) ||
    amount === '0.00' ||
    confirmed !== 'yes'
  ) {
    redirect(`${path}?error=invalid`);
  }

  const { client: refundClient, pointId: refundPointId } = getPaymentic();
  let refundId: string;
  try {
    const created = await refundClient.createRefund(refundPointId, id, {
      amount,
    });
    refundId = created.id;
  } catch (error) {
    if (error instanceof PaymenticApiError) {
      console.error('Paymentic rejected the example refund:', error.status);
      redirect(`${path}?error=rejected`);
    }
    throw error;
  }
  redirect(`${path}?refund=${encodeURIComponent(refundId)}`);
}

export async function capturePayment(id: string, formData: FormData) {
  await requireAdmin(true);

  const path = `/transactions/${encodeURIComponent(id)}`;
  if (formData.get('confirm') !== 'yes') redirect(`${path}?capture=invalid`);

  const { client: captureClient, pointId: capturePointId } = getPaymentic();
  const current = await captureClient.getTransaction(capturePointId, id);
  if (!canCaptureTransaction(current)) redirect(`${path}?capture=unavailable`);

  try {
    await captureClient.captureTransaction(capturePointId, id);
  } catch (error) {
    if (error instanceof PaymenticApiError) {
      console.error('Paymentic rejected the example capture:', error.status);
      redirect(`${path}?capture=rejected`);
    }
    throw error;
  }
  redirect(`${path}?capture=accepted`);
}
