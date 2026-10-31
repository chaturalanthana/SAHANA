import type { InputHTMLAttributes } from 'react';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextField({ label, hint, error, id, ...props }: TextFieldProps) {
  const fieldId = id ?? props.name ?? label;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor={fieldId}>
      <span className="font-medium text-heading">{label}</span>
      <input
        {...props}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-11 rounded-md border border-border bg-surface px-3 text-base text-heading placeholder:text-muted"
      />
      {hint ? (
        <span id={`${fieldId}-hint`} className="text-xs text-body">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${fieldId}-error`} className="text-xs text-danger-ink">
          {error}
        </span>
      ) : null}
    </label>
  );
}
