import type { PaymenticClient, TransactionDetails, PointChannel } from '@kamilklasa/paymentic-sdk-node';

export const TEST_PAYMENT = {
  title: 'Płatność testowa',
  amount: '29.00',
  currency: 'PLN',
} as const;

function toCents(value: string): bigint | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

export function checkoutChannels(channels: PointChannel[]) {
  const price = toCents(TEST_PAYMENT.amount);
  return channels.filter((channel) => {
    if (channel.available !== true || !channel.method) return false;
    if (channel.currencies && !channel.currencies.includes(TEST_PAYMENT.currency)) return false;
    if (channel.compliance?.some((item) => item.type === 'ACCEPTABLE' && item.required && !item.checked)) {
      return false;
    }

    const minimum = channel.amount?.minimum ? toCents(channel.amount.minimum) : null;
    const maximum = channel.amount?.maximum ? toCents(channel.amount.maximum) : null;
    if ((channel.amount?.minimum && minimum === null) || (channel.amount?.maximum && maximum === null)) return false;
    if (price === null || (minimum !== null && price < minimum) || (maximum !== null && price > maximum)) {
      return false;
    }

    return (
      (channel.method === 'BLIK' && (channel.id === 'blik' || channel.id === 'blik-level0')) ||
      channel.method === 'CARD' ||
      (channel.method === 'PBL' && Boolean(channel.id))
    );
  });
}

export function checkoutSelection(
  channels: PointChannel[],
  payment: FormDataEntryValue | null,
  bank: FormDataEntryValue | null,
) {
  const available = checkoutChannels(channels);
  if (payment === 'gateway') return {};
  if (payment === 'blik' && available.some((channel) => channel.method === 'BLIK' && channel.id === 'blik')) {
    return { paymentMethod: 'BLIK' as const, paymentChannel: 'blik' };
  }
  if (
    payment === 'blik-code' &&
    available.some((channel) => channel.method === 'BLIK' && channel.id === 'blik-level0')
  ) {
    return { paymentMethod: 'BLIK' as const, paymentChannel: 'blik-level0' };
  }
  if (payment === 'card' && available.some((channel) => channel.method === 'CARD')) {
    return { paymentMethod: 'CARD' as const };
  }
  if (
    payment === 'bank' &&
    typeof bank === 'string' &&
    available.some((channel) => channel.method === 'PBL' && channel.id === bank)
  ) {
    return { paymentMethod: 'PBL' as const, paymentChannel: bank };
  }
  return null;
}

export function canCaptureTransaction(
  transaction: Pick<TransactionDetails, 'status' | 'autoCapture' | 'isCaptured'>,
): boolean {
  return transaction.status === 'PAID' && transaction.autoCapture === false && transaction.isCaptured === false;
}

const TEST_PAYMENT_REFERENCE = /^test-payment-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTestPaymentReference(value: unknown): value is string {
  return typeof value === 'string' && TEST_PAYMENT_REFERENCE.test(value);
}

export async function findTestPaymentTransaction(
  client: Pick<PaymenticClient, 'listTransactions' | 'getTransaction'>,
  pointId: string,
  reference: string,
) {
  const result = await client.listTransactions(pointId, {
    filter: { externalReferenceId: reference },
    page: { size: 10 },
  });
  const row = result.data.find(
    (transaction) =>
      transaction.externalReferenceId === reference &&
      transaction.amount === TEST_PAYMENT.amount &&
      transaction.title === TEST_PAYMENT.title,
  );
  if (!row) return null;

  const details = await client.getTransaction(pointId, row.id);
  if (
    details.amount !== TEST_PAYMENT.amount ||
    details.externalReferenceId !== reference ||
    (details.currency !== undefined && details.currency !== TEST_PAYMENT.currency)
  ) {
    return null;
  }
  return {
    id: details.id,
    status: details.status,
    autoCapture: details.autoCapture,
    isCaptured: details.isCaptured,
  };
}
