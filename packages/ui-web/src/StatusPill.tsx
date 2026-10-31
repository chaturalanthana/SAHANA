type StatusPillProps = {
  label: string;
  tone?: 'info' | 'warning' | 'success' | 'danger';
};

const toneClass: Record<NonNullable<StatusPillProps['tone']>, string> = {
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
};

export function StatusPill({ label, tone = 'info' }: StatusPillProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${toneClass[tone]}`}>
      {label}
    </span>
  );
}
