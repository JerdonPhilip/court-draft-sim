import { useEffect } from 'react';

/**
 * Locks background page scroll while mounted (e.g. open modals).
 * Restores the previous overflow on unmount; safe to stack since each
 * instance restores exactly what it replaced.
 */
export function useLockBodyScroll(active = true): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
