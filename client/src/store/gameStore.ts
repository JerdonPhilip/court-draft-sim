import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DraftState,
  Player,
  Position,
  SimulationResult,
  VSModeMatchup,
  HistoricalTeam,
  canPlayPosition,
} from '../types/game';
import { POSITIONS, MAX_REROLLS_PER_AXIS, MAX_MANUAL_SPINS } from '../data/constants';
import { api } from '../utils/api';
import { notify } from './toastStore';

function getEmptyPositions(slots: DraftState['lineup']['slots']): Position[] {
  return slots.filter(s => !s.player).map(s => s.position);
}

interface GameStore {
  phase: 'draft' | 'season-setup' | 'simulation' | 'results' | 'vs-mode';
  draftState: DraftState;
  simulationResult: SimulationResult | null;
  vsMatchup: VSModeMatchup | null;
  historicalTeams: HistoricalTeam[];
  /** Era decade id for the season, or null for the default mixed league. */
  selectedEra: string | null;
  isLoading: boolean;
  error: string | null;

  setPhase: (phase: GameStore['phase']) => void;
  setDraftState: (state: Partial<DraftState>) => void;
  setSimulationResult: (result: SimulationResult | null) => void;
  setVSMatchup: (matchup: VSModeMatchup | null) => void;
  setHistoricalTeams: (teams: HistoricalTeam[]) => void;
  setSelectedEra: (era: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  initializeDraft: () => void;
  spinDraftPool: (excludeFranchise?: string, excludeDecade?: string, neededPositions?: Position[], consumeManualSpin?: boolean) => Promise<void>;
  rerollFranchise: () => void;
  rerollDecade: () => void;
  // `reroll` = the axis being re-rolled (server keeps the opposite one).
  rerollPool: (reroll: 'franchise' | 'decade') => Promise<void>;
  draftPlayer: (player: Player, slotIndex: number) => void;
  removePlayerFromSlot: (slotIndex: number) => void;
  clearLineup: () => void;
  finalizeDraft: () => Promise<void>;
  runSimulation: () => Promise<void>;
  startVSMode: (historicalTeamId: string, seriesLength: 1 | 7) => Promise<void>;
  resetGame: () => void;
}

const createInitialDraftState = (): DraftState => ({
  currentRound: 1,
  maxRounds: 5,
  pool: null,
  error: null,
  lineup: {
    slots: POSITIONS.map(pos => ({ position: pos, player: null })),
  },
  teamSkip: { used: false, remaining: MAX_REROLLS_PER_AXIS },
  decadeSkip: { used: false, remaining: MAX_REROLLS_PER_AXIS },
  spinsLeft: MAX_MANUAL_SPINS,
  draftedPlayers: [],
  availablePools: [],
  isSpinning: false,
  spinResult: null,
});

let spinRequestId = 0;

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      phase: 'draft',
      draftState: createInitialDraftState(),
      simulationResult: null,
      vsMatchup: null,
      historicalTeams: [],
      selectedEra: null,
      isLoading: false,
      error: null,

      setPhase: (phase) => set({ phase }),
      setDraftState: (state) => set((prev) => ({ draftState: { ...prev.draftState, ...state } })),
      setSimulationResult: (result) => set({ simulationResult: result }),
      setVSMatchup: (matchup) => set({ vsMatchup: matchup }),
      setHistoricalTeams: (teams) => set({ historicalTeams: teams }),
      setSelectedEra: (era) => set({ selectedEra: era }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),

      initializeDraft: () => {
        spinRequestId++;
        set({
          phase: 'draft',
          draftState: createInitialDraftState(),
          simulationResult: null,
          vsMatchup: null,
          selectedEra: null,
          error: null,
        });
      },

      spinDraftPool: async (excludeFranchise, excludeDecade, neededPositions, consumeManualSpin = false) => {
        const { draftState } = get();
        if (draftState.isSpinning) return;
        // Manual re-spins redraw the CURRENT pool and are budgeted; automatic
        // spins (first pool, post-pick pools) and recovery spins from empty
        // are always free so the draft can never soft-lock.
        const hadPool = !!draftState.pool;
        const consuming = consumeManualSpin && hadPool;
        if (consuming && draftState.spinsLeft <= 0) {
          const msg = 'No spins left — draft from this pool or use a reroll.';
          set({ draftState: { ...draftState, error: msg } });
          notify.warning(msg);
          return;
        }
        const myRequest = ++spinRequestId;
        set({ draftState: { ...get().draftState, isSpinning: true, error: null } });

        try {
          // Default to the currently empty slots so the server can guarantee
          // at least one draftable player per spin.
          const need = neededPositions ?? getEmptyPositions(get().draftState.lineup.slots);
          const data = await api.draft.spin(excludeFranchise, excludeDecade, need.length > 0 ? need : undefined);

          // Stale response guard: ignore if a newer spin/reset started.
          if (myRequest !== spinRequestId) return;

          const { draftState: currentState } = get();
          // Cap persisted pool history to avoid unbounded localStorage growth.
          const newPools = [...currentState.availablePools, data.pool].slice(-10);

          set({
            draftState: {
              ...currentState,
              pool: data.pool,
              spinResult: { franchise: data.pool.franchise, decade: data.pool.decade },
              availablePools: newPools,
              isSpinning: false,
              spinsLeft: consuming ? currentState.spinsLeft - 1 : currentState.spinsLeft,
            },
          });
        } catch (error) {
          if (myRequest !== spinRequestId) return;
          const msg = error instanceof Error ? error.message : String(error);
          set({ draftState: { ...get().draftState, isSpinning: false, error: msg } });
          notify.error(msg, 'Spin failed');
        }
      },

      rerollFranchise: () => {
        // "Reroll franchise" = roll a NEW team, keep the era.
        void get().rerollPool('franchise');
      },

      rerollDecade: () => {
        // "Reroll decade" = keep the team, roll a NEW era.
        void get().rerollPool('decade');
      },

      rerollPool: async (reroll) => {
        // The server's `keep` is the axis that STAYS, i.e. the opposite of
        // the button pressed. The remaining-count consumed below must follow
        // the REROLLED axis (the button), not the kept one.
        const keep = reroll === 'franchise' ? 'decade' : 'franchise';
        const { draftState } = get();
        // Internal teamSkip/decadeSkip entries track remaining rerolls per axis.
        const remaining = reroll === 'franchise'
          ? draftState.teamSkip.remaining
          : draftState.decadeSkip.remaining;
        if (remaining <= 0 || !draftState.pool || draftState.isSpinning) return;

        const myRequest = ++spinRequestId;
        const { franchise, decade } = draftState.pool;
        set({ draftState: { ...get().draftState, isSpinning: true, error: null } });

        try {
          const need = getEmptyPositions(get().draftState.lineup.slots);
          const data = await api.draft.reroll(keep, franchise, decade, need.length > 0 ? need : undefined);

          if (myRequest !== spinRequestId) return;

          const { draftState: currentState } = get();
          const newPools = [...currentState.availablePools, data.pool].slice(-10);
          const teamRemaining = reroll === 'franchise'
            ? currentState.teamSkip.remaining - 1
            : currentState.teamSkip.remaining;
          const decadeRemaining = reroll === 'decade'
            ? currentState.decadeSkip.remaining - 1
            : currentState.decadeSkip.remaining;

          set({
            draftState: {
              ...currentState,
              pool: data.pool,
              spinResult: { franchise: data.pool.franchise, decade: data.pool.decade },
              availablePools: newPools,
              isSpinning: false,
              // Consume one reroll only on success — a failed reroll stays available.
              teamSkip: reroll === 'franchise'
                ? { used: teamRemaining <= 0, remaining: teamRemaining, franchise }
                : currentState.teamSkip,
              decadeSkip: reroll === 'decade'
                ? { used: decadeRemaining <= 0, remaining: decadeRemaining, decade }
                : currentState.decadeSkip,
            },
          });
        } catch (error) {
          if (myRequest !== spinRequestId) return;
          const msg = error instanceof Error ? error.message : String(error);
          set({ draftState: { ...get().draftState, isSpinning: false, error: msg } });
          notify.error(msg, 'Reroll failed');
        }
      },

      draftPlayer: (player, slotIndex) => {
        const { draftState } = get();
        const slot = draftState.lineup.slots[slotIndex];
        if (!slot) {
          set({ draftState: { ...draftState, error: 'Invalid slot' } });
          notify.error('Invalid slot');
          return;
        }

        if (slot.player || draftState.draftedPlayers.includes(player.id)) {
          set({ draftState: { ...draftState, error: 'Player already drafted' } });
          notify.warning(`${player.name} is already on your roster.`);
          return;
        }
        if (!canPlayPosition(player, slot.position)) {
          const plays = [player.position, ...(player.secondaryPositions ?? [])].join('/');
          const msg = `Player not suitable for the position — ${player.name} plays ${plays}, not ${slot.position}.`;
          set({ draftState: { ...draftState, error: msg } });
          notify.error(msg);
          return;
        }

        const newSlots = [...draftState.lineup.slots];
        newSlots[slotIndex] = { ...slot, player };

        const filledCount = newSlots.filter(s => s.player).length;
        const nextRound = Math.min(draftState.maxRounds, filledCount + 1);

        set({
          draftState: {
            ...draftState,
            lineup: { slots: newSlots },
            draftedPlayers: [...draftState.draftedPlayers, player.id],
            currentRound: nextRound,
            pool: null,
            spinResult: null,
            error: null,
          },
        });
        notify.success(`${player.name} locks in the ${slot.position} slot.`);

        // Auto-spin the next pool so the user is never dead-ended.
        if (filledCount < draftState.maxRounds) {
          void get().spinDraftPool();
        }
      },

      removePlayerFromSlot: (slotIndex) => {
        const { draftState } = get();
        const slot = draftState.lineup.slots[slotIndex];
        if (!slot?.player) return;

        const removedId = slot.player.id;
        const newSlots = [...draftState.lineup.slots];
        newSlots[slotIndex] = { ...slot, player: null };

        const filledCount = newSlots.filter(s => s.player).length;

        set({
          draftState: {
            ...draftState,
            lineup: { slots: newSlots },
            draftedPlayers: draftState.draftedPlayers.filter(id => id !== removedId),
            currentRound: Math.min(draftState.maxRounds, filledCount + 1),
            error: null,
          },
        });
      },

      clearLineup: () => {
        spinRequestId++;
        const { draftState } = get();
        set({
          draftState: {
            ...draftState,
            lineup: { slots: POSITIONS.map(pos => ({ position: pos, player: null })) },
            draftedPlayers: [],
            currentRound: 1,
            pool: null,
            spinResult: null,
            availablePools: [],
            isSpinning: false,
            error: null,
          },
        });
      },

      finalizeDraft: async () => {
        const { draftState } = get();
        const filledSlots = draftState.lineup.slots.filter(s => s.player).length;
        if (filledSlots < draftState.maxRounds) {
          const msg = 'Fill all 5 positions before finalizing';
          set({ error: msg, draftState: { ...draftState, error: msg } });
          notify.warning(msg);
          return;
        }
        // Lineup locked — next stop is the season setup (era pick).
        set({ phase: 'season-setup', error: null });
      },

      runSimulation: async () => {
        const { draftState } = get();
        const players = draftState.lineup.slots.map(s => s.player).filter((p): p is Player => p !== null);
        if (players.length < draftState.maxRounds) {
          set({ error: 'Fill all 5 positions before simulating', phase: 'draft' });
          return;
        }
        set({ isLoading: true, error: null });

        try {
          const era = get().selectedEra ?? null;
          const data = await api.simulation.runSeason(players, undefined, era);

          set({ simulationResult: data.result as SimulationResult, phase: 'results', isLoading: false });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : String(error), isLoading: false, phase: 'results' });
        }
      },

      startVSMode: async (historicalTeamId, seriesLength) => {
        const { draftState } = get();
        const players = draftState.lineup.slots.map(s => s.player).filter((p): p is Player => p !== null);
        if (players.length < draftState.maxRounds) {
          const msg = 'Fill all 5 positions before VS Mode';
          set({ error: msg });
          notify.warning(msg);
          return;
        }
        set({ isLoading: true, error: null });

        try {
          const data = await api.simulation.runVSMode(players, historicalTeamId, seriesLength);

          set({
            vsMatchup: data.result as VSModeMatchup,
            phase: 'vs-mode',
            isLoading: false,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          set({ error: msg, isLoading: false });
          notify.error(msg, 'VS Mode failed');
        }
      },

      resetGame: () => {
        spinRequestId++;
        set({
          phase: 'draft',
          draftState: createInitialDraftState(),
          simulationResult: null,
          vsMatchup: null,
          selectedEra: null,
          error: null,
        });
      },
    }),
    {
      name: 'court-draft-sim-store',
      version: 5,
      partialize: (state) => ({
        phase: state.phase === 'simulation' || state.phase === 'season-setup' ? 'draft' : state.phase,
        draftState: {
          ...state.draftState,
          isSpinning: false,
          error: null,
          availablePools: state.draftState.availablePools.slice(-10),
        },
        simulationResult: state.simulationResult,
        vsMatchup: state.vsMatchup,
        selectedEra: (state as { selectedEra?: string | null }).selectedEra ?? null,
      } as unknown as GameStore),
      migrate: (persisted: unknown, version: number) => {
        if (typeof persisted !== 'object' || persisted === null) {
          return persisted as GameStore;
        }
        const p = persisted as { draftState?: Partial<DraftState> };
        if (p.draftState) {
          p.draftState.isSpinning = false;
          p.draftState.error = null;
          if (!p.draftState.teamSkip) {
            p.draftState.teamSkip = { used: false, remaining: MAX_REROLLS_PER_AXIS };
          }
          if (!p.draftState.decadeSkip) {
            p.draftState.decadeSkip = { used: false, remaining: MAX_REROLLS_PER_AXIS };
          }
          // v2 -> v3: single-use reroll flags become 3-count buckets.
          const teamSkip = p.draftState.teamSkip as { used?: boolean; remaining?: number; franchise?: string } | undefined;
          if (teamSkip && typeof teamSkip.remaining !== 'number') {
            teamSkip.remaining = teamSkip.used ? 0 : MAX_REROLLS_PER_AXIS;
          }
          const decadeSkip = p.draftState.decadeSkip as { used?: boolean; remaining?: number; decade?: string } | undefined;
          if (decadeSkip && typeof decadeSkip.remaining !== 'number') {
            decadeSkip.remaining = decadeSkip.used ? 0 : MAX_REROLLS_PER_AXIS;
          }
          // v3 -> v4: manual-spin budget (older saves get a full set).
          if (typeof p.draftState.spinsLeft !== 'number') {
            p.draftState.spinsLeft = MAX_MANUAL_SPINS;
          }
        }
        return persisted as GameStore;
      },
    }
  )
);
