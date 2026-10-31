type StatusPillProps = {
  label: string;
  tone?: 'info' | 'warning' | 'success' | 'danger';
};

const toneClass: Record<NonNullable<StatusPillProps['tone']>, string> = {
  info: 'bg-info/15 text-info-ink',
  warning: 'bg-warning/20 text-warning-ink',
  success: 'bg-success/15 text-success-ink',
  danger: 'bg-danger/15 text-danger-ink',
};

export function StatusPill({ label, tone = 'info' }: StatusPillProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${toneClass[tone]}`}>
      {label}
    </span>
  );
}
