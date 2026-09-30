'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StatusAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 5_000);
    const stop = window.setTimeout(() => window.clearInterval(interval), 60_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
  }, [router]);

  return <p className="status-refresh-note">Status odświeża się automatycznie co 5 sekund przez minutę.</p>;
}
