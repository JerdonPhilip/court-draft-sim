import { useEffect, useState } from 'react';

/**
 * True while the viewport is phone-sized.
 * Matches Tailwind `sm` (640px): only phones get the drafted-player
 * bottom-sheet modal. Tablets and desktop keep the inline expand —
 * no modal duplication.
 */
export function useIsSmallScreen(breakpointPx = 640): boolean {
  const get = () =>
    typeof window !== 'undefined' && typeof window.matchMedia !== 'undefined'
      ? window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches
      : false;

  const [isSmall, setIsSmall] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const onChange = () => setIsSmall(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [breakpointPx]);

  return isSmall;
}
