import { useToast } from './useToast';

const toastStyles: Record<string, string> = {
  success: 'bg-success/15 border border-success/40 text-success',
  error: 'bg-error/15 border border-error/40 text-error',
  info: 'bg-primary/15 border border-primary/40 text-primary',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();
  if (!toasts.length) return null;
  return (
    <div className="fixed top-14 right-4 z-[150] flex flex-col gap-2 max-w-[380px]">
      {toasts.map(t => {
        const cls = toastStyles[t.type] || toastStyles.info;
        return (
          <div
            key={t.id}
            onClick={() => removeToast(t.id)}
            className={`${cls} px-4 py-3 rounded-xl cursor-pointer text-sm font-medium shadow-lg`}
          >
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
