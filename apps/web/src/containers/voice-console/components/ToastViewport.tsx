interface ToastItem {
  id: string;
  tone: 'success' | 'error' | 'info';
  title: string;
  detail: string;
}

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (toastId: string) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article key={toast.id} className={`toast-card ${toast.tone}`}>
          <div className="toast-copy">
            <strong>{toast.title}</strong>
            <p>{toast.detail}</p>
          </div>
          <button
            className="toast-dismiss"
            onClick={() => onDismiss(toast.id)}
            type="button"
            aria-label={`Dismiss ${toast.title}`}
          >
            ×
          </button>
        </article>
      ))}
    </div>
  );
}
