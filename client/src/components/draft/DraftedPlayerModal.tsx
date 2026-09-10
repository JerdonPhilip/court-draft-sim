import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ArrowLeftRight, ChevronDown, X } from 'lucide-react';
import {
  bestTextOn,
  calculateTeamStrength,
  cn,
  formatHeight,
  formatTeamName,
  getPositionColor,
  getWinProjection,
  splitPlayerName,
} from '../../utils/helpers';
import { useIsSmallScreen } from '../../utils/useIsSmallScreen';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { canPlayPosition, getPlayerPositions } from '../../types/game';
import type { LineupSlot } from '../../types/game';
import { buildPlayerDossier } from '@server/services/dossier.js';

interface DraftedPlayerModalProps {
  slotIndex: number;
  slot: LineupSlot;
  slots: LineupSlot[];
  sixthManAuto: boolean;
  optionAuto: boolean;
  onSetSixthMan: (index: number) => void;
  onSetOption: (index: number, rank: 1 | 2 | 3 | null) => void;
  onSwapPlayers: (indexA: number, indexB: number) => void;
  onClose: () => void;
}

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] py-1 text-center">
      <div className="font-mono text-sm font-bold" style={{ color }}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-broadcast-text-muted">{label}</div>
    </div>
  );
}

/**
 * Drafted-player bottom sheet (phone-only by default; desktop opens it via an
 * explicit Details button). Reuses the inline expand content so phones don't
 * push the lineup list down — no duplication with desktop inline expand.
 * Bottom sheet on phones, centered dialog on sm+.
 */
export function DraftedPlayerModal({
  slotIndex,
  slot,
  slots,
  sixthManAuto,
  optionAuto,
  onSetSixthMan,
  onSetOption,
  onSwapPlayers,
  onClose,
}: DraftedPlayerModalProps) {
  // Defense in depth: this sheet is phone-only. Even if a stale caller ever
  // renders it on desktop, it refuses to paint (parent also guards).
  const isSmallScreen = useIsSmallScreen();
  useLockBodyScroll(isSmallScreen);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [showDossier, setShowDossier] = useState(false);
  const [swapArmed, setSwapArmed] = useState(false);

  const p = slot.player;
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches) {
      closeRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { sixthManId, options, teamNow, projNow, teamWithout, projWithout } = useMemo(() => {
    const filled = slots.map(s => s.player).filter((x): x is NonNullable<typeof x> => !!x);
    const sixth = slots.find(s => s.isSixthMan && s.player)?.player?.id ?? null;
    const rankOf = (r: 1 | 2 | 3) => slots.find(s => s.optionRank === r && s.player)?.player?.id ?? null;
    const opts = { first: rankOf(1), second: rankOf(2), third: rankOf(3) };
    const now = calculateTeamStrength(filled, sixth, opts);
    const withoutPlayers = filled.filter(x => x.id !== p?.id);
    const withoutSixth = sixth === p?.id ? null : sixth;
    const withoutOpts = {
      first: opts.first === p?.id ? null : opts.first,
      second: opts.second === p?.id ? null : opts.second,
      third: opts.third === p?.id ? null : opts.third,
    };
    const wo = withoutPlayers.length > 0 ? calculateTeamStrength(withoutPlayers, withoutSixth, withoutOpts) : 0;
    return {
      sixthManId: sixth,
      options: opts,
      teamNow: now,
      projNow: getWinProjection(now),
      teamWithout: wo,
      projWithout: withoutPlayers.length > 0 ? getWinProjection(wo) : 0,
    };
  }, [slots, p?.id]);

  void sixthManId;
  void options;

  const dossier = useMemo(() => {
    if (!p || !showDossier) return null;
    try {
      const HEIGHT_BASELINE: Record<string, number> = { PG: 74, SG: 77, SF: 79, PF: 81, C: 83 };
      return buildPlayerDossier({
        ...p,
        heightIn: typeof p.heightIn === 'number' && Number.isFinite(p.heightIn) ? p.heightIn : (HEIGHT_BASELINE[p.position] ?? 79),
      });
    } catch {
      return null;
    }
  }, [p, showDossier]);

  const swapTargets = useMemo(() => {
    if (!p) return [];
    return slots
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => i !== slotIndex && s.player && canPlayPosition(p, s.position) && canPlayPosition(s.player, slot.position));
  }, [slots, p, slotIndex, slot.position]);

  if (!p || typeof document === 'undefined' || !isSmallScreen) return null;

  const { first, last } = splitPlayerName(p.name);
  const plays = getPlayerPositions(p).join(' / ');
  const posColor = getPositionColor(p.position);
  const optLabel = slot.optionRank === 1 ? '1ST' : slot.optionRank === 2 ? '2ND' : slot.optionRank === 3 ? '3RD' : null;
  const strDelta = teamNow - teamWithout;
  const projDelta = projNow - projWithout;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${p.name} — lineup details`}
    >
      <motion.button
        type="button"
        aria-label="Close player details"
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ring-1 ring-white/25"
            style={{ backgroundColor: posColor, color: bestTextOn(posColor) }}
            aria-hidden="true"
            title={`Plays ${plays}`}
          >
            {slot.position}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-broadcast-text-secondary">
              {first} • {slot.role === 'bench' ? 'Bench' : 'Starter'} {slot.position}
            </p>
            <p className="truncate font-display text-xl font-bold leading-tight text-white" title={p.name}>
              {last || first}
            </p>
            <p className="truncate text-xs text-broadcast-text-secondary">
              {plays} • {formatHeight(p.heightIn, p.position)} • {formatTeamName(p.team)} • {p.decade}
            </p>
          </div>
          <span className="shrink-0 font-display text-3xl font-bold leading-none text-broadcast-accent" title={`Overall ${p.overall}`}>
            {p.overall}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close player details"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-broadcast-text-muted transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4 [-webkit-overflow-scrolling:touch]">
          <div className="flex flex-wrap items-center gap-1.5">
            {slot.isSixthMan && (
              <span className="rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1.5 py-px text-[10px] font-bold text-broadcast-gold">
                6TH{sixthManAuto ? '*' : ''}
              </span>
            )}
            {optLabel && (
              <span className="rounded-full border border-broadcast-purple/50 bg-broadcast-purple/15 px-1.5 py-px text-[10px] font-bold text-broadcast-purple">
                {optLabel}{optionAuto ? '*' : ''}
              </span>
            )}
            <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-px text-[10px] font-bold text-broadcast-text-secondary">
              {p.archetype}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            <StatMini label="PTS" value={p.stats.pts} color="text-broadcast-accent" />
            <StatMini label="REB" value={p.stats.reb} color="text-broadcast-gold" />
            <StatMini label="AST" value={p.stats.ast} color="#007aff" />
            <StatMini label="STL" value={p.stats.stl} color="#34c759" />
            <StatMini label="BLK" value={p.stats.blk} color="#af52de" />
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5" aria-live="polite">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-broadcast-text-muted">Impact preview</p>
            <p className="mt-1 text-sm text-broadcast-text-secondary">
              Team now <span className="font-bold text-broadcast-accent">{teamNow} STR</span>
              <span aria-hidden="true"> • </span>
              <span className="font-bold text-broadcast-gold">{projNow}-{82 - projNow} PROJ</span>
            </p>
            <p className="mt-0.5 text-xs text-broadcast-text-muted">
              Without {splitPlayerName(p.name).last || p.name}: {teamWithout} STR • {projWithout}-{82 - projWithout} PROJ
              <span aria-hidden="true"> • </span>
              <span className={strDelta >= 0 ? 'font-bold text-broadcast-accent' : 'font-bold text-broadcast-red'}>
                {strDelta >= 0 ? '+' : ''}{strDelta} STR ({projDelta >= 0 ? '+' : ''}{projDelta} W)
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {slot.role === 'bench' && (
              <button
                type="button"
                onClick={() => onSetSixthMan(slotIndex)}
                disabled={slot.isSixthMan}
                aria-pressed={!!slot.isSixthMan}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-[11px] font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-gold',
                  slot.isSixthMan
                    ? 'border-broadcast-gold/60 bg-broadcast-gold/15 text-broadcast-gold'
                    : 'border-white/10 bg-white/5 text-broadcast-text-secondary hover:border-broadcast-gold/50 hover:text-broadcast-gold'
                )}
              >
                {slot.isSixthMan ? '★ 6TH' : 'SET 6TH'}
              </button>
            )}
            <div className="flex items-center gap-1.5" role="group" aria-label={`Offensive option for ${p.name}`}>
              {([1, 2, 3] as const).map(rank => (
                <button
                  key={rank}
                  type="button"
                  onClick={() => onSetOption(slotIndex, slot.optionRank === rank ? null : rank)}
                  aria-pressed={slot.optionRank === rank}
                  className={cn(
                    'h-8 w-8 rounded-lg border text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-purple',
                    slot.optionRank === rank
                      ? 'border-broadcast-purple/60 bg-broadcast-purple/20 text-broadcast-purple'
                      : 'border-white/10 bg-white/5 text-broadcast-text-secondary hover:border-broadcast-purple/50 hover:text-broadcast-purple'
                  )}
                >
                  {rank}
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setSwapArmed(v => !v)}
              aria-expanded={swapArmed}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm font-bold text-white hover:border-broadcast-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent"
            >
              <span className="inline-flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-broadcast-accent" aria-hidden="true" />
                Swap with teammate ({swapTargets.length})
              </span>
              <ChevronDown className={cn('h-4 w-4 text-broadcast-text-muted transition-transform', swapArmed && 'rotate-180')} aria-hidden="true" />
            </button>
            {swapArmed && (
              <div className="mt-2 space-y-1.5">
                {swapTargets.length === 0 && (
                  <p className="text-xs text-broadcast-text-muted">No compatible swap — positions must fit both slots.</p>
                )}
                {swapTargets.map(({ s, i }) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { onSwapPlayers(slotIndex, i); onClose(); }}
                    className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white hover:border-broadcast-gold/60 hover:bg-broadcast-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-gold"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ring-1 ring-white/25"
                      style={{ backgroundColor: getPositionColor(s.position), color: bestTextOn(getPositionColor(s.position)) }}
                      aria-hidden="true">
                      {s.position}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.player?.name}</span>
                    <span className="shrink-0 font-display font-bold text-broadcast-accent">{s.player?.overall}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowDossier(v => !v)}
              aria-expanded={showDossier}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm font-bold text-white hover:border-broadcast-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent"
            >
              2K dossier (attributes + era)
              <ChevronDown className={cn('h-4 w-4 text-broadcast-text-muted transition-transform', showDossier && 'rotate-180')} aria-hidden="true" />
            </button>
            {showDossier && (
              <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                {!dossier && <p className="text-xs text-broadcast-text-muted">Dossier unavailable for this player.</p>}
                {dossier && (
                  <>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ['3PT', dossier.card.attributes.threePointShot],
                          ['MID', dossier.card.attributes.midRangeShot],
                          ['LAYUP', dossier.card.attributes.drivingLayup],
                          ['PER D', dossier.card.attributes.perimeterDefense],
                          ['INT D', dossier.card.attributes.interiorDefense],
                          ['REB', Math.round(((dossier.card.attributes.offensiveRebound ?? 0) + (dossier.card.attributes.defensiveRebound ?? 0)) / 2)],
                          ['IQ', dossier.card.attributes.shotIq],
                          ['MOTOR', dossier.card.attributes.stamina],
                        ] as Array<[string, number | undefined]>
                      ).map(([label, v]) => (
                        <div key={label} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-broadcast-text-muted">{label}</span>
                          <span className="font-mono text-sm font-bold text-white">{typeof v === 'number' ? Math.round(v) : '—'}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-broadcast-text-muted">{dossier.engineTraits.appliedEraModifiers.notes}</p>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-ghost min-h-[48px] w-full"
          >
            Close
          </button>
          <div aria-hidden="true" className="h-[env(safe-area-inset-bottom)]" />
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
