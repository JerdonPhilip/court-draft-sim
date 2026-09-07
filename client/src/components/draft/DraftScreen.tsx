'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, RotateCcw, Trophy, Zap } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { SlotMachine } from './SlotMachine';
import { PlayerPool } from './PlayerPool';
import { LineupBuilder } from './LineupBuilder';
import { cn } from '../../utils/helpers';
import { calculateTeamStrength, getWinProjection } from '../../utils/helpers';
import { Position } from '../../types/game';

export function DraftScreen() {
  const {
    draftState,
    spinDraftPool,
    useTeamSkip,
    useDecadeSkip,
    draftPlayer,
    removePlayerFromSlot,
    finalizeDraft,
    initializeDraft,
    setError,
  } = useGameStore();

  const { pool, lineup, currentRound, teamSkip, decadeSkip, draftedPlayers, isSpinning, spinResult } = draftState;

  const teamStrength = calculateTeamStrength(
    lineup.slots.map(s => s.player!).filter(Boolean) as any[]
  );
  const projectedWins = getWinProjection(teamStrength);

  const currentPosition = currentRound <= 5 ? POSITIONS[currentRound - 1] : null;

  const handleDraftPlayer = (player: any) => {
    if (currentPosition && player.position !== currentPosition) return;
    const slotIndex = currentRound - 1;
    draftPlayer(player, slotIndex);
  };

  const isLineupComplete = lineup.slots.every(s => s.player !== null);

  return (
    <div className="min-h-screen bg-broadcast-dark">
      <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-broadcast-dark/95 to-transparent pb-4">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.button
                onClick={initializeDraft}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-lg bg-broadcast-card border border-broadcast-border hover:border-broadcast-accent/50 transition-colors"
                aria-label="New draft"
              >
                <RotateCcw className="w-5 h-5 text-broadcast-text-secondary" />
              </motion.button>
              <div>
                <h1 className="font-display text-2xl font-bold gradient-text">COURT DRAFT SIM</h1>
                <p className="text-xs text-broadcast-text-secondary">ROUND {currentRound} OF 5 • BUILD YOUR DYNASTY</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1 px-3 py-1 bg-broadcast-card border border-broadcast-border rounded-lg">
                <Zap className="w-4 h-4 text-broadcast-accent" />
                <span className="text-sm font-mono font-bold text-broadcast-accent">{teamStrength}</span>
                <span className="text-xs text-broadcast-text-muted">STR</span>
              </div>
              <div className="flex items-center gap-1 px-3 py-1 bg-broadcast-card border border-broadcast-gold/30 rounded-lg">
                <Trophy className="w-4 h-4 text-broadcast-gold" />
                <span className="text-sm font-mono font-bold text-broadcast-gold">{projectedWins}-{82 - projectedWins}</span>
                <span className="text-xs text-broadcast-text-muted">PROJ</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 pb-20 pt-20">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SlotMachine
              pool={pool}
              isSpinning={isSpinning}
              onSpinComplete={() => {}}
              teamSkipUsed={teamSkip.used}
              decadeSkipUsed={decadeSkip.used}
              onTeamSkip={useTeamSkip}
              onDecadeSkip={useDecadeSkip}
              currentRound={currentRound}
            />

            {pool && (
              <PlayerPool
                pool={pool}
                draftedPlayerIds={draftedPlayers}
                onDraftPlayer={handleDraftPlayer}
                currentPosition={currentPosition}
              />
            )}

            {isLineupComplete && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 p-4 bg-gradient-to-r from-broadcast-accent/10 to-broadcast-gold/10 border border-broadcast-accent/30 rounded-xl text-center"
              >
                <div className="flex items-center justify-center gap-3 mb-2">
                  <Zap className="w-6 h-6 text-broadcast-accent" />
                  <span className="font-display text-xl font-bold gradient-text">LINEUP COMPLETE!</span>
                  <Zap className="w-6 h-6 text-broadcast-gold" />
                </div>
                <p className="text-broadcast-text-secondary mb-4">
                  Your 5-man dynasty is ready. Simulate the 82-game season to see if you can go 82-0.
                </p>
                <button
                  onClick={finalizeDraft}
                  className="btn-primary px-8 py-3 text-lg gap-2"
                  disabled={isSpinning}
                >
                  <Trophy className="w-5 h-5" />
                  SIMULATE 82-GAME SEASON
                </button>
              </motion.div>
            )}
          </div>

          <div className="lg:col-span-1">
            <LineupBuilder
              lineup={lineup.slots}
              currentRound={currentRound}
              onRemovePlayer={removePlayerFromSlot}
              teamStrength={teamStrength}
              projectedWins={projectedWins}
            />
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-4">
          {currentRound > 1 && (
            <button
              onClick={() => removePlayerFromSlot(currentRound - 1)}
              disabled={isSpinning}
              className="btn-secondary"
            >
              <ArrowLeft className="w-4 h-4" />
              UNDO LAST PICK
            </button>
          )}
          {currentRound < 5 && !isLineupComplete && (
            <button
              onClick={() => spinDraftPool()}
              disabled={isSpinning || !pool}
              className="btn-primary"
            >
              <RotateCcw className="w-4 h-4" />
              RE-SPIN POOL
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];