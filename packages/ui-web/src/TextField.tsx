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
      <span className="font-medium text-text">{label}</span>
      <input
        {...props}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-11 rounded-md border border-border bg-surface px-3 text-base text-text"
      />
      {hint ? (
        <span id={`${fieldId}-hint`} className="text-xs text-muted">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${fieldId}-error`} className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </label>
  );
}
