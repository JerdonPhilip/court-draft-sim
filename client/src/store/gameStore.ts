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
import { POSITIONS } from '../data/constants';
import { api } from '../utils/api';

function getEmptyPositions(slots: DraftState['lineup']['slots']): Position[] {
  return slots.filter(s => !s.player).map(s => s.position);
}

interface GameStore {
  phase: 'draft' | 'simulation' | 'results' | 'vs-mode';
  draftState: DraftState;
  simulationResult: SimulationResult | null;
  vsMatchup: VSModeMatchup | null;
  historicalTeams: HistoricalTeam[];
  isLoading: boolean;
  error: string | null;

  setPhase: (phase: GameStore['phase']) => void;
  setDraftState: (state: Partial<DraftState>) => void;
  setSimulationResult: (result: SimulationResult | null) => void;
  setVSMatchup: (matchup: VSModeMatchup | null) => void;
  setHistoricalTeams: (teams: HistoricalTeam[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  initializeDraft: () => void;
  spinDraftPool: (excludeFranchise?: string, excludeDecade?: string, neededPositions?: Position[]) => Promise<void>;
  useTeamSkip: () => void;
  useDecadeSkip: () => void;
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
  teamSkip: { used: false },
  decadeSkip: { used: false },
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
      isLoading: false,
      error: null,

      setPhase: (phase) => set({ phase }),
      setDraftState: (state) => set((prev) => ({ draftState: { ...prev.draftState, ...state } })),
      setSimulationResult: (result) => set({ simulationResult: result }),
      setVSMatchup: (matchup) => set({ vsMatchup: matchup }),
      setHistoricalTeams: (teams) => set({ historicalTeams: teams }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),

      initializeDraft: () => {
        spinRequestId++;
        set({
          phase: 'draft',
          draftState: createInitialDraftState(),
          simulationResult: null,
          vsMatchup: null,
          error: null,
        });
      },

      spinDraftPool: async (excludeFranchise, excludeDecade, neededPositions) => {
        const { draftState } = get();
        if (draftState.isSpinning) return;
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
            },
          });
        } catch (error) {
          if (myRequest !== spinRequestId) return;
          set({
            draftState: { ...get().draftState, isSpinning: false, error: error instanceof Error ? error.message : String(error) },
          });
        }
      },

      useTeamSkip: () => {
        const { draftState } = get();
        if (draftState.teamSkip.used || !draftState.pool || draftState.isSpinning) return;

        const evictedFranchise = draftState.pool.franchise;
        set({
          draftState: {
            ...draftState,
            teamSkip: { used: true, franchise: evictedFranchise },
            pool: null,
            spinResult: null,
          },
        });
        void get().spinDraftPool(evictedFranchise, undefined);
      },

      useDecadeSkip: () => {
        const { draftState } = get();
        if (draftState.decadeSkip.used || !draftState.pool || draftState.isSpinning) return;

        const evictedDecade = draftState.pool.decade;
        set({
          draftState: {
            ...draftState,
            decadeSkip: { used: true, decade: evictedDecade },
            pool: null,
            spinResult: null,
          },
        });
        void get().spinDraftPool(undefined, evictedDecade);
      },

      draftPlayer: (player, slotIndex) => {
        const { draftState } = get();
        const slot = draftState.lineup.slots[slotIndex];
        if (!slot) {
          set({ draftState: { ...draftState, error: 'Invalid slot' } });
          return;
        }

        if (slot.player || draftState.draftedPlayers.includes(player.id)) {
          set({ draftState: { ...draftState, error: 'Player already drafted' } });
          return;
        }
        if (!canPlayPosition(player, slot.position)) {
          const flex = player.secondaryPositions?.length
            ? ` (${player.position}/${player.secondaryPositions.join('/')})`
            : ` (${player.position})`;
          set({
            draftState: {
              ...draftState,
              error: `${player.name}${flex} can't fill the ${slot.position} slot — try an empty ${player.position} slot`,
            },
          });
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
          return;
        }
        set({ phase: 'simulation', error: null });
        await get().runSimulation();
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
          const data = await api.simulation.runSeason(players);

          set({ simulationResult: data.result as SimulationResult, phase: 'results', isLoading: false });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : String(error), isLoading: false, phase: 'results' });
        }
      },

      startVSMode: async (historicalTeamId, seriesLength) => {
        const { draftState } = get();
        const players = draftState.lineup.slots.map(s => s.player).filter((p): p is Player => p !== null);
        if (players.length < draftState.maxRounds) {
          set({ error: 'Fill all 5 positions before VS Mode' });
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
          set({ error: error instanceof Error ? error.message : String(error), isLoading: false });
        }
      },

      resetGame: () => {
        spinRequestId++;
        set({
          phase: 'draft',
          draftState: createInitialDraftState(),
          simulationResult: null,
          vsMatchup: null,
          error: null,
        });
      },
    }),
    {
      name: 'court-draft-sim-store',
      version: 2,
      partialize: (state) => ({
        phase: state.phase === 'simulation' ? 'draft' : state.phase,
        draftState: {
          ...state.draftState,
          isSpinning: false,
          error: null,
          availablePools: state.draftState.availablePools.slice(-10),
        },
        simulationResult: state.simulationResult,
        vsMatchup: state.vsMatchup,
      } as unknown as GameStore),
      migrate: (persisted: unknown, version: number) => {
        if (version < 2 || typeof persisted !== 'object' || persisted === null) {
          return persisted as GameStore;
        }
        const p = persisted as { draftState?: Partial<DraftState> };
        if (p.draftState) {
          p.draftState.isSpinning = false;
          p.draftState.error = null;
        }
        return persisted as GameStore;
      },
    }
  )
);
