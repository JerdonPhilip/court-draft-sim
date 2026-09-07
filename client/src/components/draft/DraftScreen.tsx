import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Trophy, Zap } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { SlotMachine } from './SlotMachine';
import { PlayerPool } from './PlayerPool';
import { LineupBuilder } from './LineupBuilder';
import { calculateTeamStrength, getWinProjection } from '../../utils/helpers';
import { canPlayPosition, getPlayerPositions } from '../../types/game';
import type { Player } from '../../types/game';

export function DraftScreen() {
  const {
    draftState,
    spinDraftPool,
    rerollFranchise,
    rerollDecade,
    draftPlayer,
    finalizeDraft,
    initializeDraft,
    isLoading,
    error: globalError,
  } = useGameStore();

  const { pool, lineup, currentRound, maxRounds, teamSkip, decadeSkip, spinsLeft, draftedPlayers, isSpinning, spinResult } = draftState;
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

  // Slot-first drafting: click an open slot, then click (or drag) a player into it.
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [draggedPlayer, setDraggedPlayer] = useState<Player | null>(null);

  // Default the selection to the first open slot; advance it as picks land.
  useEffect(() => {
    const firstEmpty = lineup.slots.findIndex(s => !s.player);
    if (firstEmpty === -1) {
      setSelectedSlot(null);
      return;
    }
    setSelectedSlot(prev => {
      if (prev === null) return firstEmpty;
      const prevSlot = lineup.slots[prev];
      if (!prevSlot || prevSlot.player) return firstEmpty;
      return prev;
    });
  }, [lineup]);

  const handleSelectSlot = useCallback((index: number) => {
    const slot = lineup.slots[index];
    if (!slot || slot.player) return; // picks are final — filled slots can't be re-selected
    setSelectedSlot(index);
  }, [lineup]);

  const handleDraftPlayer = useCallback((player: Player, targetSlot?: number) => {
    const explicit = targetSlot ?? selectedSlot;
    if (explicit !== null && explicit !== undefined) {
      const slot = lineup.slots[explicit];
      if (slot && !slot.player) {
        if (!canPlayPosition(player, slot.position)) {
          const plays = getPlayerPositions(player).join('/');
          useGameStore.setState(prev => ({
            draftState: {
              ...prev.draftState,
              error: `Player not suitable for the position — ${player.name} plays ${plays}, not ${slot.position}.`,
            },
          }));
          return;
        }
        draftPlayer(player, explicit);
        return;
      }
    }
    // No usable selection — fall back to best-fit routing (primary first, then flex).
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
    const fallback = lineup.slots.findIndex(s => !s.player);
    draftPlayer(player, fallback === -1 ? 0 : fallback);
  }, [draftPlayer, lineup, selectedSlot]);

  const handleDropToSlot = useCallback((player: Player, slotIndex: number) => {
    setDraggedPlayer(null);
    handleDraftPlayer(player, slotIndex);
  }, [handleDraftPlayer]);

  const handleSpinComplete = useCallback((_pool: unknown) => {
    // No-op: store already holds the pool. Stable ref avoids retriggering SlotMachine effects.
  }, []);

  const isLineupComplete = lineup.slots.every(s => s.player !== null);
  const draftError = draftState.error ?? globalError;
  const selectedPosition = selectedSlot !== null ? lineup.slots[selectedSlot]?.position ?? null : null;

  return (
    <div className="min-h-screen bg-broadcast-dark">
      <a href="#draft-pools" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-broadcast-accent focus:text-broadcast-dark focus:rounded-lg">
        Skip to draft pools
      </a>
      <div className="sticky top-0 z-40 border-b border-broadcast-border/50 bg-broadcast-dark/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 2xl:max-w-[1500px]">
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
                      ? `ROUND 1 OF ${maxRounds} • PICK A SLOT, THEN A PLAYER`
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

      <main id="draft-pools" className={`mx-auto max-w-7xl px-4 pt-4 2xl:max-w-[1500px] ${isLineupComplete ? 'pb-28' : 'pb-6'}`}>
        {draftError && (
          <div className="mb-4 p-3 rounded-xl bg-broadcast-red/10 border border-broadcast-red/30 text-broadcast-red text-sm" role="alert" aria-live="assertive">
            {draftError}
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
          <div className="space-y-5 lg:col-span-3">
            <SlotMachine
              pool={pool}
              isSpinning={isSpinning}
              onSpinComplete={handleSpinComplete}
              franchiseRerollsLeft={teamSkip.remaining}
              decadeRerollsLeft={decadeSkip.remaining}
              spinsLeft={spinsLeft}
              onRerollFranchise={rerollFranchise}
              onRerollDecade={rerollDecade}
              currentRound={currentRound}
              maxRounds={maxRounds}
              onSpin={() => void spinDraftPool(undefined, undefined, undefined, true)}
            />

            {pool ? (
              <PlayerPool
                pool={pool}
                draftedPlayerIds={draftedPlayers}
                onDraftPlayer={(player) => handleDraftPlayer(player)}
                onDragStartPlayer={setDraggedPlayer}
                onDragEndPlayer={() => setDraggedPlayer(null)}
                emptyPositions={emptyPositions}
                lineupSlots={lineup.slots}
                selectedSlotPosition={selectedPosition}
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
                  Your 5-man dynasty is ready. Picks are locked — simulate the 82-game season to see if you can go 82-0.
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

          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-[104px] lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto lg:rounded-2xl lg:pb-2 lg:pl-1 lg:pr-2">
            <LineupBuilder
              lineup={lineup.slots}
              selectedSlot={selectedSlot}
              draggedPlayer={draggedPlayer}
              onSelectSlot={handleSelectSlot}
              onDropPlayer={handleDropToSlot}
              teamStrength={teamStrength}
              projectedWins={projectedWins}
            />
            </div>
          </div>
        </div>
      </main>

      {isLineupComplete && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-broadcast-accent/40 bg-broadcast-dark/90 py-2.5 pl-5 pr-2.5 shadow-glow-accent backdrop-blur-md">
            <div>
              <div className="font-display text-sm font-bold gradient-text">LINEUP COMPLETE</div>
              <div className="text-xs text-broadcast-text-secondary">{projectedWins}-{82 - projectedWins} PROJ • {teamStrength} STR</div>
            </div>
            <button
              onClick={() => void finalizeDraft()}
              disabled={isSpinning || isLoading}
              className="btn-primary px-6 py-2.5"
            >
              <Trophy className="h-5 w-5" aria-hidden="true" />
              {isLoading ? 'SIMULATING...' : 'SIMULATE SEASON'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
