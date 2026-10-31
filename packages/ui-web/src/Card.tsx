import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`sahana-card p-4 ${className}`}>{children}</section>;
}

export function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="sahana-card p-4">
      <p className="text-sm text-body">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-heading">{value || '—'}</p>
    </section>
  );
}
