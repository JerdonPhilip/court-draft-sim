import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ChevronRight, X } from 'lucide-react';
import { cn, getPositionColor, bestTextOn, splitPlayerName } from '../../utils/helpers';
import { useIsSmallScreen } from '../../utils/useIsSmallScreen';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { canPlayPosition, getPlayerPositions } from '../../types/game';
import type { LineupSlot, Player } from '../../types/game';

interface DraftPickModalProps {
  player: Player;
  slots: LineupSlot[];
  onPick: (player: Player, slotIndex: number) => void;
  onClose: () => void;
}

/**
 * Pick confirmation sheet: tap a player, choose STARTER or BENCH slot inline.
 * Bottom sheet on phones, centered dialog on sm+. Portaled to document.body
 * so no ancestor stacking context or overflow clip can ever bury it.
 * Type scales fluidly with clamp() — no breakpoint jumps.
 */
export function DraftPickModal({ player, slots, onPick, onClose }: DraftPickModalProps) {
  // Phone-only sheet: desktop uses the inline slot panel instead.
  const isSmallScreen = useIsSmallScreen();
  useLockBodyScroll(isSmallScreen);
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  const fits = useMemo(
    () =>
      slots
        .map((slot, index) => ({ slot, index }))
        .filter(({ slot }) => !slot.player && canPlayPosition(player, slot.position)),
    [slots, player]
  );

  // Focus the first slot option for keyboard / screen-reader users.
  // Skipped on touch screens — programmatic focus makes mobile Safari jump.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches) {
      firstOptionRef.current?.focus();
    }
  }, []);

  // Escape dismisses without drafting.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const posColor = getPositionColor(player.position);
  const plays = getPlayerPositions(player).join(' / ');
  const starters = fits.filter(({ index }) => index < 5);
  const bench = fits.filter(({ index }) => index >= 5);
  const { first, last } = splitPlayerName(player.name);

  const renderOption = ({ slot, index }: { slot: LineupSlot; index: number }, i: number, groupOffset: number) => {
    const isFlex = slot.position !== player.position;
    const group = index < 5 ? 'Starter' : 'Bench';
    return (
      <button
        key={index}
        ref={i === 0 && groupOffset === 0 ? firstOptionRef : undefined}
        type="button"
        onClick={() => onPick(player, index)}
        aria-label={`Draft ${player.name} as ${group} ${slot.position}`}
        className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-broadcast-gold/60 hover:bg-broadcast-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-gold active:bg-broadcast-gold/15"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[clamp(0.65rem,3vw,0.75rem)] font-bold ring-1 ring-white/25"
          style={{ backgroundColor: getPositionColor(slot.position), color: bestTextOn(getPositionColor(slot.position)) }}
          aria-hidden="true"
        >
          {slot.position}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[clamp(0.9rem,4vw,1.05rem)] font-bold leading-snug text-white">
            {group} {slot.position}
          </span>
          <span className="block truncate text-[clamp(0.7rem,3.2vw,0.8rem)] text-broadcast-text-secondary">
            {isFlex ? `Flex fit — plays ${plays}` : `Primary ${player.position} slot`}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-broadcast-text-muted" aria-hidden="true" />
      </button>
    );
  };

  if (typeof document === 'undefined' || !isSmallScreen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Draft ${player.name} — choose starter or bench slot`}
    >
      <motion.button
        type="button"
        aria-label="Close pick dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      />
      <motion.div
        className={cn(
          'relative flex max-h-[85vh] w-full max-w-full flex-col overflow-hidden',
          'supports-[height:100dvh]:max-h-[85dvh]',
          'rounded-t-2xl border border-white/10 bg-broadcast-card shadow-[0_-12px_60px_rgb(0,0,0,0.6)]',
          'sm:max-w-md sm:rounded-2xl sm:shadow-[0_24px_80px_rgb(0,0,0,0.6)]'
        )}
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 48, opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[clamp(0.7rem,3.2vw,0.85rem)] font-bold ring-1 ring-white/25"
            style={{ backgroundColor: posColor, color: bestTextOn(posColor) }}
            aria-hidden="true"
          >
            {player.position}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[clamp(0.62rem,2.8vw,0.7rem)] font-semibold uppercase tracking-[0.16em] text-broadcast-text-secondary">
              {first}
            </p>
            <p className="truncate font-display text-[clamp(1.15rem,1rem+2.5vw,1.6rem)] font-bold leading-tight text-white">
              {last || first}
            </p>
            <p className="truncate text-[clamp(0.7rem,3.2vw,0.8rem)] text-broadcast-text-secondary">
              {plays} • {player.stats.pts} PTS • {player.stats.reb} REB • {player.stats.ast} AST
            </p>
          </div>
          <span
            className="shrink-0 font-display text-[clamp(1.5rem,7vw,1.9rem)] font-bold leading-none text-broadcast-accent"
            title={`Overall rating ${player.overall}`}
          >
            {player.overall}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel pick"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-broadcast-text-muted transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-4 [-webkit-overflow-scrolling:touch]">
          <p className="text-[clamp(0.65rem,3vw,0.72rem)] font-bold uppercase tracking-[0.18em] text-broadcast-text-muted">
            {fits.length > 0 ? `Pick a slot — ${fits.length} open` : 'No open slot fits this player'}
          </p>
          {starters.length > 0 && (
            <div className="space-y-2">
              <p className="text-[clamp(0.68rem,3.2vw,0.78rem)] font-bold uppercase tracking-[0.18em] text-broadcast-accent">Starters</p>
              {starters.map((f, i) => renderOption(f, i, 0))}
            </div>
          )}
          {bench.length > 0 && (
            <div className="space-y-2">
              <p className="text-[clamp(0.68rem,3.2vw,0.78rem)] font-bold uppercase tracking-[0.18em] text-broadcast-blue">Bench</p>
              {bench.map((f, i) => renderOption(f, i, starters.length))}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost min-h-[48px] w-full text-[clamp(0.85rem,3.8vw,0.95rem)]"
          >
            Cancel
          </button>
          <div aria-hidden="true" className="h-[env(safe-area-inset-bottom)]" />
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
