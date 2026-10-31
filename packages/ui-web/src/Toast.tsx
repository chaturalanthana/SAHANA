type ToastProps = {
  message: string | null;
};

export function Toast({ message }: ToastProps) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-30 mx-auto max-w-sm rounded-md bg-sidebar px-4 py-3 text-sm text-sidebar-text"
    >
      {message}
    </div>
  );
}
