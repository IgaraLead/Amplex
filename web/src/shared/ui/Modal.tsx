import type { ReactNode } from 'react';

import { Dialog, DialogContent } from '@/components/ui/dialog';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, children, className }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className={className}>{children}</DialogContent>
    </Dialog>
  );
}
