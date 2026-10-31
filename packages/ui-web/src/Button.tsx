import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  loading?: boolean;
  children: ReactNode;
};

const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-primary text-primary-text hover:opacity-90',
  secondary: 'bg-surface text-text border border-border hover:bg-bg',
  quiet: 'bg-transparent text-primary hover:bg-bg',
  danger: 'bg-danger text-primary-text hover:opacity-90',
};

export function Button({
  variant = 'primary',
  loading = false,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold disabled:opacity-60 ${variantClass[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
