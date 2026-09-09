import { useEffect, useRef, useState } from 'react';
import { Dices, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { FRANCHISES, DECADES } from '../../data/constants';
import type { DraftPool } from '../../types/game';

interface SlotMachineProps {
  pool: DraftPool | null;
  isSpinning: boolean;
  onSpinComplete: (pool: DraftPool) => void;
  franchiseRerollsLeft: number;
  decadeRerollsLeft: number;
  spinsLeft: number;
  onRerollFranchise: () => void;
  onRerollDecade: () => void;
  currentRound: number;
  maxRounds: number;
  onSpin: () => void;
}

const REEL_ITEMS = 20;
const SPIN_DURATION = 1800;

export function SlotMachine({
  pool,
  isSpinning,
  onSpinComplete,
  franchiseRerollsLeft,
  decadeRerollsLeft,
  spinsLeft,
  onRerollFranchise,
  onRerollDecade,
  currentRound,
  maxRounds,
  onSpin,
}: SlotMachineProps) {
  const [franchiseReel, setFranchiseReel] = useState<string[]>([]);
  const [decadeReel, setDecadeReel] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const onSpinCompleteRef = useRef(onSpinComplete);
  onSpinCompleteRef.current = onSpinComplete;
  const innerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Spin animation runs on isSpinning transitions; completion is driven by
  // pool data arriving, with a minimum display time so fast fetches still animate.
  useEffect(() => {
    if (!isSpinning) return;

    const franchises = FRANCHISES.map(f => f.id as string);
    const decades = DECADES.map(d => d.id as string);

    setFranchiseReel(Array.from({ length: REEL_ITEMS }, () => franchises[Math.floor(Math.random() * franchises.length)] as string));
    setDecadeReel(Array.from({ length: REEL_ITEMS }, () => decades[Math.floor(Math.random() * decades.length)] as string));
    setShowResult(false);

    return () => {
      if (innerTimer.current) clearTimeout(innerTimer.current);
    };
  }, [isSpinning]);

  useEffect(() => {
    if (isSpinning || !pool) return;
    // Pool arrived: brief settle delay, then reveal + notify (once per pool).
    setShowResult(false);
    innerTimer.current = setTimeout(() => {
      setShowResult(true);
      onSpinCompleteRef.current(pool);
    }, 400);
    return () => {
      if (innerTimer.current) clearTimeout(innerTimer.current);
    };
  }, [isSpinning, pool]);

  const franchiseInfo = pool ? FRANCHISES.find(f => f.id === pool.franchise) : undefined;
  const franchiseLabel = pool
    ? `${franchiseInfo?.abbreviation ?? pool.franchise}`
    : null;
  const franchiseName = pool ? franchiseInfo?.name ?? pool.franchise : null;
  const decadeInfo = pool ? DECADES.find(d => d.id === pool.decade) : undefined;

  return (
    <div className="w-full min-w-0 rounded-2xl border border-white/10 bg-broadcast-card/90 px-2.5 py-2.5 shadow-[0_10px_36px_rgb(0,0,0,0.38)] backdrop-blur-sm sm:px-3">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
        <span className="shrink-0 whitespace-nowrap rounded-full border border-broadcast-accent/30 bg-broadcast-accent/10 px-2.5 py-1 font-display text-xs font-bold text-broadcast-accent">
          {Math.min(currentRound, maxRounds)}/{maxRounds}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-broadcast-text-muted" aria-hidden="true">Team</span>
          <div
            className="h-11 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/20"
            aria-live="polite"
            aria-label={franchiseName ? `Franchise: ${franchiseName}` : 'Franchise not yet revealed'}
          >
            {isSpinning ? (
              <div
                key="spinning-f"
                className="flex flex-col animate-slot-spin"
                style={{ animationDuration: `${SPIN_DURATION}ms` } as React.CSSProperties}
                aria-hidden="true"
              >
                {franchiseReel.map((id, i) => {
                  const info = FRANCHISES.find(f => f.id === id);
                  return (
                    <div key={i} className="flex h-11 shrink-0 items-center justify-center px-2">
                      <span className="truncate font-display text-sm font-semibold text-broadcast-text-secondary">{info?.abbreviation}</span>
                    </div>
                  );
                })}
              </div>
            ) : franchiseInfo ? (
              <div className="flex h-11 items-center gap-2 px-2.5" title={franchiseInfo.name}>
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white ring-1 ring-white/25"
                  style={{ backgroundColor: franchiseInfo.color }}
                  aria-hidden="true"
                >
                  {franchiseInfo.abbreviation}
                </span>
                <span className="truncate font-display text-sm font-bold text-white">{franchiseInfo.name}</span>
              </div>
            ) : (
              <div className="flex h-11 items-center justify-center px-2 text-sm text-broadcast-text-muted">TEAM</div>
            )}
          </div>
          <RerollLink
            label="Reroll"
            ariaLabel="Reroll franchise"
            hint={pool ? `Keep ${decadeInfo?.label ?? pool.decade}, roll a new team` : 'Roll a new team, keep the decade'}
            rerollsLeft={franchiseRerollsLeft}
            disabled={isSpinning || !pool}
            onReroll={onRerollFranchise}
          />
        </div>

        <span className="hidden shrink-0 text-sm text-broadcast-text-muted sm:inline" aria-hidden="true">×</span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-broadcast-text-muted" aria-hidden="true">Era</span>
          <div
            className="h-11 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/20"
            aria-live="polite"
            aria-label={decadeInfo ? `Decade: ${decadeInfo.label}` : 'Decade not yet revealed'}
          >
            {isSpinning ? (
              <div
                key="spinning-d"
                className="flex flex-col animate-slot-spin"
                style={{ animationDuration: `${SPIN_DURATION}ms` } as React.CSSProperties}
                aria-hidden="true"
              >
                {decadeReel.map((id, i) => {
                  const info = DECADES.find(d => d.id === id);
                  return (
                    <div key={i} className="flex h-11 shrink-0 items-center justify-center px-2">
                      <span className="truncate font-display text-sm font-semibold text-broadcast-text-secondary">{info?.label}</span>
                    </div>
                  );
                })}
              </div>
            ) : decadeInfo ? (
              <div className="flex h-11 items-center gap-2 px-2.5" title={`${decadeInfo.label} (${decadeInfo.era})`}>
                <span className="flex h-7 shrink-0 items-center justify-center rounded-lg border border-broadcast-gold/30 bg-broadcast-gold/15 px-1.5 text-[11px] font-bold text-broadcast-gold" aria-hidden="true">
                  {decadeInfo.label}
                </span>
                <span className="truncate text-xs text-broadcast-text-secondary">{decadeInfo.era}</span>
              </div>
            ) : (
              <div className="flex h-11 items-center justify-center px-2 text-sm text-broadcast-text-muted">ERA</div>
            )}
          </div>
          <RerollLink
            label="Reroll"
            ariaLabel="Reroll decade"
            hint={pool ? `Keep ${franchiseLabel}, roll a new era` : 'Roll a new era, keep the team'}
            rerollsLeft={decadeRerollsLeft}
            disabled={isSpinning || !pool}
            onReroll={onRerollDecade}
          />
        </div>

        {showResult && pool && (
          <span className="hidden shrink-0 whitespace-nowrap text-xs font-medium text-broadcast-text-muted lg:inline" aria-live="polite">
            {pool.players.length} players
          </span>
        )}

        <button
          onClick={onSpin}
          disabled={isSpinning || (!!pool && spinsLeft <= 0)}
          title={spinsLeft > 0 ? `Redraw this pool (${spinsLeft} manual spins left)` : 'No manual spins left. Draft from this pool or use a reroll'}
          aria-label={spinsLeft > 0 ? `Spin for a new pool (${spinsLeft} left)` : 'No spins left'}
          className="btn-primary shrink-0 gap-1.5 px-3 py-2 text-sm sm:px-4"
        >
          {isSpinning ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Dices className="h-4 w-4" aria-hidden="true" />
          )}
          <span aria-hidden="true">{isSpinning ? '…' : `SPIN · ${spinsLeft}`}</span>
          <span className="sr-only">{isSpinning ? 'Spinning for a draft pool' : `Spin for a draft pool, ${spinsLeft} left`}</span>
        </button>
      </div>
      <span className="sr-only" role="status">
        {isSpinning ? 'Spinning for a draft pool' : showResult && pool ? `Draft pool: ${franchiseName}, ${decadeInfo?.label}` : ''}
      </span>
    </div>
  );
}

function RerollLink({ label, ariaLabel, hint, rerollsLeft, disabled, onReroll }: {
  label: string;
  ariaLabel: string;
  hint: string;
  rerollsLeft: number;
  disabled: boolean;
  onReroll: () => void;
}) {
  const exhausted = rerollsLeft <= 0;
  return (
    <button
      type="button"
      onClick={onReroll}
      disabled={exhausted || disabled}
      title={hint}
      aria-label={exhausted ? `${ariaLabel}, no rerolls left` : `${ariaLabel}: ${hint} (${rerollsLeft} left)`}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-md py-1 text-xs font-bold uppercase tracking-[0.14em] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent',
        exhausted
          ? 'cursor-default text-broadcast-text-muted'
          : 'text-broadcast-text-secondary hover:text-broadcast-accent disabled:cursor-not-allowed disabled:opacity-40'
      )}
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      {exhausted ? 'No rerolls left' : `${label} · ${rerollsLeft} left`}
    </button>
  );
}
