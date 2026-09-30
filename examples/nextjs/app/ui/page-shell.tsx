import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

export default function PageShell({
  children,
  wide = false,
  result = false,
}: {
  children: ReactNode;
  wide?: boolean;
  result?: boolean;
}) {
  return (
    <div className={`container${wide ? ' container-wide' : ''}`}>
      <header className="app-header">
        <Link href="/" className="app-brand" aria-label="Paymentic, strona główna">
          <img src="/logo.svg" alt="" width="150" height="25" />
        </Link>
        <Link href={wide ? '/' : '/transactions'} className="app-back" prefetch={false}>
          {wide ? <ArrowLeft size={15} aria-hidden="true" /> : null}
          {wide ? 'Wróć do płatności' : 'Panel transakcji'}
          {!wide ? <ArrowUpRight size={15} aria-hidden="true" /> : null}
        </Link>
      </header>
      <main className={`wrapper${result ? ' payment-result' : ''}`}>{children}</main>
    </div>
  );
}
