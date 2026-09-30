import { ArrowRight } from 'lucide-react';
import type { PointChannel } from '@kamilklasa/paymentic-sdk-node';
import { checkoutChannels, TEST_PAYMENT } from './lib/test-payment';
import { getPaymentic } from './lib/paymentic';
import PageShell from './ui/page-shell';
import PaymentPicker from './ui/payment-picker';

export const dynamic = 'force-dynamic';

function httpsImage(url: string | null | undefined): string | null {
  return url?.startsWith('https://') ? url : null;
}

export default async function HomePage() {
  const amount = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: TEST_PAYMENT.currency }).format(
    Number(TEST_PAYMENT.amount),
  );
  let channels: PointChannel[] = [];
  let channelsError = false;
  try {
    const { client, pointId } = getPaymentic();
    channels = checkoutChannels(await client.getPointChannels(pointId));
  } catch {
    console.error('Could not load payment methods. Check the server configuration and API availability.');
    channelsError = true;
  }

  const blikRedirectChannel = channels.find((channel) => channel.method === 'BLIK' && channel.id === 'blik');
  const blikCodeChannel =
    process.env.TRUST_PROXY === 'true' &&
    channels.find((channel) => channel.method === 'BLIK' && channel.id === 'blik-level0');
  const cardChannel = channels.find((channel) => channel.method === 'CARD');
  const banks = channels
    .filter((channel) => channel.method === 'PBL' && channel.id)
    .map((channel) => ({
      id: channel.id!,
      name: channel.name || channel.id!,
      imageUrl: channel.id === 'other' ? null : httpsImage(channel.image?.default),
    }));

  return (
    <PageShell>
      <section aria-labelledby="payment-title">
        <div className="payment-heading">
          <span>Paymentic / sandbox</span>
          <h1 id="payment-title">
            Płatność testowa<span>.</span>
          </h1>
          <p>Wybierz sposób płatności i sprawdź, jak działa integracja w środowisku testowym.</p>
        </div>
        <form id="test-checkout" action="/api/checkout" method="post" className="checkout-form">
          <fieldset disabled={channelsError}>
            <legend>Sposób płatności</legend>
            <PaymentPicker
              blikRedirect={Boolean(blikRedirectChannel)}
              blikCode={Boolean(blikCodeChannel)}
              blikImageUrl={httpsImage((blikCodeChannel || blikRedirectChannel)?.image?.default)}
              card={Boolean(cardChannel)}
              banks={banks}
            />
          </fieldset>
          {channelsError && (
            <p className="checkout-error" role="alert">
              Nie udało się pobrać metod płatności. Sprawdź konfigurację sandboxa i odśwież stronę.
            </p>
          )}
          <div className="checkout-summary" aria-label="Podsumowanie zamówienia">
            <div>
              <span>{TEST_PAYMENT.title}</span>
              <strong>{amount}</strong>
            </div>
            <div>
              <span>Rodzaj płatności</span>
              <span>Jednorazowa</span>
            </div>
            <div className="checkout-total">
              <strong>Do zapłaty</strong>
              <strong>{amount}</strong>
            </div>
          </div>
          <button type="submit" className="checkout-button" disabled={channelsError}>
            Przejdź do płatności <ArrowRight size={20} aria-hidden="true" />
          </button>
          <p className="checkout-note">To demonstracja SDK. Żadne prawdziwe środki nie zostaną pobrane.</p>
        </form>
      </section>
    </PageShell>
  );
}
