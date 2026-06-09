import type { ReactNode } from 'react';

type ModalProps = {
  children: ReactNode;
  onClose: () => void;
  title: string;
};

export function Modal({ children, onClose, title }: ModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-modal="true" className="modal" role="dialog">
        <div className="modal-header">
          <h2>{title}</h2>
          <button aria-label="Đóng popup" className="ghost icon-btn" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
