import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DraftState,
  Lineup,
  LineupSlot,
  Player,
  DraftPool,
  SimulationResult,
  VSModeMatchup,
  HistoricalTeam,
  TeamSkip,
  DecadeSkip,
} from '../types/game';
import { POSITIONS } from '../data/constants';

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
  spinDraftPool: (excludeFranchise?: string, excludeDecade?: string) => Promise<void>;
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
        set({
          phase: 'draft',
          draftState: createInitialDraftState(),
          simulationResult: null,
          vsMatchup: null,
          error: null,
        });
      },

      spinDraftPool: async (excludeFranchise, excludeDecade) => {
        const { draftState } = get();
        set({ draftState: { ...draftState, isSpinning: true, error: null } });

        try {
          const response = await fetch('/api/draft/spin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ excludeFranchise, excludeDecade }),
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to spin');

          const { draftState: currentState } = get();
          const newPools = [...currentState.availablePools, data.pool];

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
          set({
            draftState: { ...get().draftState, isSpinning: false, error: String(error) },
          });
        }
      },

      useTeamSkip: () => {
        const { draftState } = get();
        if (draftState.teamSkip.used || !draftState.pool) return;

        set({
          draftState: {
            ...draftState,
            teamSkip: { used: true, franchise: draftState.pool.franchise },
            pool: null,
            spinResult: null,
          },
        });
        get().spinDraftPool(draftState.teamSkip.franchise, undefined);
      },

      useDecadeSkip: () => {
        const { draftState } = get();
        if (draftState.decadeSkip.used || !draftState.pool) return;

        set({
          draftState: {
            ...draftState,
            decadeSkip: { used: true, decade: draftState.pool.decade },
            pool: null,
            spinResult: null,
          },
        });
        get().spinDraftPool(undefined, draftState.decadeSkip.decade);
      },

      draftPlayer: (player, slotIndex) => {
        const { draftState } = get();
        const slot = draftState.lineup.slots[slotIndex];

        if (slot.player || draftState.draftedPlayers.includes(player.id)) return;
        if (slot.position !== player.position) return;

        const newLineup = { ...draftState.lineup };
        newLineup.slots = [...draftState.lineup.slots];
        newLineup.slots[slotIndex] = { ...slot, player };

        const nextRound = draftState.currentRound < draftState.maxRounds
          ? draftState.currentRound + 1
          : draftState.currentRound;

        set({
          draftState: {
            ...draftState,
            lineup: newLineup,
            draftedPlayers: [...draftState.draftedPlayers, player.id],
            currentRound: nextRound,
            pool: null,
            spinResult: null,
          },
        });
      },

      removePlayerFromSlot: (slotIndex) => {
        const { draftState } = get();
        const slot = draftState.lineup.slots[slotIndex];
        if (!slot.player) return;

        const newLineup = { ...draftState.lineup };
        newLineup.slots = [...draftState.lineup.slots];
        newLineup.slots[slotIndex] = { ...slot, player: null };

        set({
          draftState: {
            ...draftState,
            lineup: newLineup,
            draftedPlayers: draftState.draftedPlayers.filter(id => id !== slot.player!.id),
            currentRound: Math.max(1, draftState.currentRound - 1),
          },
        });
      },

      clearLineup: () => {
        const { draftState } = get();
        set({
          draftState: {
            ...draftState,
            lineup: { slots: POSITIONS.map(pos => ({ position: pos, player: null })) },
            draftedPlayers: [],
            currentRound: 1,
          },
        });
      },

      finalizeDraft: async () => {
        const { draftState } = get();
        const filledSlots = draftState.lineup.slots.filter(s => s.player).length;
        if (filledSlots < 5) {
          set({ error: 'Fill all 5 positions before finalizing' });
          return;
        }
        set({ phase: 'simulation' });
      },

      runSimulation: async () => {
        const { draftState } = get();
        set({ isLoading: true, error: null });

        try {
          const lineup = draftState.lineup.slots.map(s => s.player!).filter(Boolean);

          const response = await fetch('/api/simulation/season', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lineup }),
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Simulation failed');

          set({ simulationResult: data.result, phase: 'results', isLoading: false });
        } catch (error) {
          set({ error: String(error), isLoading: false });
        }
      },

      startVSMode: async (historicalTeamId, seriesLength) => {
        const { draftState } = get();
        set({ isLoading: true, error: null });

        try {
          const lineup = draftState.lineup.slots.map(s => s.player!).filter(Boolean);

          const response = await fetch('/api/simulation/vs-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userLineup: lineup, historicalTeamId, seriesLength }),
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'VS Mode failed');

          set({
            vsMatchup: data.result,
            phase: 'vs-mode',
            isLoading: false,
          });
        } catch (error) {
          set({ error: String(error), isLoading: false });
        }
      },

      resetGame: () => {
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
      partialize: (state) => ({
        phase: state.phase,
        draftState: state.draftState,
        simulationResult: state.simulationResult,
        vsMatchup: state.vsMatchup,
      }),
    }
  )
);