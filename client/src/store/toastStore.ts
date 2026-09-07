import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  title?: string;
  durationMs?: number;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const DEFAULT_DURATION_MS: Record<ToastKind, number> = {
  success: 2600,
  info: 3200,
  warning: 4200,
  error: 4800,
};

const MAX_VISIBLE = 3;

let seq = 0;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  push: (toast) => {
    // Collapse exact repeats so rapid clicks don't stack identical toasts.
    const visible = get().toasts;
    const last = visible[visible.length - 1];
    if (last && last.kind === toast.kind && last.message === toast.message) {
      return last.id;
    }
    const id = `toast-${Date.now().toString(36)}-${seq++}`;
    set({ toasts: [...visible.slice(-(MAX_VISIBLE - 1)), { ...toast, id }] });
    setTimeout(() => get().dismiss(id), toast.durationMs ?? DEFAULT_DURATION_MS[toast.kind]);
    return id;
  },

  dismiss: (id) => set((prev) => ({ toasts: prev.toasts.filter(t => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}));

/** Centralized notifications — use these instead of inline banners. */
export const notify = {
  success: (message: string, title?: string) =>
    useToastStore.getState().push({ kind: 'success', message, title }),
  error: (message: string, title?: string) =>
    useToastStore.getState().push({ kind: 'error', message, title }),
  warning: (message: string, title?: string) =>
    useToastStore.getState().push({ kind: 'warning', message, title }),
  info: (message: string, title?: string) =>
    useToastStore.getState().push({ kind: 'info', message, title }),
};
