import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
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
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-broadcast-card border border-broadcast-border rounded-full text-sm font-medium">
          <span className="text-broadcast-accent font-display">ROUND {Math.min(currentRound, maxRounds)} OF {maxRounds}</span>
          <div className="w-px h-4 bg-broadcast-border mx-1" />
          <span className="text-broadcast-text-secondary">SPIN FOR PLAYERS</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:gap-6">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-t from-broadcast-dark via-transparent to-broadcast-dark pointer-events-none z-10" />
          <div
            className="slot-machine-reel bg-broadcast-card border border-broadcast-border rounded-xl overflow-hidden relative"
          >
            <AnimatePresence mode="wait">
              {isSpinning ? (
                <div
                  key="spinning-f"
                  className="flex flex-col animate-slot-spin"
                  style={{ animationDuration: `${SPIN_DURATION}ms` } as React.CSSProperties}
                >
                  {franchiseReel.map((id, i) => {
                    const info = FRANCHISES.find(f => f.id === id);
                    return (
                      <div
                        key={i}
                        className="slot-machine-item flex items-center justify-center px-4"
                        style={{ height: '120px' }}
                        aria-hidden={i !== franchiseReel.length - 1}
                      >
                        <div className="flex items-center gap-3 w-full">
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white"
                            style={{ backgroundColor: info?.color }}
                          >
                            {info?.abbreviation}
                          </div>
                          <span className="font-display text-lg font-semibold">{info?.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <motion.div
                  key="settled-f"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="slot-machine-item settling flex items-center justify-center px-4 h-[120px]"
                  aria-live="polite"
                >
                  {franchiseInfo ? (
                    <div className="flex items-center gap-3 w-full">
                      <div
                        className="w-16 h-16 rounded-xl flex items-center justify-center font-bold text-white shadow-glow-accent"
                        style={{ backgroundColor: franchiseInfo.color }}
                      >
                        {franchiseInfo.abbreviation}
                      </div>
                      <span className="font-display text-xl font-bold">{franchiseInfo.name}</span>
                      <Sparkles className="text-broadcast-gold animate-pulse" size={20} aria-hidden="true" />
                    </div>
                  ) : (
                    <div className="text-broadcast-text-muted">Press SPIN to reveal a franchise</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-broadcast-dark to-transparent pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-broadcast-dark to-transparent pointer-events-none" />
        </div>

        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-t from-broadcast-dark via-transparent to-broadcast-dark pointer-events-none z-10" />
          <div
            className="slot-machine-reel bg-broadcast-card border border-broadcast-border rounded-xl overflow-hidden relative"
          >
            <AnimatePresence mode="wait">
              {isSpinning ? (
                <div
                  key="spinning-d"
                  className="flex flex-col animate-slot-spin"
                  style={{ animationDuration: `${SPIN_DURATION}ms` } as React.CSSProperties}
                >
                  {decadeReel.map((id, i) => {
                    const info = DECADES.find(d => d.id === id);
                    return (
                      <div
                        key={i}
                        className="slot-machine-item flex items-center justify-center px-4"
                        style={{ height: '120px' }}
                        aria-hidden={i !== decadeReel.length - 1}
                      >
                        <div className="flex items-center gap-3 w-full">
                          <div className="w-12 h-12 rounded-xl bg-broadcast-accent/20 flex items-center justify-center font-bold text-broadcast-accent border border-broadcast-accent/30">
                            {info?.label}
                          </div>
                          <span className="font-display text-lg font-semibold">{info?.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <motion.div
                  key="settled-d"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="slot-machine-item settling flex items-center justify-center px-4 h-[120px]"
                  aria-live="polite"
                >
                  {decadeInfo ? (
                    <div className="flex items-center gap-3 w-full">
                      <div className="w-16 h-16 rounded-xl bg-broadcast-gold/20 flex items-center justify-center font-bold text-broadcast-gold border border-broadcast-gold/30 shadow-glow-gold">
                        {decadeInfo.label}
                      </div>
                      <span className="font-display text-xl font-bold">{decadeInfo.label}</span>
                      <span className="text-broadcast-text-secondary text-sm">{decadeInfo.era}</span>
                      <Sparkles className="text-broadcast-gold animate-pulse" size={20} aria-hidden="true" />
                    </div>
                  ) : (
                    <div className="text-broadcast-text-muted">Press SPIN to reveal a decade</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-broadcast-dark to-transparent pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-broadcast-dark to-transparent pointer-events-none" />
        </div>
      </div>

      {showResult && pool && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-6 p-4 bg-broadcast-card border border-broadcast-accent/30 rounded-xl text-center animate-in"
        >
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <span className="text-broadcast-text-secondary">DRAFT POOL:</span>
            <span className="px-3 py-1 bg-broadcast-accent/20 text-broadcast-accent rounded-lg font-medium border border-broadcast-accent/30">
              {FRANCHISES.find(f => f.id === pool.franchise)?.name}
            </span>
            <span className="px-3 py-1 bg-broadcast-gold/20 text-broadcast-gold rounded-lg font-medium border border-broadcast-gold/30">
              {DECADES.find(d => d.id === pool.decade)?.label}
            </span>
            <span className="px-3 py-1 bg-broadcast-text-muted/20 text-broadcast-text-muted rounded-lg font-medium">
              {pool.players.length} PLAYERS
            </span>
          </div>
        </motion.div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onSpin}
          disabled={isSpinning}
          className="btn-primary px-6 py-2 gap-2"
        >
          <Dices className="w-4 h-4" aria-hidden="true" />
          <span>{pool ? 'SPIN AGAIN' : 'SPIN'}</span>
        </button>
        <button
          onClick={onTeamSkip}
          disabled={teamSkipUsed || isSpinning || !pool}
          className={cn(
            'btn px-4 py-2 gap-2',
            teamSkipUsed ? 'btn-danger opacity-50 cursor-not-allowed' : 'btn-secondary'
          )}
          aria-label={teamSkipUsed ? 'Team skip used' : 'Skip this franchise'}
        >
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
          <span>TEAM SKIP</span>
          {teamSkipUsed && <span className="badge badge-accent">USED</span>}
        </button>

        <button
          onClick={onDecadeSkip}
          disabled={decadeSkipUsed || isSpinning || !pool}
          className={cn(
            'btn px-4 py-2 gap-2',
            decadeSkipUsed ? 'btn-danger opacity-50 cursor-not-allowed' : 'btn-secondary'
          )}
          aria-label={decadeSkipUsed ? 'Decade skip used' : 'Skip this decade'}
        >
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
          <span>DECADE SKIP</span>
          {decadeSkipUsed && <span className="badge badge-gold">USED</span>}
        </button>
      </div>

      {isSpinning && (
        <div
          className="mt-4 text-center text-broadcast-text-secondary"
          role="status"
          aria-live="polite"
        >
          <p className="font-display text-lg font-bold gradient-text">SPINNING...</p>
          <p className="text-sm mt-1">Finding your draft pool</p>
        </div>
      )}
    </div>
  );
}
