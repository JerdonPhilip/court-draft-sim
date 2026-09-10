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

const MAX_VISIBLE = 2;

let seq = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleDismiss(id: string, ms: number) {
  const prev = timers.get(id);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    timers.delete(id);
    useToastStore.getState().dismiss(id);
  }, ms);
  timers.set(id, t);
}

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  push: (toast) => {
    // Collapse exact repeats so rapid clicks reset the timer instead of stacking.
    const visible = get().toasts;
    const last = visible[visible.length - 1];
    if (last && last.kind === toast.kind && last.message === toast.message && last.title === toast.title) {
      scheduleDismiss(last.id, toast.durationMs ?? DEFAULT_DURATION_MS[toast.kind]);
      return last.id;
    }
    const id = `toast-${Date.now().toString(36)}-${seq++}`;
    const next = [...visible.slice(-(MAX_VISIBLE - 1)), { ...toast, id }];
    // Clear timers for evicted toasts so they can't phantom-dismiss the new ones.
    const nextIds = new Set(next.map(t => t.id));
    for (const [tid, t] of timers) {
      if (!nextIds.has(tid)) {
        clearTimeout(t);
        timers.delete(tid);
      }
    }
    set({ toasts: next });
    scheduleDismiss(id, toast.durationMs ?? DEFAULT_DURATION_MS[toast.kind]);
    return id;
  },

  dismiss: (id) => {
    const t = timers.get(id);
    if (t) {
      clearTimeout(t);
      timers.delete(id);
    }
    set((prev) => ({ toasts: prev.toasts.filter(to => to.id !== id) }));
  },

  clear: () => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    set({ toasts: [] });
  },
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
