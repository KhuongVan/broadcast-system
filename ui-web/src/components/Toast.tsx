import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type ToastType = 'error' | 'success';

type ToastInput = {
  message: string;
  type?: ToastType;
};

type ToastItem = Required<ToastInput> & {
  id: number;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const toastDurationMs = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: ToastInput) => {
    const message = toast.message.trim();
    if (!message) return;
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, type: toast.type || 'error' }]);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider.');
  return context;
}

function ToastViewport({ toasts, onClose }: { toasts: ToastItem[]; onClose: (id: number) => void }) {
  return (
    <div aria-live="polite" aria-relevant="additions removals" className="toast-viewport">
      {toasts.map((toast) => (
        <ToastMessage key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}

function ToastMessage({ toast, onClose }: { toast: ToastItem; onClose: (id: number) => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onClose(toast.id), toastDurationMs);
    return () => window.clearTimeout(timeout);
  }, [onClose, toast.id]);

  return (
    <div className={`toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      <div className="toast-icon">{toast.type === 'error' ? '!' : '✓'}</div>
      <div className="toast-message">{toast.message}</div>
      <button aria-label="Đóng thông báo" className="toast-close" onClick={() => onClose(toast.id)} type="button">
        ×
      </button>
    </div>
  );
}
