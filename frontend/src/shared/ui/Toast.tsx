import { create } from "zustand";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: Toast["type"]) => void;
  removeToast: (id: number) => void;
}

let nextId = 1;

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = "info") => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

const colors: Record<string, { bg: string; border: string; text: string }> = {
  success: { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.4)", text: "#22c55e" },
  error: { bg: "rgba(255,51,51,0.15)", border: "rgba(255,51,51,0.4)", text: "#ff3333" },
  info: { bg: "rgba(0,112,255,0.15)", border: "rgba(0,112,255,0.4)", text: "#0070FF" },
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", top: "3.5rem", right: "1rem", zIndex: 150, display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 380 }}>
      {toasts.map((t) => {
        const c = colors[t.type] || colors.info;
        return (
          <div key={t.id} onClick={() => removeToast(t.id)} style={{
            padding: "0.75rem 1rem", borderRadius: "12px", cursor: "pointer",
            background: c.bg, border: `1px solid ${c.border}`, color: c.text,
            fontSize: "0.875rem", fontWeight: 500,
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            animation: "fadeIn 0.2s ease",
          }}>
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
