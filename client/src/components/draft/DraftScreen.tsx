import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, Trophy, Zap } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { notify } from '../../store/toastStore';
import { SlotMachine } from './SlotMachine';
import { PlayerPool } from './PlayerPool';
import { LineupBuilder } from './LineupBuilder';
import { DraftPickModal } from './DraftPickModal';
import { calculateTeamStrength, getWinProjection } from '../../utils/helpers';
import { APP_VERSION } from '../../version';
import { canPlayPosition, getPlayerPositions } from '../../types/game';
import type { Player } from '../../types/game';

export function DraftScreen() {
  const {
    draftState,
    spinDraftPool,
    rerollFranchise,
    rerollDecade,
    draftPlayer,
    setSixthMan,
    setOptionRank,
    swapPlayers,
    finalizeDraft,
    initializeDraft,
    isLoading,
  } = useGameStore();

  const { pool, lineup, currentRound, maxRounds, teamSkip, decadeSkip, spinsLeft, draftedPlayers, draftedPersonKeys, isSpinning, spinResult } = draftState;
  void spinResult;

  const filledPlayers = useMemo(
    () => lineup.slots.map(s => s.player).filter((p): p is Player => p !== null),
    [lineup]
  );
  const sixthManId = useMemo(
    () => lineup.slots.find(s => s.isSixthMan && s.player)?.player?.id,
    [lineup]
  );
  const options = useMemo(() => {
    const rankOf = (r: 1 | 2 | 3) => lineup.slots.find(s => s.optionRank === r && s.player)?.player?.id ?? null;
    return { first: rankOf(1), second: rankOf(2), third: rankOf(3) };
  }, [lineup]);
  const teamStrength = calculateTeamStrength(filledPlayers, sixthManId, options);
  const projectedWins = getWinProjection(teamStrength);

  const emptyPositions = useMemo(
    () => lineup.slots.filter(s => !s.player).map(s => s.position),
    [lineup]
  );

  // Deduped for display (10-man rosters hold each position twice).
  const neededLabels = useMemo(() => [...new Set(emptyPositions)].join(' · '), [emptyPositions]);

  // Slot-first drafting: click an open slot, then click (or drag) a player into it.
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [draggedPlayer, setDraggedPlayer] = useState<Player | null>(null);
  // Pick modal: tap a player with several open fits, choose STARTER/BENCH inline.
  const [pickPlayer, setPickPlayer] = useState<Player | null>(null);

  // A new pool invalidates any open pick dialog (the player may be gone).
  useEffect(() => {
    setPickPlayer(null);
  }, [pool?.franchise, pool?.decade]);

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
    // No forced slot: single fit drafts instantly, several fits open the
    // starter/bench picker so nothing is ever auto-routed without consent.
    if (targetSlot === undefined) {
      const fits = lineup.slots
        .map((s, i) => ({ slot: s, index: i }))
        .filter(({ slot }) => !slot.player && canPlayPosition(player, slot.position));
      if (fits.length === 0) return; // card is disabled in this state
      if (fits.length === 1) {
        draftPlayer(player, fits[0]!.index);
        return;
      }
      setPickPlayer(player);
      return;
    }
    const explicit = targetSlot ?? selectedSlot;
    if (explicit !== null && explicit !== undefined) {
      const slot = lineup.slots[explicit];
      if (slot && !slot.player) {
        if (!canPlayPosition(player, slot.position)) {
          const plays = getPlayerPositions(player).join('/');
          notify.error(`Player not suitable for the position. ${player.name} plays ${plays}, not ${slot.position}.`);
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

  const handleConfirmPick = useCallback((player: Player, slotIndex: number) => {
    setPickPlayer(null);
    draftPlayer(player, slotIndex);
  }, [draftPlayer]);

  const handleDropToSlot = useCallback((player: Player, slotIndex: number) => {
    setDraggedPlayer(null);
    handleDraftPlayer(player, slotIndex);
  }, [handleDraftPlayer]);

  const handleSpinComplete = useCallback((_pool: unknown) => {
    // No-op: store already holds the pool. Stable ref avoids retriggering SlotMachine effects.
  }, []);

  const isLineupComplete = lineup.slots.every(s => s.player !== null);
  const selectedPosition = selectedSlot !== null ? lineup.slots[selectedSlot]?.position ?? null : null;

  return (
    <div className="min-h-screen overflow-x-clip bg-broadcast-dark">
      <a href="#draft-pools" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-broadcast-accent focus:text-broadcast-dark focus:rounded-lg">
        Skip to draft pools
      </a>
      <div className="sticky top-0 z-40 border-b border-broadcast-border/50 bg-broadcast-dark/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-3 py-2 sm:px-4 sm:py-3 2xl:max-w-[1500px]">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <motion.button
                onClick={initializeDraft}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-lg bg-broadcast-card border border-broadcast-border hover:border-broadcast-accent/50 transition-colors"
                aria-label="New draft"
              >
                <RotateCcw className="w-5 h-5 text-broadcast-text-secondary" aria-hidden="true" />
              </motion.button>
              <div className="min-w-0">
                <h1 className="font-display text-lg font-bold gradient-text sm:text-2xl">COURT DRAFT SIM <span className="ml-1 hidden align-middle rounded-full border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-broadcast-text-muted min-[420px]:inline">v{APP_VERSION}</span></h1>
                <p className="truncate text-xs text-broadcast-text-secondary">
                  {isLineupComplete
                    ? `LINEUP COMPLETE • ${maxRounds} OF ${maxRounds}`
                    : emptyPositions.length === maxRounds
                      ? `ROUND 1 OF ${maxRounds} • PICK A SLOT, THEN A PLAYER`
                      : `PICK ${filledPlayers.length + 1} OF ${maxRounds} • OPEN: ${neededLabels}`}
                </p>
              </div>
            </div>
            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-white/10 bg-broadcast-card/90 px-2 py-1 shadow-[0_10px_36px_rgb(0,0,0,0.38)] backdrop-blur-sm sm:gap-x-3 sm:px-3 sm:py-1.5"
              aria-live="polite"
              aria-label={`Team strength ${teamStrength}, projected record ${projectedWins} and ${82 - projectedWins}, ${filledPlayers.length} of ${maxRounds} picks made`}
            >
              <div className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 shrink-0 text-broadcast-accent" aria-hidden="true" />
                <span className="font-display text-base font-bold leading-none text-broadcast-accent sm:text-lg">{teamStrength}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-broadcast-text-muted">STR</span>
                <span className="hidden h-1 w-10 overflow-hidden rounded-full bg-white/10 min-[380px]:block" role="img" aria-label={`Strength ${teamStrength} out of 100`}>
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-broadcast-accent to-broadcast-gold transition-[width] duration-500"
                    style={{ width: `${Math.max(4, Math.min(100, teamStrength))}%` }}
                  />
                </span>
              </div>
              <div className="h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />
              <div className="flex items-center gap-1.5">
                <Trophy className="h-4 w-4 shrink-0 text-broadcast-gold" aria-hidden="true" />
                <span className="font-display text-base font-bold leading-none text-broadcast-gold sm:text-lg">{projectedWins}-{82 - projectedWins}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-broadcast-text-muted">PROJ</span>
              </div>
              <div className="hidden h-6 w-px shrink-0 bg-white/10 min-[420px]:block" aria-hidden="true" />
              <div className="hidden items-center gap-1.5 min-[420px]:flex">
                <span className="flex items-center gap-1" aria-hidden="true">
                  {lineup.slots.map((s, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${s.player ? 'bg-broadcast-accent shadow-glow-accent' : 'bg-white/15'}`}
                    />
                  ))}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-broadcast-text-muted">{filledPlayers.length}/{maxRounds}</span>
              </div>
            </div>
          </div>
          {!isLineupComplete && (
            <div className="mt-2 flex items-center gap-2 lg:hidden" aria-live="polite">
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-broadcast-text-secondary">
                {selectedPosition ? (
                  <>
                    PICK <span className="font-bold text-broadcast-gold">{selectedPosition}</span>
                    <span aria-hidden="true"> • </span>
                    <span>{filledPlayers.length}/{maxRounds}</span>
                    {neededLabels ? <span className="text-broadcast-text-muted"> • {neededLabels}</span> : null}
                  </>
                ) : (
                  <>PICK {filledPlayers.length + 1} OF {maxRounds}{neededLabels ? ` • ${neededLabels}` : ''}</>
                )}
              </p>
              <a
                href="#draft-lineup"
                className="shrink-0 rounded-full border border-broadcast-accent/50 bg-broadcast-accent/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-broadcast-accent transition-colors hover:bg-broadcast-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent"
              >
                Lineup {filledPlayers.length}/{maxRounds}
              </a>
            </div>
          )}
        </div>
      </div>

      <main id="draft-pools" className={`mx-auto w-full max-w-7xl min-w-0 px-3 pt-4 sm:px-4 2xl:max-w-[1500px] ${isLineupComplete ? 'pb-28' : 'pb-6'}`}>
        <div className="grid min-w-0 gap-6 lg:grid-cols-5 lg:gap-8">
          <div className="min-w-0 space-y-4 lg:col-span-3">
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
                draftedPlayerIds={draftedPlayers ?? []}
                draftedPersonKeys={draftedPersonKeys ?? []}
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
                  <p className="text-broadcast-text-secondary mb-1 font-medium">No active pool.</p>
                  <p className="text-broadcast-text-muted text-sm mb-4">{neededLabels ? `Spin to scout prospects for your open positions: ${neededLabels}.` : 'Spin to scout the next batch of prospects.'}</p>
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
                  Your 10-man rotation is ready. Picks are locked, so choose which era to take them against.
                </p>
                <button
                  onClick={() => void finalizeDraft()}
                  className="btn-primary px-8 py-3 text-lg gap-2"
                  disabled={isSpinning || isLoading}
                >
                  <Trophy className="w-5 h-5" aria-hidden="true" />
                  CHOOSE SEASON ERA
                </button>
              </motion.div>
            )}
          </div>

          <div id="draft-lineup" className="min-w-0 scroll-mt-32 lg:col-span-2">
            <div className="lg:sticky lg:top-[104px] lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto lg:rounded-2xl lg:pb-2 lg:pl-1 lg:pr-2">
            <LineupBuilder
              lineup={lineup.slots}
              selectedSlot={selectedSlot}
              draggedPlayer={draggedPlayer}
              sixthManExplicit={draftState.sixthManExplicit ?? false}
              optionsExplicit={draftState.optionsExplicit ?? { 1: false, 2: false, 3: false }}
              onSelectSlot={handleSelectSlot}
              onDropPlayer={handleDropToSlot}
              onSetSixthMan={setSixthMan}
              onSetOption={setOptionRank}
              onSwapPlayers={(a, b) => { swapPlayers(a, b); }}
            />
            </div>
          </div>
        </div>
      </main>

      {isLineupComplete && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 [padding-bottom:max(0rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-broadcast-accent/40 bg-broadcast-dark/90 py-2.5 pl-4 pr-2.5 shadow-glow-accent backdrop-blur-md sm:w-auto sm:max-w-none sm:gap-4 sm:pl-5">
            <div className="min-w-0 flex-1 sm:flex-none">
              <div className="truncate font-display text-sm font-bold gradient-text">LINEUP COMPLETE</div>
              <div className="whitespace-nowrap text-xs text-broadcast-text-secondary">{projectedWins}-{82 - projectedWins} PROJ • {teamStrength} STR</div>
            </div>
            <button
              onClick={() => void finalizeDraft()}
              disabled={isSpinning || isLoading}
              className="btn-primary px-6 py-2.5"
            >
              <Trophy className="h-5 w-5" aria-hidden="true" />
              PICK ERA
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {pickPlayer && (
          <DraftPickModal
            player={pickPlayer}
            slots={lineup.slots}
            onPick={handleConfirmPick}
            onClose={() => setPickPlayer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
