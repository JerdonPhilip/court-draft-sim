import { motion, AnimatePresence } from 'framer-motion';
import { Dribbble, X } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useToastStore, type ToastKind } from '../../store/toastStore';

const KIND_STYLES: Record<ToastKind, { ring: string; icon: string; label: string }> = {
  success: {
    ring: 'border-broadcast-accent/40',
    icon: 'bg-broadcast-accent/15 text-broadcast-accent',
    label: 'Success',
  },
  error: {
    ring: 'border-broadcast-red/40',
    icon: 'bg-broadcast-red/15 text-broadcast-red',
    label: 'Error',
  },
  warning: {
    ring: 'border-broadcast-gold/40',
    icon: 'bg-broadcast-gold/15 text-broadcast-gold',
    label: 'Warning',
  },
  info: {
    ring: 'border-broadcast-blue/40',
    icon: 'bg-broadcast-blue/15 text-broadcast-blue',
    label: 'Notice',
  },
};

/** App-wide notification stack. Mount once at the root (see App.tsx). */
export function Toasts() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-3 z-[100] flex w-[min(92vw,380px)] -translate-x-1/2 flex-col gap-2 [top:max(0.75rem,env(safe-area-inset-top))] sm:left-auto sm:top-auto sm:bottom-4 sm:right-4 sm:w-[min(92vw,360px)] sm:translate-x-0 sm:[top:auto] sm:[padding-bottom:max(0rem,env(safe-area-inset-bottom))]"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map(toast => {
          const style = KIND_STYLES[toast.kind];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.96 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              role={toast.kind === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-2xl border bg-broadcast-dark/95 p-3.5 shadow-[0_12px_40px_rgb(0,0,0,0.5)] backdrop-blur-md',
                style.ring
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                  style.icon
                )}
                aria-hidden="true"
              >
                <Dribbble className="h-5 w-5" />
              </span>
              <span className="sr-only">{style.label}: </span>
              <div className="min-w-0 flex-1">
                {toast.title && (
                  <p className="font-display text-sm font-bold text-white">{toast.title}</p>
                )}
                <p className="break-words text-sm leading-snug text-broadcast-text-secondary">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md p-1 text-broadcast-text-muted transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent sm:min-h-0 sm:min-w-0 sm:block sm:p-1"
              >
                <X className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden="true" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
