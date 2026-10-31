import type { ReactNode } from 'react';

type DialogProps = {
  open: boolean;
  title: string;
  closeLabel: string;
  children: ReactNode;
  onClose: () => void;
};

export function Dialog({ open, title, closeLabel, children, onClose }: DialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-text/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sahana-dialog-title"
        className="w-full max-w-md rounded-lg bg-surface p-4 shadow-lg"
      >
        <h2 id="sahana-dialog-title" className="text-base font-semibold text-text">
          {title}
        </h2>
        <div className="mt-3 text-sm text-text">{children}</div>
        <div className="mt-4 flex justify-end">
          <button type="button" className="min-h-11 px-3 text-sm text-primary" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
