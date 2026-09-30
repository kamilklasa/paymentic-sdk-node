'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

export default function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? 'Wysyłanie…' : children}
    </button>
  );
}
