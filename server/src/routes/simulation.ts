import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { simulateSeason, getTeamStrength, getBaseTeamImpact, strengthVsLeague, calculateNonLinearWinCurve, simulateSingleGame } from '../services/simulationEngine.js';
import { DEFAULT_SIMULATION_CONFIG, SIMULATION_CONSTANTS, LEAGUE_AVG_IMPACT } from '../services/constants.js';
import { getEraLeague, getAllEraLeagues } from '../services/eraRosters.js';
import { DECADES } from '../data/constants.js';
import { Player, Position, getPlayerPositions } from '../types/game.js';
import { getAllHistoricalTeams } from '../data/historicalTeams.js';
import { randomInt } from 'node:crypto';

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
});

const playerSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  position: z.enum(['PG', 'SG', 'SF', 'PF', 'C']),
  secondaryPositions: z.array(z.enum(['PG', 'SG', 'SF', 'PF', 'C'])).max(4).optional(),
  heightIn: z.number().int().min(60).max(95),
  team: z.string().min(1).max(50),
  decade: z.string().min(1).max(20),
  era: z.string().min(1).max(50),
  stats: playerStatsSchema,
  overall: z.number().finite().min(0).max(100),
  archetype: z.string().min(1).max(50),
});

// A legal lineup covers all 5 slots counting versatility (bipartite match),
// so e.g. Garnett (PF/C) can cover either big slot.
function lineupCoversAllPositions(lineup: Array<{ position: Position; secondaryPositions?: Position[] }>): boolean {
  const slots: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const matchToPlayer = new Map<Position, number>();
  const tryAssign = (playerIdx: number, seen: Set<Position>): boolean => {
    const p = lineup[playerIdx]!;
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
  for (let i = 0; i < lineup.length; i++) {
    if (!tryAssign(i, new Set())) return false;
  }
  return matchToPlayer.size === 5 && slots.every(s => matchToPlayer.has(s));
}

const lineupSchema = z.array(playerSchema).length(5)
  .refine(
    (lineup) => new Set(lineup.map(p => p.id)).size === 5,
    { message: 'Lineup must have 5 unique players' }
  )
  .refine(
    (lineup) => lineupCoversAllPositions(lineup),
    { message: 'Lineup must be able to cover all 5 positions (counting secondary positions)' }
  );

const simulateSeasonSchema = z.object({
  lineup: lineupSchema,
  // Optional era (decade id). Omit for the default mixed modern league.
  era: z.enum(DECADES.map(d => d.id) as unknown as [string, ...string[]]).optional(),
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
});

const vsModeSchema = z.object({
  userLineup: lineupSchema,
  historicalTeamId: z.string().min(1).max(50),
  seriesLength: z.union([z.literal(1), z.literal(7)]),
});

router.get('/eras', (req: Request, res: Response) => {
  const leagues = getAllEraLeagues().map(l => {
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

router.post('/season', seasonLimiter, (req: Request, res: Response) => {
  const result = simulateSeasonSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request', details: result.error.flatten() });
  }

  const { lineup, era, config } = result.data;
  const players = lineup as Player[];

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

  const seasonResult = simulateSeason(players, opponentPool, simulationConfig, opponentNames);
  const teamStrength = getTeamStrength(players);
  // Project against the league actually played: era leagues differ in
  // strength (a 60s season is easier than a modern one), so the same
  // roster projects differently per era.
  const effectiveStrength = eraAvgImpact === undefined
    ? teamStrength
    : strengthVsLeague(getBaseTeamImpact(players), eraAvgImpact);
  const projectedWins = calculateNonLinearWinCurve(effectiveStrength);

  const formattedResult = {
    wins: seasonResult.wins,
    losses: seasonResult.losses,
    winPct: Number((seasonResult.wins / SIMULATION_CONSTANTS.MAX_GAMES).toFixed(3)),
    projectedWins,
    teamStrength,
    era: eraMeta,
    games: seasonResult.games.map(g => ({
      gameNumber: g.gameNumber,
      opponent: g.opponent,
      isHome: g.isHome,
      result: g.result,
      score: g.score,
      otPeriods: g.otPeriods,
      playerPerformances: Object.entries(g.playerStats).map(([playerId, stats]) => {
        const player = players.find(p => p.id === playerId);
        return {
          playerId,
          playerName: player?.name ?? playerId,
          stats,
          minutes: g.userMinutes[playerId] ?? 40,
          position: player?.position,
          secondaryPositions: player?.secondaryPositions,
          overall: player?.overall,
          heightIn: player?.heightIn,
          team: 'Your Team',
          baseStats: player?.stats,
        };
      }),
      opponentPerformances: Object.entries(g.opponentPlayerStats).map(([playerId, stats]) => {
        const player = g.opponentRoster.find(p => p.playerId === playerId);
        return {
          playerId,
          playerName: player?.playerName ?? playerId,
          stats,
          minutes: g.opponentMinutes?.[playerId] ?? 40,
          position: player?.position,
          secondaryPositions: player?.secondaryPositions,
          overall: player?.overall,
          heightIn: player?.heightIn,
          team: g.opponent,
          baseStats: player?.baseStats,
        };
      }),
    })),
    playerStats: Object.values(seasonResult.playerSeasonStats).map(s => {
      const base = players.find(p => p.id === s.playerId);
      return {
        playerId: s.playerId,
        playerName: s.playerName,
        gamesPlayed: s.gamesPlayed,
        minutesPerGame: s.minutesPerGame,
        averages: s.averages,
        totals: s.totals,
        highGames: s.highGames,
        position: base?.position,
        secondaryPositions: base?.secondaryPositions,
        overall: base?.overall,
        heightIn: base?.heightIn,
        team: 'Your Team',
        baseStats: base?.stats,
      };
    }),
    teamStats: seasonResult.teamStats,
    standings: seasonResult.standings,
    opponentPlayerStats: Object.values(seasonResult.opponentPlayerSeasonStats).map(s => {
      const player = opponentPool.flat().find(p => p.id === s.playerId);
      return {
        playerId: s.playerId,
        playerName: s.playerName,
        gamesPlayed: s.gamesPlayed,
        minutesPerGame: s.minutesPerGame,
        averages: s.averages,
        totals: s.totals,
        highGames: s.highGames,
        position: player?.position,
        secondaryPositions: player?.secondaryPositions,
        overall: player?.overall,
        heightIn: player?.heightIn,
        team: player?.team ?? 'Opponent',
        baseStats: player?.stats,
      };
    }),
  };

  res.json({ result: formattedResult });
});

router.post('/game', gameLimiter, (req: Request, res: Response) => {
  const result = simulateGameSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request', details: result.error.flatten() });
  }

  const { homeTeam, awayTeam } = result.data;
  try {
    const gameResult = simulateSingleGame({
      homeTeam: homeTeam as Player[],
      awayTeam: awayTeam as Player[],
      // Neutral court: the playoff modal always passes you as homeTeam, so any
      // home edge would inflate your win odds every game. Background sims keep
      // their alternating 2-2-1-1-1 edge; this series stays fair.
      config: { ...DEFAULT_SIMULATION_CONFIG, homeCourtAdvantage: 0 },
    });

    res.json({
      result: {
        homeScore: gameResult.homeScore,
        awayScore: gameResult.awayScore,
        otPeriods: gameResult.otPeriods,
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

  const { userLineup, historicalTeamId, seriesLength } = result.data;
  const historicalTeam = getAllHistoricalTeams().find(t => t.id === historicalTeamId);

  if (!historicalTeam) {
    return res.status(404).json({ error: 'Historical team not found' });
  }

  if (historicalTeam.players.length !== 5) {
    return res.status(500).json({ error: 'Historical team data is incomplete' });
  }

  const historicalLineup = historicalTeam.players.slice(0, 5) as Player[];

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
    });

    const userScore = isHome ? gameResult.homeScore : gameResult.awayScore;
    const historicalScore = isHome ? gameResult.awayScore : gameResult.homeScore;
    // Overtime guarantees no ties, but handle defensively.
    const winner = userScore > historicalScore ? 'user' : userScore < historicalScore ? 'historical' : 'user';

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
      userLineup: { slots: (userLineup as Player[]).map((p, i) => ({ position: p.position, player: p })) },
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
      results: seriesResults,
      // Aliases for older clients:
      games: seriesResults,
    },
  });
});

router.get('/historical-teams', (req: Request, res: Response) => {
  const teams = getAllHistoricalTeams().map(t => ({
    id: t.id,
    name: t.name,
    season: t.season,
    record: t.record,
    championships: t.championships,
    description: t.description,
    players: t.players.slice(0, 5).map(p => ({
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

const OPPONENT_NAMES = [
  'Chicago Bulls', 'Boston Celtics', 'LA Lakers', 'Miami Heat', 'Dallas Mavericks',
  'Phoenix Suns', 'Denver Nuggets', 'Milwaukee Bucks', 'Philadelphia 76ers', 'New York Knicks',
  'Golden State Warriors', 'San Antonio Spurs', 'Houston Rockets', 'OKC Thunder', 'Utah Jazz',
  'Portland Trail Blazers', 'Sacramento Kings', 'Atlanta Hawks', 'Toronto Raptors', 'Detroit Pistons',
  'Cleveland Cavaliers', 'Indiana Pacers', 'Orlando Magic', 'Brooklyn Nets', 'LA Clippers',
  'Memphis Grizzlies', 'New Orleans Pelicans', 'Minnesota Timberwolves', 'Charlotte Hornets', 'Washington Wizards',
];

function randomStat(min: number, max: number): number {
  return min + (randomInt(1_000_000) / 1_000_000) * (max - min);
}

/** Exported for calibration scripts (recompute LEAGUE_AVG_IMPACT if the model changes). */
export function generateOpponentPools(): { pools: Player[][]; names: string[] } {
  const pools: Player[][] = [];

  // 30 distinct 5-man opponents (150 unique players).
  // A top-heavy league like the real NBA: 24 regular starter-quality
  // pools plus 6 contender pools that can actually beat elite user teams,
  // so 82-0 stays possible but never automatic.
  // Mean base impact ~= LEAGUE_AVG_IMPACT (services/constants.ts), measured
  // empirically over generated pools. Keep them in sync if these ranges change.
  // Heights sit near positional averages so size is neutral for the league.
  const HEIGHT_RANGE: Record<Position, [number, number]> = {
    PG: [71, 75],
    SG: [74, 78],
    SF: [77, 81],
    PF: [79, 83],
    C: [81, 87],
  };
  for (let i = 0; i < 30; i++) {
    const pool: Player[] = [];
    const contender = i % 5 === 4;
    for (let j = 0; j < 5; j++) {
      const pos = (['PG', 'SG', 'SF', 'PF', 'C'] as Position[])[j]!;
      const overall = Math.round(contender ? randomStat(88, 96) : randomStat(74, 88));
      const span = contender ? 8 : 14;
      const floor = contender ? 88 : 74;
      const star = (overall - floor) / span; // 0..1
      pool.push({
        id: `opp-${i}-${j}`,
        name: `${OPPONENT_NAMES[i]} Player ${j + 1}`,
        position: pos,
        heightIn: Math.round(randomStat(HEIGHT_RANGE[pos][0], HEIGHT_RANGE[pos][1])),
        // Display schedule name (not a generic tag) so standings, bracket,
        // awards and playoff rosters can join on team.
        team: OPPONENT_NAMES[i]!,
        decade: '2020s',
        era: 'Current',
        stats: contender
          ? {
              pts: randomStat(18 + star * 6, 22 + star * 6),
              reb: randomStat(5 + star * 2, 8 + star * 3),
              ast: randomStat(4 + star * 2, 6 + star * 3),
              stl: randomStat(0.8, 1.2 + star * 0.8),
              blk: randomStat(0.4, 0.8 + star * 0.8),
            }
          : {
              pts: randomStat(12 + star * 6, 16 + star * 6),
              reb: randomStat(4 + star * 2, 7 + star * 3),
              ast: randomStat(3 + star * 2, 5 + star * 3),
              stl: randomStat(0.6, 1.0 + star * 0.8),
              blk: randomStat(0.3, 0.6 + star * 0.8),
            },
        overall,
        archetype: contender ? 'Star' : 'Role Player',
      });
    }
    pools.push(pool);
  }

  return { pools, names: [...OPPONENT_NAMES] };
}

export default router;
