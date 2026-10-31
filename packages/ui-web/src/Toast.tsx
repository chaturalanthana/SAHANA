type ToastProps = {
  message: string | null;
};

export function Toast({ message }: ToastProps) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sahana-card fixed bottom-4 left-4 right-4 z-30 mx-auto max-w-sm px-4 py-3 text-sm text-heading"
    >
      {message}
    </div>
  );
}
