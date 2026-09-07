import { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, RotateCcw, Trophy, Zap } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { SlotMachine } from './SlotMachine';
import { PlayerPool } from './PlayerPool';
import { LineupBuilder } from './LineupBuilder';
import { calculateTeamStrength, getWinProjection } from '../../utils/helpers';
import { canPlayPosition } from '../../types/game';
import type { Player } from '../../types/game';

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
    isLoading,
    error: globalError,
  } = useGameStore();

  const { pool, lineup, currentRound, maxRounds, teamSkip, decadeSkip, draftedPlayers, isSpinning, spinResult } = draftState;
  void spinResult;

  const filledPlayers = useMemo(
    () => lineup.slots.map(s => s.player).filter((p): p is Player => p !== null),
    [lineup]
  );
  const teamStrength = calculateTeamStrength(filledPlayers);
  const projectedWins = getWinProjection(teamStrength);

  const emptyPositions = useMemo(
    () => lineup.slots.filter(s => !s.player).map(s => s.position),
    [lineup]
  );

  const handleDraftPlayer = (player: Player) => {
    // Free-order drafting: fill any empty slot this player can cover.
    // Prefer their primary position, fall back to a secondary fit (e.g. KG to C).
    const primaryIdx = lineup.slots.findIndex(s => !s.player && s.position === player.position);
    if (primaryIdx !== -1) {
      draftPlayer(player, primaryIdx);
      return;
    }
    const flexIdx = lineup.slots.findIndex(s => !s.player && canPlayPosition(player, s.position));
    if (flexIdx !== -1) {
      draftPlayer(player, flexIdx);
      return;
    }
    // No fitting empty slot — store surfaces the explanation.
    const fallback = lineup.slots.findIndex(s => !s.player);
    draftPlayer(player, fallback === -1 ? 0 : fallback);
  };

  const handleSpinComplete = useCallback((_pool: unknown) => {
    // No-op: store already holds the pool. Stable ref avoids retriggering SlotMachine effects.
  }, []);

  const handleUndo = () => {
    // Remove the most recently filled slot, not currentRound-1 (which is empty).
    for (let i = lineup.slots.length - 1; i >= 0; i--) {
      if (lineup.slots[i]?.player) {
        removePlayerFromSlot(i);
        return;
      }
    }
  };

  const isLineupComplete = lineup.slots.every(s => s.player !== null);
  const canUndo = lineup.slots.some(s => s.player !== null);
  const draftError = draftState.error ?? globalError;

  return (
    <div className="min-h-screen bg-broadcast-dark">
      <a href="#draft-pools" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-broadcast-accent focus:text-broadcast-dark focus:rounded-lg">
        Skip to draft pools
      </a>
      <div className="sticky top-0 z-40 bg-broadcast-dark/95 backdrop-blur border-b border-broadcast-border/50">
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
                <RotateCcw className="w-5 h-5 text-broadcast-text-secondary" aria-hidden="true" />
              </motion.button>
              <div>
                <h1 className="font-display text-2xl font-bold gradient-text">COURT DRAFT SIM</h1>
                <p className="text-xs text-broadcast-text-secondary">
                  {isLineupComplete
                    ? `LINEUP COMPLETE • ${maxRounds} OF ${maxRounds}`
                    : emptyPositions.length === maxRounds
                      ? `ROUND 1 OF ${maxRounds} • DRAFT ANY POSITION`
                      : `PICK ${filledPlayers.length + 1} OF ${maxRounds} • NEED: ${emptyPositions.join(', ')}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1 px-3 py-1 bg-broadcast-card border border-broadcast-border rounded-lg">
                <Zap className="w-4 h-4 text-broadcast-accent" aria-hidden="true" />
                <span className="text-sm font-mono font-bold text-broadcast-accent">{teamStrength}</span>
                <span className="text-xs text-broadcast-text-muted">STR</span>
              </div>
              <div className="flex items-center gap-1 px-3 py-1 bg-broadcast-card border border-broadcast-gold/30 rounded-lg">
                <Trophy className="w-4 h-4 text-broadcast-gold" aria-hidden="true" />
                <span className="text-sm font-mono font-bold text-broadcast-gold">{projectedWins}-{82 - projectedWins}</span>
                <span className="text-xs text-broadcast-text-muted">PROJ</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main id="draft-pools" className="max-w-7xl mx-auto px-4 py-6 pb-20">
        {draftError && (
          <div className="mb-4 p-3 rounded-xl bg-broadcast-red/10 border border-broadcast-red/30 text-broadcast-red text-sm" role="alert" aria-live="assertive">
            {draftError}
          </div>
        )}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SlotMachine
              pool={pool}
              isSpinning={isSpinning}
              onSpinComplete={handleSpinComplete}
              teamSkipUsed={teamSkip.used}
              decadeSkipUsed={decadeSkip.used}
              onTeamSkip={useTeamSkip}
              onDecadeSkip={useDecadeSkip}
              currentRound={currentRound}
              maxRounds={maxRounds}
              onSpin={() => void spinDraftPool()}
            />

            {pool ? (
              <PlayerPool
                pool={pool}
                draftedPlayerIds={draftedPlayers}
                onDraftPlayer={handleDraftPlayer}
                emptyPositions={emptyPositions}
                lineupSlots={lineup.slots}
              />
            ) : (
              !isSpinning && !isLineupComplete && (
                <div className="text-center p-8 card">
                  <p className="text-broadcast-text-secondary mb-4">No active pool. Spin to get players{emptyPositions.length > 0 ? ` for ${emptyPositions.join(', ')}` : ''}.</p>
                  <button onClick={() => void spinDraftPool()} className="btn-primary px-6 py-3" disabled={isSpinning || isLoading}>
                    <RotateCcw className="w-4 h-4" aria-hidden="true" />
                    SPIN POOL
                  </button>
                </div>
              )
            )}

            {isLineupComplete && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 p-4 bg-gradient-to-r from-broadcast-accent/10 to-broadcast-gold/10 border border-broadcast-accent/30 rounded-xl text-center"
              >
                <div className="flex items-center justify-center gap-3 mb-2">
                  <Zap className="w-6 h-6 text-broadcast-accent" aria-hidden="true" />
                  <span className="font-display text-xl font-bold gradient-text">LINEUP COMPLETE!</span>
                  <Zap className="w-6 h-6 text-broadcast-gold" aria-hidden="true" />
                </div>
                <p className="text-broadcast-text-secondary mb-4">
                  Your 5-man dynasty is ready. Simulate the 82-game season to see if you can go 82-0.
                </p>
                <button
                  onClick={() => void finalizeDraft()}
                  className="btn-primary px-8 py-3 text-lg gap-2"
                  disabled={isSpinning || isLoading}
                >
                  <Trophy className="w-5 h-5" aria-hidden="true" />
                  {isLoading ? 'SIMULATING...' : 'SIMULATE 82-GAME SEASON'}
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
          {canUndo && (
            <button
              onClick={handleUndo}
              disabled={isSpinning}
              className="btn-secondary"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              UNDO LAST PICK
            </button>
          )}
          {!isLineupComplete && pool && (
            <button
              onClick={() => void spinDraftPool()}
              disabled={isSpinning}
              className="btn-primary"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              RE-SPIN POOL
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
