import Link from 'next/link';
import { ArrowRight, RefreshCw } from 'lucide-react';
import PageShell from '../ui/page-shell';
import { findTestPaymentTransaction, isTestPaymentReference } from '../lib/test-payment';
import { getPaymentic } from '../lib/paymentic';
import StatusAutoRefresh from '../ui/status-auto-refresh';

export const dynamic = 'force-dynamic';

const messages: Record<string, string> = {
  origin: 'Nieprawidłowe pochodzenie żądania. Otwórz formularz płatności ponownie.',
  input: 'Nieprawidłowy formularz płatności. Spróbuj ponownie.',
  config: 'Brakuje konfiguracji serwera. Sprawdź zmienne środowiskowe przykładu.',
  method: 'Wybrana metoda nie jest już dostępna dla tego punktu. Odśwież stronę i wybierz ponownie.',
  payment: 'Paymentic odrzucił próbę utworzenia płatności. Szczegóły są w logu serwera.',
  checkout: 'Nie udało się rozpocząć płatności. Spróbuj ponownie za chwilę.',
  'blik-input': 'Sprawdź imię, adres e-mail i sześciocyfrowy kod BLIK, a następnie spróbuj ponownie.',
  email: 'Podaj poprawny adres e-mail potrzebny do utworzenia płatności.',
};

interface StatusPageProps {
  searchParams: Promise<{ ref?: string | string[]; reason?: string | string[] }>;
}

export default async function StatusPage({ searchParams }: StatusPageProps) {
  const { ref, reason } = await searchParams;
  const validReference = isTestPaymentReference(ref);
  let transaction: Awaited<ReturnType<typeof findTestPaymentTransaction>> = null;
  let lookupFailed = false;

  if (validReference) {
    try {
      const { client, pointId } = getPaymentic();
      transaction = await findTestPaymentTransaction(client, pointId, ref);
    } catch {
      console.error('Could not check the returned test payment transaction.');
      lookupFailed = true;
    }
  }

  const inputError =
    !validReference && typeof reason === 'string' && Object.hasOwn(messages, reason) ? messages[reason] : null;
  const status = transaction?.status;
  const awaitingCapture = status === 'PAID' && transaction?.autoCapture === false && transaction.isCaptured !== true;
  const paid = status === 'PAID' && !awaitingCapture;
  const failed = status === 'FAILED' || status === 'EXPIRED';
  const waiting = validReference && !lookupFailed && !paid && !failed && !awaitingCapture;
  const title = inputError
    ? 'Nie udało się rozpocząć płatności.'
    : paid
      ? 'Płatność potwierdzona.'
      : awaitingCapture
        ? 'Karta autoryzowana. Czeka na pobranie środków.'
        : failed
          ? 'Płatność nie została opłacona.'
          : status
            ? 'Czekamy na potwierdzenie płatności.'
            : lookupFailed
              ? 'Nie udało się sprawdzić płatności.'
              : validReference
                ? 'Szukamy Twojej transakcji.'
                : 'Nie znamy statusu tej płatności.';
  const description =
    inputError ??
    (paid
      ? 'Płatność testowa została potwierdzona w środowisku sandbox.'
      : awaitingCapture
        ? 'Środki zostały zablokowane na karcie i czekają na pobranie. Możesz pobrać je w panelu transakcji.'
        : failed
          ? 'Ta próba płatności zakończyła się niepowodzeniem lub wygasła. Wróć do checkoutu, aby spróbować ponownie.'
          : status
            ? 'Czekamy na potwierdzenie z Paymentic. Status zaktualizuje się po autoryzacji płatności.'
            : lookupFailed
              ? 'API Paymentic jest chwilowo niedostępne. Odśwież stronę, aby spróbować ponownie.'
              : validReference
                ? 'Sprawdzamy aktualny status Twojej transakcji w Paymentic.'
                : 'Ten adres nie zawiera poprawnego numeru referencyjnego płatności. Wróć do formularza, aby rozpocząć nową próbę.');

  return (
    <PageShell result>
      <span className="section-index">
        PŁATNOŚĆ / {awaitingCapture ? 'PAID · NIEPOBRANA' : (status ?? 'STATUS NIEZNANY')}
      </span>
      <h1>{title}</h1>
      <p>{description}</p>
      {transaction && <p className="transaction-reference">ID transakcji: {transaction.id}</p>}
      {waiting && <StatusAutoRefresh />}
      <div className="result-actions">
        <Link href="/" className="result-primary">
          Wróć do płatności <ArrowRight size={20} aria-hidden="true" />
        </Link>
        {validReference && (
          <a href={`/status?ref=${encodeURIComponent(ref)}`} className="result-refresh">
            <RefreshCw size={16} aria-hidden="true" /> Odśwież status
          </a>
        )}
      </div>
    </PageShell>
  );
}
