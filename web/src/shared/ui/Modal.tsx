import type { ReactNode } from 'react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

/** Full-screen overlay + centered panel (Daisy-friendly). */
export function Modal({ open, onClose, children, className = '' }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 animate-in fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div className={`w-full ${className}`} onClick={e => e.stopPropagation()} role="presentation">
        {children}
      </div>
    </div>
  );
}
