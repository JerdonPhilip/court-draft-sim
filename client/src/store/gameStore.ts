import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DraftState,
  Player,
  PlayoffGameResult,
  Position,
  SimulationResult,
  VSModeMatchup,
  HistoricalTeam,
  MinutesMap,
  canPlayPosition,
  personKeyOf,
} from '../types/game';
import { POSITIONS, MAX_REROLLS_PER_AXIS, MAX_MANUAL_SPINS, ROSTER_SLOTS, MAX_ROSTER_SIZE } from '../data/constants';
import { buildDefaultMinutes } from '../utils/helpers';
import { api } from '../utils/api';
import { notify } from './toastStore';

function getEmptyPositions(slots: DraftState['lineup']['slots']): Position[] {
  return slots.filter(s => !s.player).map(s => s.position);
}

export interface PlayoffProgress {
  /** Season fingerprint — progress only restores onto the same season. */
  seasonKey: string;
  winners: Record<string, string>;
  hasStarted: boolean;
  seriesGames: Record<string, PlayoffGameResult[]>;
}

interface GameStore {
  phase: 'welcome' | 'draft' | 'season-setup' | 'simulation' | 'results' | 'vs-mode';
  /** True once the visitor has entered the game at least once. */
  hasSeenWelcome: boolean;
  draftState: DraftState;
  simulationResult: SimulationResult | null;
  vsMatchup: VSModeMatchup | null;
  historicalTeams: HistoricalTeam[];
  /** Era decade id for the season, or null for the default mixed league. */
  selectedEra: string | null;
  /** Playoff bracket progress (persisted so a reload resumes mid-playoffs). */
  playoffProgress: PlayoffProgress | null;
  isLoading: boolean;
  error: string | null;

  setPhase: (phase: GameStore['phase']) => void;
  setHasSeenWelcome: (seen: boolean) => void;
  setDraftState: (state: Partial<DraftState>) => void;
  setSimulationResult: (result: SimulationResult | null) => void;
  setVSMatchup: (matchup: VSModeMatchup | null) => void;
  setHistoricalTeams: (teams: HistoricalTeam[]) => void;
  setSelectedEra: (era: string | null) => void;
  setPlayoffProgress: (progress: PlayoffProgress | null) => void;
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
  setSixthMan: (slotIndex: number) => void;
  setOptionRank: (slotIndex: number, rank: 1 | 2 | 3 | null) => void;
  /** Swap two filled slots (starter<->bench allowed) when both players fit the other slot. */
  swapPlayers: (indexA: number, indexB: number) => boolean;
  /** Build auto default minutes (34/22/12) when none exist yet. */
  ensureMinutesInitialized: () => void;
  setPlayerMinutes: (playerId: string, mins: number) => void;
  applyMinutesPreset: (preset: 'default' | 'balanced' | 'seven' | 'eight' | 'nine') => void;
  resetMinutesToDefault: () => void;
  /** Scale nonzero entries to total 240 (keeps DNP zeros at 0). */
  rebalanceMinutes: () => void;
  clearLineup: () => void;
  finalizeDraft: () => Promise<void>;
  runSimulation: () => Promise<void>;
  startVSMode: (historicalTeamId: string, seriesLength: 1 | 7) => Promise<void>;
  resetGame: () => void;
}

const createInitialDraftState = (): DraftState => ({
  currentRound: 1,
  maxRounds: MAX_ROSTER_SIZE,
  pool: null,
  error: null,
  lineup: {
    slots: ROSTER_SLOTS.map(s => ({ position: s.position, player: null, role: s.role })),
  },
  teamSkip: { used: false, remaining: MAX_REROLLS_PER_AXIS },
  decadeSkip: { used: false, remaining: MAX_REROLLS_PER_AXIS },
  spinsLeft: MAX_MANUAL_SPINS,
  draftedPlayers: [],
  draftedPersonKeys: [],
  availablePools: [],
  isSpinning: false,
  spinResult: null,
  sixthManExplicit: false,
  optionsExplicit: { 1: false, 2: false, 3: false },
  minutes: null,
  minutesExplicit: false,
});

function getOptionsFromSlots(slots: DraftState['lineup']['slots']): { first?: string | null; second?: string | null; third?: string | null } {
  const rankOf = (r: 1 | 2 | 3) => slots.find(s => s.optionRank === r && s.player)?.player?.id ?? null;
  return { first: rankOf(1), second: rankOf(2), third: rankOf(3) };
}

const TEAM_MINUTES_TARGET = 240;

export function minutesSum(minutes: MinutesMap | null | undefined): number {
  if (!minutes) return 0;
  return Object.values(minutes).reduce((t, v) => t + (Number.isFinite(v) ? v : 0), 0);
}

/** Valid = every filled roster spot has a 0-48 entry and the total is 240. */
export function isMinutesValid(slots: DraftState['lineup']['slots'], minutes: MinutesMap | null | undefined): boolean {
  if (!minutes) return false;
  for (const s of slots) {
    if (!s.player) return false;
    const v = minutes[s.player.id];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 48) return false;
  }
  return Math.abs(minutesSum(minutes) - TEAM_MINUTES_TARGET) < 0.5;
}

function ensureOptions(slots: DraftState['lineup']['slots']): DraftState['lineup']['slots'] {  const has = (r: 1 | 2 | 3) => slots.some(s => s.optionRank === r && s.player);
  if (has(1) && has(2) && has(3)) return slots;
  // Default 1st/2nd/3rd to the best overall filled players.
  const byOverall = slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.player)
    .sort((a, b) => (b.s.player?.overall ?? 0) - (a.s.player?.overall ?? 0));
  const result = slots.map(s => ({ ...s }));
  // Assign missing ranks in order to top overall players without a rank.
  const missing = ([1, 2, 3] as const).filter(r => !has(r));
  const unranked = byOverall.filter(({ i }) => !result[i]!.optionRank);
  missing.forEach((rank, k) => {
    const target = unranked[k];
    if (target) result[target.i] = { ...result[target.i]!, optionRank: rank };
  });
  return result;
}

let spinRequestId = 0;

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      phase: 'welcome',
      hasSeenWelcome: false,
      draftState: createInitialDraftState(),
      simulationResult: null,
      vsMatchup: null,
      historicalTeams: [],
      selectedEra: null,
      playoffProgress: null,
      isLoading: false,
      error: null,

      setPhase: (phase) => set({ phase }),
      setHasSeenWelcome: (seen) => set({ hasSeenWelcome: seen }),
      setDraftState: (state) => set((prev) => ({ draftState: { ...prev.draftState, ...state } })),
      setSimulationResult: (result) => set({ simulationResult: result }),
      setVSMatchup: (matchup) => set({ vsMatchup: matchup }),
      setHistoricalTeams: (teams) => set({ historicalTeams: teams }),
      setSelectedEra: (era) => set({ selectedEra: era }),
      setPlayoffProgress: (progress) => set({ playoffProgress: progress }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),

      initializeDraft: () => {
        spinRequestId++;
        set({
          phase: 'draft',
          hasSeenWelcome: true,
          draftState: createInitialDraftState(),
          simulationResult: null,
          vsMatchup: null,
          selectedEra: null,
          playoffProgress: null,
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
          const msg = 'No spins left. Draft from this pool or use a reroll.';
          set({ draftState: { ...draftState, error: msg } });
          notify.warning(msg);
          return;
        }
        const myRequest = ++spinRequestId;
        set({ draftState: { ...get().draftState, isSpinning: true, error: null } });

        try {
          // Default to the currently empty slots so the server can guarantee
          // at least one draftable player per spin. Dedupe: 10-man lineups
          // hold each position twice (starter + bench).
          const rawNeed = neededPositions ?? getEmptyPositions(get().draftState.lineup.slots);
          const need = [...new Set(rawNeed)].slice(0, 10) as Position[];
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
          const rawNeed = getEmptyPositions(get().draftState.lineup.slots);
          const need = [...new Set(rawNeed)].slice(0, 10) as Position[];
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

        if (slot.player || (draftState.draftedPlayers ?? []).includes(player.id)) {
          set({ draftState: { ...draftState, error: 'Player already drafted' } });
          notify.warning(`${player.name} is already on your roster.`);
          return;
        }
        // Same person, different era (e.g. Lillard 10s vs 20s) counts as drafted.
        const key = personKeyOf(player);
        if ((draftState.draftedPersonKeys ?? []).includes(key)) {
          const msg = `${player.name} is already on your roster (different era).`;
          set({ draftState: { ...draftState, error: msg } });
          notify.warning(msg);
          return;
        }
        if (!canPlayPosition(player, slot.position)) {
          const plays = [player.position, ...(player.secondaryPositions ?? [])].join('/');
          const msg = `Player not suitable for the position. ${player.name} plays ${plays}, not ${slot.position}.`;
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
            draftedPlayers: [...(draftState.draftedPlayers ?? []), player.id],
            draftedPersonKeys: [...(draftState.draftedPersonKeys ?? []), personKeyOf(player)],
            currentRound: nextRound,
            pool: null,
            spinResult: null,
            error: null,
            // A re-added player starts as DNP cover until rebalanced in setup.
            minutes: draftState.minutes ? { ...draftState.minutes, [player.id]: 0 } : draftState.minutes ?? null,
          },
        });
        // No success toast on draft picks — the sticky pick bar + lineup update
        // already confirm the pick inline. Toasts are reserved for errors/warnings
        // so they never cover the next pick or CTA on mobile.

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
        const removedKey = personKeyOf(slot.player);
        const newSlots = [...draftState.lineup.slots];
        newSlots[slotIndex] = { ...slot, player: null, isSixthMan: false, optionRank: undefined };

        const filledCount = newSlots.filter(s => s.player).length;
        const nextExplicit = { ...(draftState.optionsExplicit ?? { 1: false, 2: false, 3: false }) };
        if (slot.optionRank) nextExplicit[slot.optionRank] = false;
        const nextMinutes = draftState.minutes ? { ...draftState.minutes } : null;
        if (nextMinutes) delete nextMinutes[removedId];

        set({
          draftState: {
            ...draftState,
            lineup: { slots: newSlots },
            draftedPlayers: (draftState.draftedPlayers ?? []).filter(id => id !== removedId),
            draftedPersonKeys: (draftState.draftedPersonKeys ?? []).filter(k => k !== removedKey),
            currentRound: Math.min(draftState.maxRounds, filledCount + 1),
            error: null,
            sixthManExplicit: slot.isSixthMan ? false : (draftState.sixthManExplicit ?? false),
            optionsExplicit: nextExplicit,
            minutes: nextMinutes,
          },
        });
      },

      setSixthMan: (slotIndex) => {
        const { draftState } = get();
        const slot = draftState.lineup.slots[slotIndex];
        if (!slot || slot.role !== 'bench' || !slot.player) return;
        const newSlots = draftState.lineup.slots.map((s, i) => ({
          ...s,
          isSixthMan: i === slotIndex,
        }));
        set({
          draftState: {
            ...draftState,
            lineup: { slots: newSlots },
            error: null,
            sixthManExplicit: true,
          },
        });
        notify.success(`${slot.player.name} is your Sixth Man.`);
      },

      setOptionRank: (slotIndex, rank) => {
        const { draftState } = get();
        const slot = draftState.lineup.slots[slotIndex];
        if (!slot || !slot.player) return;
        const prevRank = slot.optionRank;
        // Toggle off when clicking the active rank; ranks stay unique.
        const newSlots = draftState.lineup.slots.map((s, i) => {
          if (i === slotIndex) return { ...s, optionRank: s.optionRank === rank ? undefined : (rank ?? undefined) };
          if (rank != null && s.optionRank === rank) return { ...s, optionRank: undefined };
          return s;
        });
        const nextExplicit = { ...(draftState.optionsExplicit ?? { 1: false, 2: false, 3: false }) };
        if (prevRank) nextExplicit[prevRank] = false;
        if (rank != null && prevRank !== rank) nextExplicit[rank] = true;
        set({
          draftState: {
            ...draftState,
            lineup: { slots: newSlots },
            error: null,
            optionsExplicit: nextExplicit,
          },
        });
        if (rank != null && slot.optionRank !== rank && slot.player) {
          notify.success(`${slot.player.name} is your ${rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd'} option.`);
        }
      },

      swapPlayers: (indexA, indexB) => {
        const { draftState } = get();
        if (indexA === indexB) return false;
        const slots = draftState.lineup.slots;
        const slotA = slots[indexA];
        const slotB = slots[indexB];
        if (!slotA?.player || !slotB?.player) return false;
        // Both players must fit the other's fixed positional slot.
        if (!canPlayPosition(slotA.player, slotB.position) || !canPlayPosition(slotB.player, slotA.position)) {
          const msg = `${slotA.player.name} (${[slotA.player.position, ...(slotA.player.secondaryPositions ?? [])].join('/')}) and ${slotB.player.name} (${[slotB.player.position, ...(slotB.player.secondaryPositions ?? [])].join('/')}) can't cover ${slotA.position} + ${slotB.position}.`;
          set({ draftState: { ...draftState, error: msg } });
          notify.error(msg, 'Swap blocked');
          return false;
        }
        const sixthId = slots.find(s => s.isSixthMan && s.player)?.player?.id ?? null;
        const newSlots = slots.map(s => ({ ...s }));
        const playerA = slotA.player;
        const rankA = slotA.optionRank;
        const playerB = slotB.player;
        const rankB = slotB.optionRank;
        newSlots[indexA] = { ...newSlots[indexA]!, player: playerB, optionRank: rankB, isSixthMan: false };
        newSlots[indexB] = { ...newSlots[indexB]!, player: playerA, optionRank: rankA, isSixthMan: false };
        // Sixth Man follows the player, but only if they land on the bench.
        let sixthExplicit = draftState.sixthManExplicit ?? false;
        if (sixthId) {
          const landsOn = newSlots.findIndex(s => s.player?.id === sixthId);
          if (landsOn >= 0 && newSlots[landsOn]?.role === 'bench') {
            newSlots[landsOn] = { ...newSlots[landsOn]!, isSixthMan: true };
          } else {
            sixthExplicit = false;
            notify.warning('Sixth Man moved to the starters. Pick a new bench Sixth Man.');
          }
        }
        set({
          draftState: {
            ...draftState,
            lineup: { slots: newSlots },
            error: null,
            sixthManExplicit: sixthExplicit,
            // Minutes follow the players through the swap (sum is preserved).
            minutes: (() => {
              const m = draftState.minutes;
              if (!m) return m ?? null;
              const next = { ...m };
              const aMins = next[playerA.id] ?? 0;
              next[playerA.id] = next[playerB.id] ?? 0;
              next[playerB.id] = aMins;
              return next;
            })(),
          },
        });
        notify.success(`${playerA.name} ⇄ ${playerB.name} swapped.`);
        return true;
      },

      ensureMinutesInitialized: () => {
        const { draftState } = get();
        if (draftState.minutes) return;
        if (!draftState.lineup.slots.every(s => s.player)) return;
        set({
          draftState: {
            ...draftState,
            minutes: buildDefaultMinutes(draftState.lineup.slots),
            minutesExplicit: false,
          },
        });
      },

      setPlayerMinutes: (playerId, mins) => {
        const { draftState } = get();
        const base = draftState.minutes ?? buildDefaultMinutes(draftState.lineup.slots);
        // Hard cap: one player's raise can never push the team total past 240.
        const othersSum = Object.entries(base)
          .filter(([id]) => id !== playerId)
          .reduce((t, [, v]) => t + (Number.isFinite(v) ? v : 0), 0);
        const clamped = Math.max(0, Math.min(48, Math.round(mins), TEAM_MINUTES_TARGET - othersSum));
        set({
          draftState: {
            ...draftState,
            minutes: { ...base, [playerId]: clamped },
            minutesExplicit: true,
            error: null,
          },
        });
      },

      applyMinutesPreset: (preset) => {
        const { draftState } = get();
        const slots = draftState.lineup.slots;
        if (!slots.every(s => s.player)) return;
        // Short rotations ride the starters + Sixth and stash the rest as DNP
        // foul cover. Every row sums to 240.
        const rotationPreset = (starterMins: number, sixthMins: number, benchMins: number[]): MinutesMap | null => {
          const sixthId = slots.find(s => s.isSixthMan && s.player)?.player?.id ?? null;
          if (!sixthId) {
            notify.warning('Pick a Sixth Man first. Falling back to default minutes.');
            return null;
          }
          const next: MinutesMap = {};
          const benchOthers = slots
            .filter(s => s.role === 'bench' && s.player && s.player.id !== sixthId)
            .sort((a, b) => (b.player?.overall ?? 0) - (a.player?.overall ?? 0));
          const rotationBench = benchOthers.slice(0, benchMins.length);
          const benchLoad = new Map(rotationBench.map((s, k) => [s.player!.id, benchMins[k] ?? 0]));
          slots.forEach(s => {
            if (!s.player) return;
            if (s.role !== 'bench') next[s.player.id] = starterMins;
            else if (s.player.id === sixthId) next[s.player.id] = sixthMins;
            else next[s.player.id] = benchLoad.get(s.player.id) ?? 0;
          });
          return next;
        };
        let next: MinutesMap;
        if (preset === 'balanced') {
          next = {};
          slots.forEach(s => { if (s.player) next[s.player.id] = 24; });
        } else if (preset === 'seven') {
          next = rotationPreset(38, 26, [24]) ?? buildDefaultMinutes(slots);
        } else if (preset === 'eight') {
          next = rotationPreset(36, 26, [17, 17]) ?? buildDefaultMinutes(slots);
        } else if (preset === 'nine') {
          next = rotationPreset(32, 24, [19, 19, 18]) ?? buildDefaultMinutes(slots);
        } else {
          next = buildDefaultMinutes(slots);
        }
        set({
          draftState: {
            ...draftState,
            minutes: next,
            minutesExplicit: true,
            error: null,
          },
        });
        notify.success(`Minutes preset applied (${preset}). Total ${Math.round(minutesSum(next))}/240.`);
      },

      resetMinutesToDefault: () => {
        const { draftState } = get();
        if (!draftState.lineup.slots.every(s => s.player)) return;
        set({
          draftState: {
            ...draftState,
            minutes: buildDefaultMinutes(draftState.lineup.slots),
            minutesExplicit: false,
            error: null,
          },
        });
      },

      rebalanceMinutes: () => {
        const { draftState } = get();
        const current = draftState.minutes;
        if (!current) {
          get().ensureMinutesInitialized();
          return;
        }
        const ids = Object.keys(current);
        const sum = minutesSum(current);
        let next: MinutesMap;
        if (!(sum > 0)) {
          next = buildDefaultMinutes(draftState.lineup.slots);
        } else {
          const scaled: MinutesMap = {};
          // Zeros stay zero (DNP cover preserved); nonzero shares stretch to 240.
          ids.forEach(id => {
            scaled[id] = (current[id] ?? 0) > 0 ? (current[id] ?? 0) / sum * TEAM_MINUTES_TARGET : 0;
          });
          next = {};
          let total = 0;
          let largest = '';
          ids.forEach(id => {
            next[id] = Math.round(scaled[id] ?? 0);
            total += next[id]!;
            if (!largest || next[id]! > next[largest]!) largest = id;
          });
          if (largest) next[largest]! += TEAM_MINUTES_TARGET - total;
        }
        set({
          draftState: {
            ...draftState,
            minutes: next,
            error: null,
          },
        });
        notify.success(`Minutes rebalanced to ${Math.round(minutesSum(next))}/240.`);
      },

      clearLineup: () => {
        spinRequestId++;
        const { draftState } = get();
        set({
          draftState: {
            ...draftState,
            lineup: { slots: ROSTER_SLOTS.map(s => ({ position: s.position, player: null, role: s.role })) },
            draftedPlayers: [],
            draftedPersonKeys: [],
            currentRound: 1,
            pool: null,
            spinResult: null,
            availablePools: [],
            isSpinning: false,
            error: null,
            sixthManExplicit: false,
            optionsExplicit: { 1: false, 2: false, 3: false },
            minutes: null,
            minutesExplicit: false,
          },
        });
      },

      finalizeDraft: async () => {
        const { draftState } = get();
        const filledSlots = draftState.lineup.slots.filter(s => s.player).length;
        if (filledSlots < draftState.maxRounds) {
          const msg = `Fill all ${draftState.maxRounds} roster spots (5 starters + 5 bench) before finalizing`;
          set({ error: msg, draftState: { ...draftState, error: msg } });
          notify.warning(msg);
          return;
        }
        // Default the Sixth Man to the best bench player if the user skipped it.
        // Auto-picks stay flagged (!sixthManExplicit) so SeasonSetup shows AUTO + requires review.
        let slots = draftState.lineup.slots;
        let sixthExplicit = draftState.sixthManExplicit ?? false;
        if (!slots.some(s => s.isSixthMan && s.player)) {
          const benchFilled = slots
            .map((s, i) => ({ s, i }))
            .filter(({ s }) => s.role === 'bench' && s.player)
            .sort((a, b) => (b.s.player?.overall ?? 0) - (a.s.player?.overall ?? 0));
          if (benchFilled.length > 0) {
            const sixthIdx = benchFilled[0]!.i;
            slots = slots.map((s, i) => ({ ...s, isSixthMan: i === sixthIdx }));
            sixthExplicit = false;
          }
        }
        // Default 1st/2nd/3rd options to the best overall players if skipped.
        const beforeRanks = slots.map(s => s.optionRank);
        slots = ensureOptions(slots);
        const nextOptionsExplicit = { ...(draftState.optionsExplicit ?? { 1: false, 2: false, 3: false }) };
        slots.forEach((s, i) => {
          if (s.optionRank && !beforeRanks[i]) nextOptionsExplicit[s.optionRank] = false;
        });
        // Lineup locked — next stop is the season setup (era pick + rotation review).
        // Seed auto default minutes so the setup editor (and foul cover) has a base.
        const seedMinutes = draftState.minutes ?? buildDefaultMinutes(slots);
        set({ phase: 'season-setup', error: null, draftState: { ...draftState, lineup: { slots }, sixthManExplicit: sixthExplicit, optionsExplicit: nextOptionsExplicit, minutes: seedMinutes, minutesExplicit: draftState.minutes ? (draftState.minutesExplicit ?? false) : false } });
      },

      runSimulation: async () => {
        const { draftState } = get();
        const players = draftState.lineup.slots.map(s => s.player).filter((p): p is Player => p !== null);
        if (players.length < draftState.maxRounds) {
          set({ error: `Fill all ${draftState.maxRounds} roster spots before simulating`, phase: 'draft' });
          return;
        }
        if (!isMinutesValid(draftState.lineup.slots, draftState.minutes)) {
          const msg = `Minutes must total 240 before simulating (now ${Math.round(minutesSum(draftState.minutes))}).`;
          set({ error: msg, draftState: { ...draftState, error: msg } });
          notify.warning(msg);
          return;
        }
        // Rotation locks at sim time: whatever Sixth Man, options and minutes
        // are set right now is what the season runs with.
        const sixthSlot = draftState.lineup.slots.find(s => s.isSixthMan && s.player);
        const sixthManId = sixthSlot?.player?.id;
        const options = getOptionsFromSlots(draftState.lineup.slots);
        set({ isLoading: true, error: null });

        try {
          const era = get().selectedEra ?? null;
          const data = await api.simulation.runSeason(players, undefined, era, sixthManId, options, draftState.minutes ?? null);

          set({ simulationResult: { ...(data.result as SimulationResult), sixthManId: sixthManId ?? null, optionIds: options }, phase: 'results', isLoading: false });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : String(error), isLoading: false, phase: 'results' });
        }
      },

      startVSMode: async (historicalTeamId, seriesLength) => {
        const { draftState } = get();
        const players = draftState.lineup.slots.map(s => s.player).filter((p): p is Player => p !== null);
        if (players.length < draftState.maxRounds) {
          const msg = `Fill all ${draftState.maxRounds} roster spots before VS Mode`;
          set({ error: msg });
          notify.warning(msg);
          return;
        }
        const sixthSlot = draftState.lineup.slots.find(s => s.isSixthMan && s.player);
        const sixthManId = sixthSlot?.player?.id;
        const options = getOptionsFromSlots(draftState.lineup.slots);
        set({ isLoading: true, error: null });

        try {
          const data = await api.simulation.runVSMode(players, historicalTeamId, seriesLength, sixthManId, options, draftState.minutes ?? null);

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
          hasSeenWelcome: true,
          draftState: createInitialDraftState(),
          simulationResult: null,
          vsMatchup: null,
          selectedEra: null,
          playoffProgress: null,
          error: null,
        });
      },
    }),
    {
      name: 'court-draft-sim-store',
      version: 12,
      partialize: (state) => ({
        phase: state.phase === 'simulation' || state.phase === 'season-setup' ? 'draft' : state.phase,
        hasSeenWelcome: (state as { hasSeenWelcome?: boolean }).hasSeenWelcome ?? false,
        draftState: {
          ...state.draftState,
          isSpinning: false,
          error: null,
          availablePools: state.draftState.availablePools.slice(-10),
        },
        simulationResult: state.simulationResult,
        vsMatchup: state.vsMatchup,
        selectedEra: (state as { selectedEra?: string | null }).selectedEra ?? null,
        playoffProgress: (state as { playoffProgress?: PlayoffProgress | null }).playoffProgress ?? null,
      } as unknown as GameStore),
      migrate: (persisted: unknown, version: number) => {
        if (typeof persisted !== 'object' || persisted === null) {
          return persisted as GameStore;
        }
        const p = persisted as { draftState?: Partial<DraftState>; hasSeenWelcome?: boolean; phase?: string };
        // v11 -> v12: welcome landing. Returning players skip the gate.
        if (typeof p.hasSeenWelcome !== 'boolean') {
          const slots = (p.draftState as unknown as { lineup?: { slots?: Array<{ player?: unknown }> } })?.lineup?.slots;
          const hasProgress = Array.isArray(slots) && slots.some(s => s?.player != null);
          p.hasSeenWelcome = hasProgress || (p.phase != null && p.phase !== 'welcome');
        }
        if (p.phase === 'simulation' || p.phase === 'season-setup') {
          p.phase = 'draft';
        }
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
          // v6 -> v7: 5-man lineups expand to 10 (5 starters + 5 bench).
          const lineup = (p.draftState as { lineup?: { slots?: Array<{ position: string; player: unknown; role?: string; isSixthMan?: boolean }> } }).lineup;
          if (lineup && Array.isArray(lineup.slots) && lineup.slots.length === 5) {
            const starters = lineup.slots.map(s => ({ ...s, role: 'starter' as const }));
            const bench = (['PG', 'SG', 'SF', 'PF', 'C'] as const).map(pos => ({ position: pos, player: null, role: 'bench' as const }));
            lineup.slots = [...starters, ...bench] as typeof lineup.slots;
          }
          // v7 -> v8: track same-person keys so other-era versions can't be drafted.
          if (!Array.isArray(p.draftState.draftedPersonKeys)) {
            const rawSlots = p.draftState.lineup as unknown as { slots?: Array<{ player?: { id: string; name: string } | null }> };
            const slots = Array.isArray(rawSlots?.slots) ? rawSlots.slots : [];
            p.draftState.draftedPersonKeys = slots
              .map(s => s.player)
              .filter((pl): pl is { id: string; name: string } => !!pl)
              .map(pl => personKeyOf(pl));
          }
          if (typeof p.draftState.maxRounds !== 'number' || (p.draftState.maxRounds as number) < MAX_ROSTER_SIZE) {
            p.draftState.maxRounds = MAX_ROSTER_SIZE;
          }
          if (typeof p.draftState.currentRound !== 'number') {
            p.draftState.currentRound = 1;
          }
          // v10 -> v11: confirm gate removed — sim locks the rotation instead.
          delete (p.draftState as Record<string, unknown>).rotationConfirmed;
          if (typeof p.draftState.sixthManExplicit !== 'boolean') {
            p.draftState.sixthManExplicit = false;
          }
          if (typeof p.draftState.optionsExplicit !== 'object' || p.draftState.optionsExplicit === null) {
            p.draftState.optionsExplicit = { 1: false, 2: false, 3: false };
          }
          // v9 -> v10: custom minutes — old saves start uninitialized (setup seeds defaults).
          if (!('minutes' in (p.draftState as object)) || typeof p.draftState.minutes === 'undefined') {
            p.draftState.minutes = null;
          }
          if (typeof p.draftState.minutesExplicit !== 'boolean') {
            p.draftState.minutesExplicit = false;
          }
        }
        return persisted as GameStore;
      },
    }
  )
);
