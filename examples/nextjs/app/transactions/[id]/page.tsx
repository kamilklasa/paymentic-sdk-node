import SubmitButton from '../../ui/submit-button';
import { capturePayment, createRefund } from '../actions';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import PageShell from '../../ui/page-shell';
import { PaymenticApiError } from '@kamilklasa/paymentic-sdk-node';
import { notFound } from 'next/navigation';
import { canCaptureTransaction } from '../../lib/test-payment';
import { getPaymentic, requireAdmin } from '../../lib/paymentic';

export const dynamic = 'force-dynamic';

interface TransactionPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ refund?: string; error?: string; capture?: string }>;
}

export default async function TransactionPage({ params, searchParams }: TransactionPageProps) {
  const { id } = await params;
  const query = await searchParams;
  await requireAdmin();
  const { client, pointId } = getPaymentic();
  let transaction;
  try {
    transaction = await client.getTransaction(pointId, id);
  } catch (error) {
    if (error instanceof PaymenticApiError && error.status === 404) notFound();
    throw error;
  }

  const refund = query.refund ? await client.getRefund(pointId, id, query.refund) : null;

  return (
    <PageShell wide>
      <Link href="/transactions" className="back-link">
        <ArrowLeft size={15} aria-hidden="true" /> Wszystkie transakcje
      </Link>
      <div className="admin-heading">
        <div>
          <div className="eyebrow">TRANSAKCJA / {transaction.id}</div>
          <h1>
            Szczegóły płatności<span className="accent">.</span>
          </h1>
          <p>{transaction.title ?? 'Transakcja Paymentic'}</p>
        </div>
        <span className={`status status-${transaction.status.toLowerCase()}`}>{transaction.status}</span>
      </div>

      <div className="detail-grid">
        <section className="detail-card" aria-labelledby="transaction-details-title">
          <div className="card-topline">01 / TRANSAKCJA</div>
          <h2 id="transaction-details-title">Podsumowanie</h2>
          <dl className="detail-list">
            <div>
              <dt>Kwota</dt>
              <dd>
                {transaction.amount} {transaction.currency ?? 'PLN'}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{transaction.status}</dd>
            </div>
            <div>
              <dt>Numer referencyjny</dt>
              <dd>{transaction.externalReferenceId ?? '—'}</dd>
            </div>
            <div>
              <dt>Utworzono</dt>
              <dd>{transaction.createdAt ?? '—'}</dd>
            </div>
            <div>
              <dt>Opłacono</dt>
              <dd>{transaction.paidAt ?? '—'}</dd>
            </div>
            <div>
              <dt>Automatyczne pobranie</dt>
              <dd>{transaction.autoCapture === undefined ? '—' : transaction.autoCapture ? 'Tak' : 'Nie'}</dd>
            </div>
            <div>
              <dt>Środki pobrane</dt>
              <dd>{transaction.isCaptured === undefined ? '—' : transaction.isCaptured ? 'Tak' : 'Nie'}</dd>
            </div>
          </dl>
          <div className="capture-panel">
            <h3>Pobranie środków</h3>
            {query.capture === 'accepted' && (
              <p className="refund-result" role="status">
                Przyjęto zlecenie pobrania środków. Odśwież stronę, aby sprawdzić status.
              </p>
            )}
            {query.capture && query.capture !== 'accepted' && (
              <p className="form-message" role="alert">
                {query.capture === 'invalid'
                  ? 'Potwierdź pobranie środków przed wysłaniem.'
                  : query.capture === 'unavailable'
                    ? 'Dla tej transakcji nie można już pobrać środków.'
                    : 'Paymentic odrzucił pobranie środków. Sprawdź log serwera.'}
              </p>
            )}
            {canCaptureTransaction(transaction) ? (
              <form action={capturePayment.bind(null, id)} className="capture-form">
                <label className="confirm-line">
                  <input type="checkbox" name="confirm" value="yes" required /> Potwierdzam testowe pobranie środków.
                </label>
                <SubmitButton>
                  Pobierz środki <ArrowUpRight size={16} aria-hidden="true" />
                </SubmitButton>
              </form>
            ) : (
              <p>Dostępne po autoryzacji karty z ręcznym pobraniem środków, zanim środki zostaną pobrane.</p>
            )}
          </div>
        </section>

        <section className="detail-card refund-card" aria-labelledby="refund-title">
          <div className="card-topline">02 / ZWROT</div>
          <h2 id="refund-title">Zwróć środki</h2>
          {query.error === 'invalid' && (
            <p className="form-message" role="alert">
              Podaj dodatnią kwotę z dwoma miejscami po przecinku i potwierdź zwrot.
            </p>
          )}
          {query.error === 'rejected' && (
            <p className="form-message" role="alert">
              Paymentic odrzucił zwrot. Sprawdź log serwera.
            </p>
          )}
          {refund && (
            <div className="refund-result" role="status">
              Zwrot {refund.id}: <strong>{refund.status}</strong> · {refund.amount} PLN
            </div>
          )}
          {transaction.status === 'PAID' ? (
            <form action={createRefund.bind(null, id)} className="refund-form">
              <label htmlFor="amount">Kwota zwrotu (PLN)</label>
              <input
                id="amount"
                name="amount"
                type="text"
                inputMode="decimal"
                defaultValue={transaction.amount}
                required
              />
              <label className="confirm-line">
                <input type="checkbox" name="confirm" value="yes" required /> Potwierdzam testowy zwrot środków.
              </label>
              <SubmitButton>
                Zleć zwrot <ArrowUpRight size={16} aria-hidden="true" />
              </SubmitButton>
            </form>
          ) : (
            <p>Zwrot można zlecić dla opłaconej transakcji. Jego dostępność weryfikuje Paymentic.</p>
          )}
          <p className="refund-note">Zachowaj identyfikator zwrotu, aby sprawdzić jego status później.</p>
        </section>
      </div>
    </PageShell>
  );
}
