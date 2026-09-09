/**
 * Offline engine — the SAME server services/data, executed in-browser when the
 * API is unreachable (airplane mode, dead server, static-only hosting).
 * Result shapes match the API exactly (via the shared `formatSeasonResult`
 * and the route-mirrored builders below), so the UI can't tell the difference.
 */
import type {
  DraftPool as ClientPool,
  EraInfo,
  HistoricalTeam as ClientTeam,
  MinutesMap,
  Player as ClientPlayer,
  PlayoffGameResult,
  Position,
  SimulationResult,
  VSModeMatchup,
} from '../types/game';
import type { Player as ServerPlayer, SimulationConfig } from '@server/types/game.js';
import {
  spinForDraftPool,
  rerollDraftPool,
  getDraftPool,
  getFranchiseInfo,
  getDecadeInfo,
  generateAllDraftPools,
} from '@server/services/draftPool.js';
import { FRANCHISES, DECADES } from '@server/data/constants.js';
import { getAllHistoricalTeams } from '@server/data/historicalTeams.js';
import { getEraLeague, getAllEraLeagues } from '@server/services/eraRosters.js';
import { generateOpponentPools } from '@server/services/opponents.js';
import { formatSeasonResult } from '@server/services/seasonResult.js';
import {
  simulateSeason,
  simulateSingleGame,
  getTeamStrength,
  getBaseTeamImpact,
  strengthVsLeague,
  calculateNonLinearWinCurve,
  counterMinutesFor,
  defaultMinutesFor,
} from '@server/services/simulationEngine.js';
import { DEFAULT_SIMULATION_CONFIG, LEAGUE_AVG_IMPACT } from '@server/services/constants.js';

/** Positional height fallback for old saves missing heightIn (mirrors helpers). */
const HEIGHT_BASELINE: Record<Position, number> = { PG: 74, SG: 77, SF: 79, PF: 81, C: 83 };

type Options = { first?: string | null; second?: string | null; third?: string | null } | null | undefined;

function toServerPlayers(lineup: ClientPlayer[]): ServerPlayer[] {
  return lineup.map(p => ({
    ...p,
    heightIn: typeof p.heightIn === 'number' && Number.isFinite(p.heightIn) ? p.heightIn : HEIGHT_BASELINE[p.position],
  })) as ServerPlayer[];
}

function validateOptions(options: Options, players: { id: string }[]): string | null {
  if (!options) return null;
  const ids = [options.first, options.second, options.third].filter((id): id is string => !!id);
  if (new Set(ids).size !== ids.length) return 'Options must be unique players';
  const roster = new Set(players.map(p => p.id));
  for (const id of ids) {
    if (!roster.has(id)) return 'Options must be roster members';
  }
  return null;
}

function withMeta(pool: { franchise: string; decade: string; players: unknown[] }) {
  const franchiseInfo = getFranchiseInfo(pool.franchise);
  const decadeInfo = getDecadeInfo(pool.decade);
  return {
    ...pool,
    franchiseName: franchiseInfo?.name,
    franchiseColor: franchiseInfo?.color,
    decadeLabel: decadeInfo?.label,
    era: decadeInfo?.era,
  };
}

// --- Draft ---------------------------------------------------------------

export function localSpin(excludeFranchise?: string, excludeDecade?: string, needed?: Position[]): { pool: ClientPool } {
  const pool = spinForDraftPool(excludeFranchise, excludeDecade, needed as ServerPlayer['position'][] | undefined);
  return { pool: withMeta(pool) as unknown as ClientPool };
}

export function localReroll(keep: 'franchise' | 'decade', franchise: string, decade: string, needed?: Position[]): { pool: ClientPool } {
  const pool = rerollDraftPool(keep, franchise, decade, needed as ServerPlayer['position'][] | undefined);
  if (!pool) throw new Error(`No alternative ${keep === 'franchise' ? 'decade' : 'franchise'} available for this pool`);
  return { pool: withMeta(pool) as unknown as ClientPool };
}

export function localGetPool(franchise: string, decade: string): { pool: ClientPool } {
  const pool = getDraftPool(franchise, decade);
  if (!pool) throw new Error('Pool not found or too few players');
  return { pool: withMeta(pool) as unknown as ClientPool };
}

export function localGetPools(): { pools: Array<{ franchise: string; decade: string; franchiseName: string; decadeLabel: string; era: string; playerCount: number }> } {
  return {
    pools: generateAllDraftPools().map(pool => ({
      franchise: pool.franchise,
      decade: pool.decade,
      franchiseName: getFranchiseInfo(pool.franchise)?.name ?? pool.franchise,
      decadeLabel: getDecadeInfo(pool.decade)?.label ?? pool.decade,
      era: getDecadeInfo(pool.decade)?.era ?? '',
      playerCount: pool.players.length,
    })),
  };
}

export function localGetFranchises(): { franchises: unknown } {
  return { franchises: FRANCHISES };
}

export function localGetDecades(): { decades: unknown } {
  return { decades: DECADES };
}

// --- Reference lists -----------------------------------------------------

export function localGetHistoricalTeams(): { teams: ClientTeam[] } {
  return { teams: getAllHistoricalTeams() as unknown as ClientTeam[] };
}

export function localGetEras(): { eras: EraInfo[] } {
  return {
    eras: getAllEraLeagues().map(l => {
      const diff = l.avgImpact - LEAGUE_AVG_IMPACT;
      return {
        id: l.decade,
        label: l.label,
        era: l.era,
        range: l.range,
        teams: l.teamCount,
        avgOverall: Number(l.avgOverall.toFixed(1)),
        difficulty: diff < -4 ? 'Developing league' : diff < 0 ? 'Classic' : diff < 3 ? 'Golden age' : 'Superteam era',
      };
    }),
  };
}

// --- Simulation ----------------------------------------------------------

export function localRunSeason(
  lineup: ClientPlayer[],
  config?: Record<string, number>,
  era?: string | null,
  sixthManId?: string | null,
  options?: Options,
  minutes?: MinutesMap | null,
): { result: SimulationResult } {
  const players = toServerPlayers(lineup);
  if (sixthManId && players.length === 10 && !players.slice(5, 10).some(p => p.id === sixthManId)) {
    throw new Error('sixthManId must be a bench player (roster spots 6-10)');
  }
  const optionsError = validateOptions(options, players);
  if (optionsError) throw new Error(optionsError);

  let opponentPool: ServerPlayer[][];
  let opponentNames: string[];
  let eraMeta: { id: string; label: string } | null = null;
  let eraAvgImpact: number | undefined;
  if (era) {
    const league = getEraLeague(era);
    if (!league) throw new Error('Era not found');
    opponentPool = league.opponents.map(o => o.lineup);
    opponentNames = league.opponents.map(o => o.name);
    eraMeta = { id: league.decade, label: league.label };
    eraAvgImpact = league.avgImpact;
  } else {
    const generated = generateOpponentPools();
    opponentPool = generated.pools;
    opponentNames = generated.names;
  }
  const simulationConfig = { ...DEFAULT_SIMULATION_CONFIG, ...config } as SimulationConfig;
  const seasonResult = simulateSeason(players, opponentPool, simulationConfig, opponentNames, sixthManId ?? null, options ?? null, minutes ?? null);
  const teamStrength = getTeamStrength(players, sixthManId ?? null, options ?? null, minutes ?? null);
  const effectiveStrength = eraAvgImpact === undefined
    ? teamStrength
    : strengthVsLeague(getBaseTeamImpact(players, sixthManId ?? null, options ?? null, minutes ?? null), eraAvgImpact);
  const projectedWins = calculateNonLinearWinCurve(effectiveStrength);
  return { result: formatSeasonResult({ seasonResult, players, opponentPool, projectedWins, teamStrength, eraMeta }) as unknown as SimulationResult };
}

export function localRunGame(
  homeTeam: ClientPlayer[],
  awayTeam: ClientPlayer[],
  seriesGameNumber?: number,
  homeSixthManId?: string | null,
  awaySixthManId?: string | null,
  homeOptions?: Options,
  awayOptions?: Options,
  homeMinutes?: MinutesMap | null,
  awayMinutes?: MinutesMap | null,
): { result: PlayoffGameResult } {
  const homePlayers = toServerPlayers(homeTeam);
  const awayPlayers = toServerPlayers(awayTeam);
  const homeErr = validateOptions(homeOptions, homePlayers);
  if (homeErr) throw new Error(homeErr);
  const awayErr = validateOptions(awayOptions, awayPlayers);
  if (awayErr) throw new Error(awayErr);
  const out = simulateSingleGame({
    homeTeam: homePlayers,
    awayTeam: awayPlayers,
    config: { ...DEFAULT_SIMULATION_CONFIG, homeCourtAdvantage: 0 },
    seriesGameNumber,
    homeSixthManId: homeSixthManId ?? null,
    awaySixthManId: awaySixthManId ?? null,
    homeOptions: homeOptions ?? null,
    awayOptions: awayOptions ?? null,
    homeMinutes: homeMinutes ?? null,
    awayMinutes: awayMinutes ?? null,
  });
  return {
    result: {
      homeScore: out.homeScore,
      awayScore: out.awayScore,
      otPeriods: out.otPeriods,
      homePlayerStats: out.homePlayerStats,
      awayPlayerStats: out.awayPlayerStats,
      homeMinutes: out.homeMinutes,
      awayMinutes: out.awayMinutes,
      events: out.events,
    } as unknown as PlayoffGameResult,
  };
}

export function localRunVSMode(
  userLineup: ClientPlayer[],
  historicalTeamId: string,
  seriesLength: 1 | 7,
  sixthManId?: string | null,
  options?: Options,
  userMinutes?: MinutesMap | null,
): { result: VSModeMatchup } {
  const users = toServerPlayers(userLineup);
  const historicalTeam = getAllHistoricalTeams().find(t => t.id === historicalTeamId);
  if (!historicalTeam) throw new Error('Historical team not found');
  if (historicalTeam.players.length !== 10) throw new Error('Historical team data is incomplete');
  const historicalLineup = historicalTeam.players.slice(0, 10);
  const userSixth = sixthManId ?? null;
  const userOptions = options ?? null;
  const historicalMinutesPlan = userMinutes
    ? (() => {
        try {
          return counterMinutesFor(historicalLineup, users, userMinutes);
        } catch {
          return defaultMinutesFor(historicalLineup, null);
        }
      })()
    : null;
  if (userSixth && users.length === 10 && !users.slice(5, 10).some(p => p.id === userSixth)) {
    throw new Error('sixthManId must be a bench player (roster spots 6-10)');
  }
  const userOptionsError = validateOptions(userOptions, users);
  if (userOptionsError) throw new Error(userOptionsError);

  const seriesResults: Array<{
    gameNumber: number;
    winner: 'user' | 'historical';
    score: { user: number; historical: number };
    otPeriods: number;
    boxScore: { user: unknown[]; historical: unknown[] };
  }> = [];
  let userWins = 0;
  let historicalWins = 0;
  const maxGames = seriesLength === 7 ? 7 : 1;
  for (let gameNum = 1; gameNum <= maxGames; gameNum++) {
    const isHome = gameNum % 2 === 1;
    const gameResult = simulateSingleGame({
      homeTeam: (isHome ? users : historicalLineup) as ServerPlayer[],
      awayTeam: (isHome ? historicalLineup : users) as ServerPlayer[],
      config: DEFAULT_SIMULATION_CONFIG,
      seriesGameNumber: seriesLength === 7 ? gameNum : undefined,
      homeSixthManId: isHome ? userSixth : null,
      awaySixthManId: isHome ? null : userSixth,
      homeOptions: isHome ? userOptions : null,
      awayOptions: isHome ? null : userOptions,
      homeMinutes: isHome ? (userMinutes ?? null) : historicalMinutesPlan,
      awayMinutes: isHome ? historicalMinutesPlan : (userMinutes ?? null),
    });
    const userScore = isHome ? gameResult.homeScore : gameResult.awayScore;
    const historicalScore = isHome ? gameResult.awayScore : gameResult.homeScore;
    const winner = userScore > historicalScore ? 'user' : userScore < historicalScore ? 'historical' : 'user';
    if (winner === 'user') userWins++;
    else historicalWins++;
    const userStats = isHome ? gameResult.homePlayerStats : gameResult.awayPlayerStats;
    const historicalStats = isHome ? gameResult.awayPlayerStats : gameResult.homePlayerStats;
    const userMins = isHome ? gameResult.homeMinutes : gameResult.awayMinutes;
    const historicalMins = isHome ? gameResult.awayMinutes : gameResult.homeMinutes;
    seriesResults.push({
      gameNumber: gameNum,
      winner,
      score: { user: userScore, historical: historicalScore },
      otPeriods: gameResult.otPeriods,
      boxScore: {
        user: Object.entries(userStats).map(([playerId, stats]) => {
          const player = users.find(p => p.id === playerId);
          return { playerId, playerName: player?.name || playerId, stats, minutes: userMins[playerId] ?? 40 };
        }),
        historical: Object.entries(historicalStats).map(([playerId, stats]) => {
          const player = historicalLineup.find(p => p.id === playerId);
          return { playerId, playerName: player?.name || playerId, stats, minutes: historicalMins[playerId] ?? 40 };
        }),
      },
    });
    if (seriesLength === 7 && (userWins === 4 || historicalWins === 4)) break;
  }

  return {
    result: {
      userLineup: { slots: users.map((p, i) => ({ position: p.position, player: p, role: i < 5 ? 'starter' : 'bench', ...(userSixth && p.id === userSixth ? { isSixthMan: true } : {}), ...(userOptions?.first === p.id ? { optionRank: 1 as const } : userOptions?.second === p.id ? { optionRank: 2 as const } : userOptions?.third === p.id ? { optionRank: 3 as const } : {}) })) },
      historicalTeam: {
        id: historicalTeam.id,
        name: historicalTeam.name,
        season: historicalTeam.season,
        record: historicalTeam.record,
        championships: historicalTeam.championships,
        description: historicalTeam.description,
        players: historicalLineup,
      },
      seriesLength,
      userWins,
      historicalWins,
      seriesWinner: userWins > historicalWins ? 'user' : 'historical',
      cpuMinutes: historicalMinutesPlan,
      results: seriesResults,
      games: seriesResults,
    } as unknown as VSModeMatchup,
  };
}
