import { CheckCircle2, Info, XCircle, X } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useToast } from './useToast';

const toastMeta = {
  success: { variant: 'success' as const, icon: CheckCircle2 },
  error: { variant: 'destructive' as const, icon: XCircle },
  info: { variant: 'info' as const, icon: Info },
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();
  if (!toasts.length) return null;

  return (
    <div
      className="fixed right-4 top-16 z-[150] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map(toast => {
        const meta = toastMeta[toast.type] ?? toastMeta.info;
        const Icon = meta.icon;
        return (
          <Alert key={toast.id} variant={meta.variant} className="items-center pr-10 shadow-lg">
            <Icon className="size-4" />
            <AlertDescription className="text-current">{toast.message}</AlertDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-current hover:bg-current/10 hover:text-current"
              aria-label="Fechar notificação"
              onClick={() => removeToast(toast.id)}
            >
              <X className="size-3.5" />
            </Button>
          </Alert>
        );
      })}
    </div>
  );
}
