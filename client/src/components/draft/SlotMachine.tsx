'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { FRANCHISES, DECADES } from '../../data/constants';
import { DraftPool } from '../../types/game';

interface SlotMachineProps {
  pool: DraftPool | null;
  isSpinning: boolean;
  onSpinComplete: (pool: DraftPool) => void;
  teamSkipUsed: boolean;
  decadeSkipUsed: boolean;
  onTeamSkip: () => void;
  onDecadeSkip: () => void;
  currentRound: number;
}

const REEL_ITEMS = 20;
const SPIN_DURATION = 2500;

export function SlotMachine({
  pool,
  isSpinning,
  onSpinComplete,
  teamSkipUsed,
  decadeSkipUsed,
  onTeamSkip,
  onDecadeSkip,
  currentRound,
}: SlotMachineProps) {
  const [franchiseReel, setFranchiseReel] = useState<string[]>([]);
  const [decadeReel, setDecadeReel] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [settledFranchise, setSettledFranchise] = useState<string>('');
  const [settledDecade, setSettledDecade] = useState<string>('');
  const franchiseRef = useRef<HTMLDivElement>(null);
  const decadeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSpinning) return;

    const franchises = FRANCHISES.map(f => f.id);
    const decades = DECADES.map(d => d.id);

    const franchiseItems = Array.from({ length: REEL_ITEMS }, () =>
      franchises[Math.floor(Math.random() * franchises.length)]
    );
    const decadeItems = Array.from({ length: REEL_ITEMS }, () =>
      decades[Math.floor(Math.random() * decades.length)]
    );

    setFranchiseReel(franchiseItems);
    setDecadeReel(decadeItems);
    setShowResult(false);

    const spinTimeout = setTimeout(() => {
      if (pool) {
        setSettledFranchise(pool.franchise);
        setSettledDecade(pool.decade);
        setShowResult(true);

        setTimeout(() => {
          onSpinComplete(pool);
        }, 500);
      }
    }, SPIN_DURATION);

    return () => clearTimeout(spinTimeout);
  }, [isSpinning, pool, onSpinComplete]);

  const franchiseInfo = FRANCHISES.find(f => f.id === settledFranchise);
  const decadeInfo = DECADES.find(d => d.id === settledDecade);

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-broadcast-card border border-broadcast-border rounded-full text-sm font-medium">
          <span className="text-broadcast-accent font-display">ROUND {currentRound} OF 5</span>
          <div className="w-px h-4 bg-broadcast-border mx-1" />
          <span className="text-broadcast-text-secondary">SPIN FOR PLAYERS</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:gap-6">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-t from-broadcast-dark via-transparent to-broadcast-dark pointer-events-none z-10" />
          <div
            ref={franchiseRef}
            className="slot-machine-reel bg-broadcast-card border border-broadcast-border rounded-xl overflow-hidden relative"
          >
            <AnimatePresence mode="wait">
              {isSpinning ? (
                <div
                  key="spinning"
                  className="flex flex-col"
                  style={{
                    transform: `translateY(-${(REEL_ITEMS - 1) * 120}px)`,
                    transition: `transform ${SPIN_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
                  }}
                >
                  {franchiseReel.map((id, i) => {
                    const info = FRANCHISES.find(f => f.id === id);
                    return (
                      <div
                        key={i}
                        className="slot-machine-item flex items-center justify-center px-4"
                        style={{ height: '120px' }}
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
                  key="settled"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="slot-machine-item settling flex items-center justify-center px-4 h-[120px]"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div
                      className="w-16 h-16 rounded-xl flex items-center justify-center font-bold text-white shadow-glow-accent"
                      style={{ backgroundColor: franchiseInfo?.color }}
                    >
                      {franchiseInfo?.abbreviation}
                    </div>
                    <span className="font-display text-xl font-bold">{franchiseInfo?.name}</span>
                    <Sparkles className="text-broadcast-gold animate-pulse" size={20} />
                  </div>
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
            ref={decadeRef}
            className="slot-machine-reel bg-broadcast-card border border-broadcast-border rounded-xl overflow-hidden relative"
          >
            <AnimatePresence mode="wait">
              {isSpinning ? (
                <div
                  key="spinning"
                  className="flex flex-col"
                  style={{
                    transform: `translateY(-${(REEL_ITEMS - 1) * 120}px)`,
                    transition: `transform ${SPIN_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
                  }}
                >
                  {decadeReel.map((id, i) => {
                    const info = DECADES.find(d => d.id === id);
                    return (
                      <div
                        key={i}
                        className="slot-machine-item flex items-center justify-center px-4"
                        style={{ height: '120px' }}
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
                  key="settled"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="slot-machine-item settling flex items-center justify-center px-4 h-[120px]"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-16 h-16 rounded-xl bg-broadcast-gold/20 flex items-center justify-center font-bold text-broadcast-gold border border-broadcast-gold/30 shadow-glow-gold">
                      {decadeInfo?.label}
                    </div>
                    <span className="font-display text-xl font-bold">{decadeInfo?.label}</span>
                    <span className="text-broadcast-text-secondary text-sm">{decadeInfo?.era}</span>
                    <Sparkles className="text-broadcast-gold animate-pulse" size={20} />
                  </div>
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
          onClick={onTeamSkip}
          disabled={teamSkipUsed || isSpinning}
          className={cn(
            'btn px-4 py-2 gap-2',
            teamSkipUsed ? 'btn-danger opacity-50 cursor-not-allowed' : 'btn-secondary'
          )}
        >
          <ChevronDown className="w-4 h-4" />
          <span>TEAM SKIP</span>
          {teamSkipUsed && <span className="badge badge-accent">USED</span>}
        </button>

        <button
          onClick={onDecadeSkip}
          disabled={decadeSkipUsed || isSpinning}
          className={cn(
            'btn px-4 py-2 gap-2',
            decadeSkipUsed ? 'btn-danger opacity-50 cursor-not-allowed' : 'btn-secondary'
          )}
        >
          <ChevronUp className="w-4 h-4" />
          <span>DECADE SKIP</span>
          {decadeSkipUsed && <span className="badge badge-gold">USED</span>}
        </button>
      </div>

      {isSpinning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 flex items-center justify-center z-50 bg-broadcast-dark/80 backdrop-blur-sm"
        >
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-broadcast-accent animate-spin mx-auto mb-4" />
            <p className="font-display text-2xl font-bold gradient-text">SPINNING...</p>
            <p className="text-broadcast-text-secondary mt-2">Finding your draft pool</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}