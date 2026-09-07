import { useEffect, useRef, useState } from 'react';
import { Dices, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { FRANCHISES, DECADES } from '../../data/constants';
import type { DraftPool } from '../../types/game';

interface SlotMachineProps {
  pool: DraftPool | null;
  isSpinning: boolean;
  onSpinComplete: (pool: DraftPool) => void;
  teamSkipUsed: boolean;
  decadeSkipUsed: boolean;
  onTeamSkip: () => void;
  onDecadeSkip: () => void;
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
  teamSkipUsed,
  decadeSkipUsed,
  onTeamSkip,
  onDecadeSkip,
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
  const decadeInfo = pool ? DECADES.find(d => d.id === pool.decade) : undefined;

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-broadcast-card/90 px-3 py-3 shadow-[0_10px_36px_rgb(0,0,0,0.38)] backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="shrink-0 whitespace-nowrap rounded-full border border-broadcast-accent/30 bg-broadcast-accent/10 px-3 py-1 font-display text-xs font-bold text-broadcast-accent">
          {Math.min(currentRound, maxRounds)}/{maxRounds}
        </span>

        <div
          className="h-12 min-w-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/20 sm:basis-40"
          aria-live="polite"
          aria-label={franchiseInfo ? `Franchise: ${franchiseInfo.name}` : 'Franchise not yet revealed'}
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
                  <div key={i} className="flex h-12 shrink-0 items-center justify-center px-2">
                    <span className="truncate font-display text-sm font-semibold text-broadcast-text-secondary">{info?.abbreviation}</span>
                  </div>
                );
              })}
            </div>
          ) : franchiseInfo ? (
            <div className="flex h-12 items-center gap-2.5 px-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white ring-1 ring-white/25"
                style={{ backgroundColor: franchiseInfo.color }}
                aria-hidden="true"
              >
                {franchiseInfo.abbreviation}
              </span>
              <span className="truncate font-display text-sm font-bold text-white">{franchiseInfo.name}</span>
            </div>
          ) : (
            <div className="flex h-12 items-center justify-center px-3 text-sm text-broadcast-text-muted">Franchise ?</div>
          )}
        </div>

        <span className="hidden shrink-0 text-broadcast-text-muted sm:inline" aria-hidden="true">×</span>

        <div
          className="h-12 min-w-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/20 sm:basis-32"
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
                  <div key={i} className="flex h-12 shrink-0 items-center justify-center px-2">
                    <span className="truncate font-display text-sm font-semibold text-broadcast-text-secondary">{info?.label}</span>
                  </div>
                );
              })}
            </div>
          ) : decadeInfo ? (
            <div className="flex h-12 items-center gap-2.5 px-3">
              <span className="flex h-8 shrink-0 items-center justify-center rounded-lg border border-broadcast-gold/30 bg-broadcast-gold/15 px-2 text-xs font-bold text-broadcast-gold" aria-hidden="true">
                {decadeInfo.label}
              </span>
              <span className="truncate text-xs text-broadcast-text-secondary">{decadeInfo.era}</span>
            </div>
          ) : (
            <div className="flex h-12 items-center justify-center px-3 text-sm text-broadcast-text-muted">Decade ?</div>
          )}
        </div>

        {showResult && pool && (
          <span className="hidden shrink-0 whitespace-nowrap text-xs font-medium text-broadcast-text-muted md:inline" aria-live="polite">
            {pool.players.length} players
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={onSpin}
            disabled={isSpinning}
            className="btn-primary gap-1.5 px-4 py-2 text-sm"
          >
            {isSpinning ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Dices className="h-4 w-4" aria-hidden="true" />
            )}
            <span aria-hidden="true">{isSpinning ? '…' : 'SPIN'}</span>
            <span className="sr-only">{isSpinning ? 'Spinning for a draft pool' : 'Spin for a draft pool'}</span>
          </button>
          <button
            onClick={onTeamSkip}
            disabled={teamSkipUsed || isSpinning || !pool}
            className={cn(
              'rounded-lg border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent',
              teamSkipUsed
                ? 'cursor-not-allowed border-broadcast-red/30 bg-broadcast-red/10 text-broadcast-red opacity-60'
                : 'border-broadcast-border bg-broadcast-card text-broadcast-text-secondary hover:border-broadcast-accent/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'
            )}
            title={teamSkipUsed ? 'Team skip used' : 'Skip this franchise'}
            aria-label={teamSkipUsed ? 'Team skip used' : 'Skip this franchise'}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={onDecadeSkip}
            disabled={decadeSkipUsed || isSpinning || !pool}
            className={cn(
              'rounded-lg border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent',
              decadeSkipUsed
                ? 'cursor-not-allowed border-broadcast-red/30 bg-broadcast-red/10 text-broadcast-red opacity-60'
                : 'border-broadcast-border bg-broadcast-card text-broadcast-text-secondary hover:border-broadcast-accent/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'
            )}
            title={decadeSkipUsed ? 'Decade skip used' : 'Skip this decade'}
            aria-label={decadeSkipUsed ? 'Decade skip used' : 'Skip this decade'}
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <span className="sr-only" role="status">
        {isSpinning ? 'Spinning for a draft pool' : showResult && pool ? `Draft pool: ${franchiseInfo?.name}, ${decadeInfo?.label}` : ''}
      </span>
    </div>
  );
}
