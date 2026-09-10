import { useEffect } from 'react';

let lockCount = 0;
let savedOverflow = '';

/**
 * Locks background page scroll while mounted (e.g. open modals).
 * Ref-counted so stacked modals unlock only when the last one closes.
 */
export function useLockBodyScroll(active = true): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow;
      }
    };
  }, [active]);
}
