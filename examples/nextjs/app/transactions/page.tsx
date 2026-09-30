import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, CircleCheck, CircleAlert } from 'lucide-react';
import PageShell from '../ui/page-shell';
import type { TransactionStatus } from '@kamilklasa/paymentic-sdk-node';
import { getPaymentic, requireAdmin } from '../lib/paymentic';

export const dynamic = 'force-dynamic';

const statuses: TransactionStatus[] = ['CREATED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED'];

interface TransactionsPageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const query = await searchParams;
  const requestedPage = Number(query.page);
  const pageNumber = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const status = statuses.find((candidate) => candidate === query.status);
  await requireAdmin();
  const { client, pointId } = getPaymentic();
  const [result, ping] = await Promise.all([
    client.listTransactions(pointId, {
      ...(status ? { filter: { status } } : {}),
      page: { number: pageNumber, size: 10 },
    }),
    client.ping().catch(() => {
      console.error('Paymentic ping failed.');
      return null;
    }),
  ]);

  const pageUrl = (number: number) => `/transactions?page=${number}${status ? `&status=${status}` : ''}`;

  return (
    <PageShell wide>
      <div className="admin-heading">
        <div>
          <div className="eyebrow">PUNKT PŁATNOŚCI / {pointId}</div>
          <h1>
            Transakcje<span className="accent">.</span>
          </h1>
          <p>Przeglądaj płatności, sprawdzaj ich status i zarządzaj zwrotami.</p>
          <p className="admin-ping" role="status">
            {ping ? <CircleCheck size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}{' '}
            Paymentic: {ping ? 'połączono' : 'niedostępny'}
            {ping?.environment ? ` · ${ping.environment}` : ''}
            {ping?.version ? ` · API ${ping.version}` : ''}
          </p>
        </div>
      </div>

      <form className="filter-bar" method="get" action="/transactions">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={status ?? ''}>
          <option value="">Wszystkie statusy</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button type="submit">Filtruj</button>
      </form>

      <div className="table-scroll">
        <table className="transaction-table">
          <thead>
            <tr>
              <th scope="col">Transakcja</th>
              <th scope="col">Status</th>
              <th scope="col">Kwota</th>
              <th scope="col">Utworzono</th>
              <th scope="col" aria-label="Szczegóły" />
            </tr>
          </thead>
          <tbody>
            {result.data.map((transaction) => (
              <tr key={transaction.id}>
                <td>
                  <span className="transaction-title">{transaction.title}</span>
                  <small>{transaction.id}</small>
                </td>
                <td>
                  <span className={`status status-${transaction.status.toLowerCase()}`}>{transaction.status}</span>
                </td>
                <td>{transaction.amount} PLN</td>
                <td>{transaction.createdAt ?? '—'}</td>
                <td>
                  <Link href={`/transactions/${encodeURIComponent(transaction.id)}`}>
                    Szczegóły <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.data.length === 0 && <p className="empty-state">Brak transakcji na tej stronie.</p>}
      </div>

      <nav className="pagination" aria-label="Strony transakcji">
        <span>
          Strona {result.pagination.page} z {result.pagination.totalPages || 1} · Łącznie: {result.pagination.total}
        </span>
        <div>
          {pageNumber > 1 && (
            <Link href={pageUrl(pageNumber - 1)}>
              <ArrowLeft size={15} aria-hidden="true" /> Poprzednia
            </Link>
          )}
          {pageNumber < result.pagination.totalPages && (
            <Link href={pageUrl(pageNumber + 1)}>
              Następna <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
        </div>
      </nav>
    </PageShell>
  );
}
