import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { simulateSeason, getTeamStrength, getBaseTeamImpact, strengthVsLeague, calculateNonLinearWinCurve, simulateSingleGame, defaultMinutesFor, counterMinutesFor } from '../services/simulationEngine.js';
import { DEFAULT_SIMULATION_CONFIG, LEAGUE_AVG_IMPACT } from '../services/constants.js';
import { getEraLeague, getAllEraLeagues } from '../services/eraRosters.js';
import { DECADES } from '../data/constants.js';
import { Player, Position, getPlayerPositions, personKeyOf } from '../types/game.js';
import { getAllHistoricalTeams } from '../data/historicalTeams.js';
import { generateOpponentPools } from '../services/opponents.js';
import { formatSeasonResult } from '../services/seasonResult.js';

// Re-exported for calibration scripts (recompute LEAGUE_AVG_IMPACT if the model changes).
export { generateOpponentPools };

const router = Router();

// Per-endpoint budgets: a full 82-game season is the expensive call, while a
// playoff bracket legitimately plays dozens of cheap single games (every
// background CPU series is real games now), so /game gets real headroom.
const seasonLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many season simulations, slow down' },
});
const gameLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many game requests, slow down' },
});
const vsLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many VS-mode requests, slow down' },
});

const playerStatsSchema = z.object({
  pts: z.number().finite().min(0).max(50),
  reb: z.number().finite().min(0).max(30),
  ast: z.number().finite().min(0).max(20),
  stl: z.number().finite().min(0).max(8),
  blk: z.number().finite().min(0).max(10),
  pf: z.number().finite().min(0).max(6).optional().default(0),
});

const attributesSchema = z.object({
  closeShot: z.number().int().min(25).max(99).optional(),
  drivingLayup: z.number().int().min(25).max(99).optional(),
  drivingDunk: z.number().int().min(25).max(99).optional(),
  standingDunk: z.number().int().min(25).max(99).optional(),
  postControl: z.number().int().min(25).max(99).optional(),
  midRangeShot: z.number().int().min(25).max(99).optional(),
  threePointShot: z.number().int().min(25).max(99).optional(),
  freeThrow: z.number().int().min(25).max(99).optional(),
  passAccuracy: z.number().int().min(25).max(99).optional(),
  ballHandle: z.number().int().min(25).max(99).optional(),
  speedWithBall: z.number().int().min(25).max(99).optional(),
  interiorDefense: z.number().int().min(25).max(99).optional(),
  perimeterDefense: z.number().int().min(25).max(99).optional(),
  steal: z.number().int().min(25).max(99).optional(),
  block: z.number().int().min(25).max(99).optional(),
  offensiveRebound: z.number().int().min(25).max(99).optional(),
  defensiveRebound: z.number().int().min(25).max(99).optional(),
  speed: z.number().int().min(25).max(99).optional(),
  agility: z.number().int().min(25).max(99).optional(),
  strength: z.number().int().min(25).max(99).optional(),
  vertical: z.number().int().min(25).max(99).optional(),
  stamina: z.number().int().min(25).max(99).optional(),
  shotIq: z.number().int().min(25).max(99).optional(),
  passPerception: z.number().int().min(25).max(99).optional(),
  defensiveConsistency: z.number().int().min(25).max(99).optional(),
  offensiveConsistency: z.number().int().min(25).max(99).optional(),
  helpDefenseIq: z.number().int().min(25).max(99).optional(),
  intangibles: z.number().int().min(25).max(99).optional(),
  potential: z.number().int().min(25).max(99).optional(),
}).optional();

const playerSchema = z.object({
  id: z.string().min(1).max(100).refine(s => !/[\r\n]/.test(s), { message: 'Invalid id' }),
  name: z.string().min(1).max(100).refine(s => !/[\r\n]/.test(s), { message: 'Invalid name' }),
  position: z.enum(['PG', 'SG', 'SF', 'PF', 'C']),
  secondaryPositions: z.array(z.enum(['PG', 'SG', 'SF', 'PF', 'C'])).max(4).optional(),
  heightIn: z.number().int().min(60).max(95),
  team: z.string().min(1).max(50),
  decade: z.string().min(1).max(20),
  era: z.string().min(1).max(50),
  stats: playerStatsSchema,
  overall: z.number().finite().min(40).max(99),
  archetype: z.string().min(1).max(50),
  imageUrl: z.string().max(500).optional(),
  pace: z.number().finite().min(80).max(115).optional(),
  tsPct: z.number().finite().min(0.3).max(0.75).optional(),
  tov: z.number().finite().min(0).max(8).optional(),
  usageRate: z.number().finite().min(0).max(45).optional(),
  defRating: z.number().finite().min(40).max(100).optional(),
  clutch: z.number().finite().min(40).max(100).optional(),
  ftr: z.number().finite().min(0).max(0.8).optional(),
  ftPct: z.number().finite().min(0.3).max(1).optional(),
  threePar: z.number().finite().min(0).max(0.7).optional(),
  foulProneness: z.number().finite().min(1).max(100).optional(),
  attributes: attributesSchema,
});

// A legal 5-man lineup covers all 5 slots counting versatility (bipartite match),
// so e.g. Garnett (PF/C) can cover either big slot.
// A legal 10-man rotation covers all 5 slots in starters (first 5) AND bench (last 5).
function lineupCoversAllPositions(lineup: Array<{ position: Position; secondaryPositions?: Position[] }>): boolean {
  const slots: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const covers = (group: Array<{ position: Position; secondaryPositions?: Position[] }>): boolean => {
    const matchToPlayer = new Map<Position, number>();
    const tryAssign = (playerIdx: number, seen: Set<Position>): boolean => {
      const p = group[playerIdx]!;
      for (const slot of getPlayerPositions(p)) {
        if (seen.has(slot)) continue;
        seen.add(slot);
        const occupant = matchToPlayer.get(slot);
        if (occupant === undefined || tryAssign(occupant, seen)) {
          matchToPlayer.set(slot, playerIdx);
          return true;
        }
      }
      return false;
    };
    for (let i = 0; i < group.length; i++) {
      if (!tryAssign(i, new Set())) return false;
    }
    return matchToPlayer.size === 5 && slots.every(s => matchToPlayer.has(s));
  };
  if (lineup.length === 5) return covers(lineup);
  if (lineup.length === 10) return covers(lineup.slice(0, 5)) && covers(lineup.slice(5, 10));
  return false;
}

const sixthManSchema = z.string().min(1).max(100).nullable().optional();

/** Custom minutes plan: player ID -> regulation minutes (0-48). The engine
 * normalizes the total to 240, so slightly-off clients still simulate. */
const minutesSchema = z.record(z.string().min(1).max(100), z.number().finite().min(0).max(48)).optional();

const optionsSchema = z.object({
  first: z.string().min(1).max(100).nullable().optional(),
  second: z.string().min(1).max(100).nullable().optional(),
  third: z.string().min(1).max(100).nullable().optional(),
}).optional();

/** Options must reference unique roster members. */
function validateOptions(
  options: { first?: string | null; second?: string | null; third?: string | null } | null | undefined,
  players: Player[]
): string | null {
  if (!options) return null;
  const ids = [options.first, options.second, options.third].filter((id): id is string => !!id);
  if (new Set(ids).size !== ids.length) return 'Options must be unique players';
  const roster = new Set(players.map(p => p.id));
  for (const id of ids) {
    if (!roster.has(id)) return 'Options must be roster members';
  }
  return null;
}

const lineupSchema = z.array(playerSchema).min(5).max(10)
  .refine(
    (lineup) => lineup.length === 5 || lineup.length === 10,
    { message: 'Lineup must have 5 starters or 10 players (starters + bench)' }
  )
  .refine(
    (lineup) => new Set(lineup.map(p => p.id)).size === lineup.length,
    { message: 'Lineup must have unique players' }
  )
  .refine(
    (lineup) => new Set(lineup.map(p => personKeyOf(p))).size === lineup.length,
    { message: 'Lineup must not contain the same player twice (different eras count as the same player)' }
  )
  .refine(
    (lineup) => {
      // Block namesake-joker spoofing: a known namesake id must carry its
      // real display name (e.g. Johnny Davis). Otherwise an attacker can
      // smuggle a duplicate superstar under a joker id.
      const expected = new Map([
        ['johnny-davis-20s', 'johnny davis'],
        ['gerald-henderson-10s', 'gerald henderson'],
      ]);
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
      for (const p of lineup) {
        const want = expected.get(p.id);
        if (want && norm(p.name) !== want && !norm(p.name).startsWith(want)) return false;
      }
      // Even with valid names, identical display names from different ids
      // are only allowed for the known namesake pairs above.
      const byName = new Map<string, string[]>();
      for (const p of lineup) {
        const k = norm(p.name);
        byName.set(k, [...(byName.get(k) ?? []), p.id]);
      }
      for (const ids of byName.values()) {
        if (ids.length > 1 && !ids.every(id => expected.has(id))) return false;
      }
      return true;
    },
    { message: 'Invalid namesake player name' }
  )
  .refine(
    (lineup) => lineupCoversAllPositions(lineup),
    { message: 'Lineup must be able to cover all 5 positions in starters (and bench if 10-man), counting secondary positions' }
  );

const simulateSeasonSchema = z.object({
  lineup: lineupSchema,
  // Optional era (decade id). Omit for the default mixed modern league.
  era: z.enum(DECADES.map(d => d.id) as unknown as [string, ...string[]]).optional(),
  // 10-man rotation Sixth Man (must be a bench player ID when provided).
  sixthManId: sixthManSchema,
  // 1st/2nd/3rd offensive options (must be unique roster members).
  options: optionsSchema,
  // Custom minutes plan (enables 6-foul ejections + DNP cover). Omit for legacy.
  minutes: minutesSchema,
  config: z.object({
    variance: z.number().finite().min(0).max(1).optional(),
    homeCourtAdvantage: z.number().finite().min(0).max(0.2).optional(),
    fatigueFactor: z.number().finite().min(0).max(1).optional(),
    injuryRisk: z.number().finite().min(0).max(0.5).optional(),
  }).optional(),
});

const simulateGameSchema = z.object({
  homeTeam: lineupSchema,
  awayTeam: lineupSchema,
  homeSixthManId: sixthManSchema,
  awaySixthManId: sixthManSchema,
  homeOptions: optionsSchema,
  awayOptions: optionsSchema,
  homeMinutes: minutesSchema,
  awayMinutes: minutesSchema,
  // 1-based game number within a best-of-7 (coaching adaptation past Game 1).
  seriesGameNumber: z.number().int().min(1).max(7).optional(),
});

const vsModeSchema = z.object({
  userLineup: lineupSchema,
  sixthManId: sixthManSchema,
  options: optionsSchema,
  userMinutes: minutesSchema,
  historicalTeamId: z.string().min(1).max(50),
  seriesLength: z.union([z.literal(1), z.literal(7)]),
});

router.get('/eras', (req: Request, res: Response) => {
  const leagues = getAllEraLeaguesCached().map(l => {
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
  });
  res.json({ eras: leagues });
});

// Memoize era leagues: exhaustive C(n,5) search per request is a DoS vector.
let eraLeaguesCache: ReturnType<typeof getAllEraLeagues> | null = null;
let eraLeaguesCachedAt = 0;
const ERA_CACHE_TTL_MS = 5 * 60_000;
function getAllEraLeaguesCached() {
  const now = Date.now();
  if (!eraLeaguesCache || now - eraLeaguesCachedAt > ERA_CACHE_TTL_MS) {
    eraLeaguesCache = getAllEraLeagues();
    eraLeaguesCachedAt = now;
  }
  return eraLeaguesCache;
}

function validateMinutes(minutes: Record<string, number> | undefined, players: Player[]): string | null {
  if (!minutes) return null;
  const roster = new Set(players.map(p => p.id));
  const keys = Object.keys(minutes);
  if (keys.length === 0) return 'Minutes plan must not be empty';
  for (const k of keys) {
    if (!roster.has(k)) return `Minutes contain unknown player ${k}`;
  }
  return null;
}

router.post('/season', seasonLimiter, (req: Request, res: Response) => {
  const result = simulateSeasonSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request', details: result.error.flatten() });
  }

  const { lineup, era, config, sixthManId, options } = result.data;
  const players = lineup as Player[];
  const minutes = (result.data as { minutes?: Record<string, number> }).minutes ?? null;
  const minutesError = validateMinutes(minutes ?? undefined, players);
  if (minutesError) {
    return res.status(400).json({ error: minutesError });
  }

  // Sixth Man must be a bench player (indices 5-9) in 10-man rotations.
  // A 5-man roster with sixthManId is a client bug — reject, don't ignore.
  if (sixthManId && players.length === 5) {
    return res.status(400).json({ error: 'sixthManId requires a 10-man rotation' });
  }
  if (sixthManId && players.length === 10 && !players.slice(5, 10).some(p => p.id === sixthManId)) {
    return res.status(400).json({ error: 'sixthManId must be a bench player (roster spots 6-10)' });
  }
  const optionsError = validateOptions(options, players);
  if (optionsError) {
    return res.status(400).json({ error: optionsError });
  }

  // Era season: real historical lineups from that decade. Default: the
  // synthetic mixed modern league.
  let opponentPool: Player[][];
  let opponentNames: string[];
  let eraMeta: { id: string; label: string } | null = null;
  let eraAvgImpact: number | undefined;
  if (era) {
    const league = getEraLeague(era);
    if (!league) {
      return res.status(404).json({ error: 'Era not found' });
    }
    opponentPool = league.opponents.map(o => o.lineup);
    opponentNames = league.opponents.map(o => o.name);
    eraMeta = { id: league.decade, label: league.label };
    eraAvgImpact = league.avgImpact;
  } else {
    const generated = generateOpponentPools();
    opponentPool = generated.pools;
    opponentNames = generated.names;
  }
  const simulationConfig = { ...DEFAULT_SIMULATION_CONFIG, ...config };

  try {
    const seasonResult = simulateSeason(players, opponentPool, simulationConfig, opponentNames, sixthManId ?? null, options ?? null, minutes);
    const teamStrength = getTeamStrength(players, sixthManId ?? null, options ?? null, minutes);
    // Project against the league actually played: era leagues differ in
    // strength (a 60s season is easier than a modern one), so the same
    // roster projects differently per era.
    const effectiveStrength = eraAvgImpact === undefined
      ? teamStrength
      : strengthVsLeague(getBaseTeamImpact(players, sixthManId ?? null, options ?? null, minutes), eraAvgImpact);
    const projectedWins = calculateNonLinearWinCurve(effectiveStrength);

    const formattedResult = formatSeasonResult({
      seasonResult,
      players,
      opponentPool,
      projectedWins,
      teamStrength,
      eraMeta,
    });

    res.json({ result: formattedResult });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Simulation failed' });
  }
});

router.post('/game', gameLimiter, (req: Request, res: Response) => {
  const result = simulateGameSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request', details: result.error.flatten() });
  }

  const { homeTeam, awayTeam, seriesGameNumber, homeSixthManId, awaySixthManId, homeOptions, awayOptions } = result.data;
  const homePlayers = homeTeam as Player[];
  const awayPlayers = awayTeam as Player[];
  const homeMinutes = (result.data as { homeMinutes?: Record<string, number> }).homeMinutes ?? null;
  const awayMinutes = (result.data as { awayMinutes?: Record<string, number> }).awayMinutes ?? null;
  const homeOptionsError = validateOptions(homeOptions, homePlayers);
  if (homeOptionsError) {
    return res.status(400).json({ error: homeOptionsError });
  }
  const awayOptionsError = validateOptions(awayOptions, awayPlayers);
  if (awayOptionsError) {
    return res.status(400).json({ error: awayOptionsError });
  }
  const homeMinError = validateMinutes(homeMinutes ?? undefined, homePlayers);
  if (homeMinError) return res.status(400).json({ error: homeMinError });
  const awayMinError = validateMinutes(awayMinutes ?? undefined, awayPlayers);
  if (awayMinError) return res.status(400).json({ error: awayMinError });
  try {
    const gameResult = simulateSingleGame({
      homeTeam: homePlayers,
      awayTeam: awayPlayers,
      // Neutral court: the playoff modal always passes you as homeTeam, so any
      // home edge would inflate your win odds every game. Venue alternation is
      // handled caller-side; this series stays fair.
      config: { ...DEFAULT_SIMULATION_CONFIG, homeCourtAdvantage: 0 },
      seriesGameNumber,
      homeSixthManId: homeSixthManId ?? null,
      awaySixthManId: awaySixthManId ?? null,
      homeOptions: homeOptions ?? null,
      awayOptions: awayOptions ?? null,
      homeMinutes: homeMinutes ?? null,
      awayMinutes: awayMinutes ?? null,
    });

    res.json({
      result: {
        homeScore: gameResult.homeScore,
        awayScore: gameResult.awayScore,
        otPeriods: gameResult.otPeriods,
        pace: gameResult.pace,
        homePlayerStats: gameResult.homePlayerStats,
        awayPlayerStats: gameResult.awayPlayerStats,
        homeMinutes: gameResult.homeMinutes,
        awayMinutes: gameResult.awayMinutes,
        events: gameResult.events,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid teams' });
  }
});

router.post('/vs-mode', vsLimiter, (req: Request, res: Response) => {
  const result = vsModeSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request', details: result.error.flatten() });
  }

  const { userLineup, historicalTeamId, seriesLength, sixthManId, options } = result.data;
  const userMinutesPlan = (result.data as { userMinutes?: Record<string, number> }).userMinutes ?? null;
  const historicalTeam = getAllHistoricalTeams().find(t => t.id === historicalTeamId);

  if (!historicalTeam) {
    return res.status(404).json({ error: 'Historical team not found' });
  }

  if (historicalTeam.players.length !== 10) {
    return res.status(500).json({ error: 'Historical team data is incomplete' });
  }

  const historicalLineup = historicalTeam.players.slice(0, 10) as Player[];
  const userSixth = sixthManId ?? null;
  const userOptions = options ?? null;
  // CPU counter: when the user brings a minutes plan, the legends tilt extra
  // run toward the slots where your minute-weighted usage is heaviest instead
  // of plain role defaults; otherwise both sides stay on the legacy rotation.
  const historicalMinutesPlan = userMinutesPlan
    ? (() => {
        try {
          return counterMinutesFor(historicalLineup, userLineup as Player[], userMinutesPlan);
        } catch {
          return defaultMinutesFor(historicalLineup, null);
        }
      })()
    : null;
  if (userSixth && (userLineup as Player[]).length === 5) {
    return res.status(400).json({ error: 'sixthManId requires a 10-man rotation' });
  }
  if (userSixth && (userLineup as Player[]).length === 10 && !(userLineup as Player[]).slice(5, 10).some(p => p.id === userSixth)) {
    return res.status(400).json({ error: 'sixthManId must be a bench player (roster spots 6-10)' });
  }
  const userOptionsError = validateOptions(userOptions, userLineup as Player[]);
  if (userOptionsError) {
    return res.status(400).json({ error: userOptionsError });
  }
  const userMinError = validateMinutes(userMinutesPlan ?? undefined, userLineup as Player[]);
  if (userMinError) {
    return res.status(400).json({ error: userMinError });
  }

  try {
  const seriesResults = [];
  let userWins = 0;
  let historicalWins = 0;

  const maxGames = seriesLength === 7 ? 7 : 1;
  for (let gameNum = 1; gameNum <= maxGames; gameNum++) {
    const isHome = gameNum % 2 === 1;

    const gameResult = simulateSingleGame({
      homeTeam: (isHome ? userLineup : historicalLineup) as Player[],
      awayTeam: (isHome ? historicalLineup : userLineup) as Player[],
      config: DEFAULT_SIMULATION_CONFIG,
      seriesGameNumber: seriesLength === 7 ? gameNum : undefined,
      homeSixthManId: isHome ? userSixth : null,
      awaySixthManId: isHome ? null : userSixth,
      homeOptions: isHome ? userOptions : null,
      awayOptions: isHome ? null : userOptions,
      homeMinutes: isHome ? userMinutesPlan : historicalMinutesPlan,
      awayMinutes: isHome ? historicalMinutesPlan : userMinutesPlan,
    });

    const userScore = isHome ? gameResult.homeScore : gameResult.awayScore;
    const historicalScore = isHome ? gameResult.awayScore : gameResult.homeScore;
    // Overtime guarantees no ties; a tie here is a defensive impossibility —
    // count it as a historical win to match single-game tie handling below
    // (single games report tie explicitly; series must advance someone).
    const winner = userScore > historicalScore ? 'user' : 'historical';

    if (winner === 'user') userWins++;
    else historicalWins++;

    const userStats = isHome ? gameResult.homePlayerStats : gameResult.awayPlayerStats;
    const historicalStats = isHome ? gameResult.awayPlayerStats : gameResult.homePlayerStats;
    const userMinutes = isHome ? gameResult.homeMinutes : gameResult.awayMinutes;
    const historicalMinutes = isHome ? gameResult.awayMinutes : gameResult.homeMinutes;

    seriesResults.push({
      gameNumber: gameNum,
      winner,
      score: { user: userScore, historical: historicalScore },
      otPeriods: gameResult.otPeriods,
      boxScore: {
        user: Object.entries(userStats).map(([playerId, stats]) => {
          const player = (userLineup as Player[]).find(p => p.id === playerId);
          return { playerId, playerName: player?.name || playerId, stats, minutes: userMinutes[playerId] ?? 40 };
        }),
        historical: Object.entries(historicalStats).map(([playerId, stats]) => {
          const player = historicalLineup.find(p => p.id === playerId);
          return { playerId, playerName: player?.name || playerId, stats, minutes: historicalMinutes[playerId] ?? 40 };
        }),
      },
    });

    if (seriesLength === 7 && (userWins === 4 || historicalWins === 4)) {
      break;
    }
  }

  res.json({
    result: {
      userLineup: { slots: (userLineup as Player[]).map((p, i) => ({ position: p.position, player: p, role: i < 5 ? 'starter' : 'bench', ...(userSixth && p.id === userSixth ? { isSixthMan: true } : {}), ...(userOptions?.first === p.id ? { optionRank: 1 as const } : userOptions?.second === p.id ? { optionRank: 2 as const } : userOptions?.third === p.id ? { optionRank: 3 as const } : {}) })) },
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
      // Aliases for older clients:
      games: seriesResults,
    },
  });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'VS simulation failed' });
  }
});

router.get('/historical-teams', (req: Request, res: Response) => {
  const teams = getAllHistoricalTeams().map(t => ({
    id: t.id,
    name: t.name,
    season: t.season,
    record: t.record,
    championships: t.championships,
    description: t.description,
    players: t.players.slice(0, 10).map(p => ({
      id: p.id,
      name: p.name,
      position: p.position,
      overall: p.overall,
      team: p.team,
      decade: p.decade,
      era: p.era,
      stats: p.stats,
      archetype: p.archetype,
    })),
  }));
  res.json({ teams });
});

export default router;
