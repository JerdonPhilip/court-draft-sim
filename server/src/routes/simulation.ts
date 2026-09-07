import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { simulateSeason, getTeamStrength, calculateNonLinearWinCurve, simulateSingleGame } from '../services/simulationEngine.js';
import { DEFAULT_SIMULATION_CONFIG, SIMULATION_CONSTANTS } from '../services/constants.js';
import { Player, Position, getPlayerPositions } from '../types/game.js';
import { getAllHistoricalTeams } from '../data/historicalTeams.js';
import { randomInt } from 'node:crypto';

const router = Router();

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

router.post('/season', (req: Request, res: Response) => {
  const result = simulateSeasonSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request', details: result.error.flatten() });
  }

  const { lineup, config } = result.data;
  const players = lineup as Player[];

  const { pools, names } = generateOpponentPools();
  const simulationConfig = { ...DEFAULT_SIMULATION_CONFIG, ...config };

  const seasonResult = simulateSeason(players, pools, simulationConfig, names);
  const teamStrength = getTeamStrength(players);
  const projectedWins = calculateNonLinearWinCurve(teamStrength);

  const formattedResult = {
    wins: seasonResult.wins,
    losses: seasonResult.losses,
    winPct: Number((seasonResult.wins / SIMULATION_CONSTANTS.MAX_GAMES).toFixed(3)),
    projectedWins,
    teamStrength,
    games: seasonResult.games.map(g => ({
      gameNumber: g.gameNumber,
      opponent: g.opponent,
      isHome: g.isHome,
      result: g.result,
      score: g.score,
      playerPerformances: Object.entries(g.playerStats).map(([playerId, stats]) => {
        const player = players.find(p => p.id === playerId);
        return {
          playerId,
          playerName: player?.name ?? playerId,
          stats,
          minutes: 40,
        };
      }),
    })),
    playerStats: Object.values(seasonResult.playerSeasonStats).map(s => ({
      playerId: s.playerId,
      playerName: s.playerName,
      gamesPlayed: s.gamesPlayed,
      minutesPerGame: s.minutesPerGame,
      averages: s.averages,
      totals: s.totals,
      highGames: s.highGames,
    })),
    teamStats: seasonResult.teamStats,
  };

  res.json({ result: formattedResult });
});

router.post('/game', (req: Request, res: Response) => {
  const result = simulateGameSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request', details: result.error.flatten() });
  }

  const { homeTeam, awayTeam } = result.data;
  try {
    const gameResult = simulateSingleGame({
      homeTeam: homeTeam as Player[],
      awayTeam: awayTeam as Player[],
      config: DEFAULT_SIMULATION_CONFIG,
    });

    res.json({
      result: {
        homeScore: gameResult.homeScore,
        awayScore: gameResult.awayScore,
        homePlayerStats: gameResult.homePlayerStats,
        awayPlayerStats: gameResult.awayPlayerStats,
        events: gameResult.events,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid teams' });
  }
});

router.post('/vs-mode', (req: Request, res: Response) => {
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

    seriesResults.push({
      gameNumber: gameNum,
      winner,
      score: { user: userScore, historical: historicalScore },
      boxScore: {
        user: Object.entries(userStats).map(([playerId, stats]) => {
          const player = (userLineup as Player[]).find(p => p.id === playerId);
          return { playerId, playerName: player?.name || playerId, stats, minutes: 40 };
        }),
        historical: Object.entries(historicalStats).map(([playerId, stats]) => {
          const player = historicalLineup.find(p => p.id === playerId);
          return { playerId, playerName: player?.name || playerId, stats, minutes: 40 };
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

function generateOpponentPools(): { pools: Player[][]; names: string[] } {
  const pools: Player[][] = [];

  // 30 distinct 5-man opponents (150 unique players).
  // Stats scale with overall so a 70-overall opponent plays like one:
  // roughly league-average starters, not 5 All-Stars every night.
  for (let i = 0; i < 30; i++) {
    const pool: Player[] = [];
    for (let j = 0; j < 5; j++) {
      const pos = (['PG', 'SG', 'SF', 'PF', 'C'] as Position[])[j]!;
      const overall = Math.round(randomStat(68, 82));
      const star = (overall - 68) / 14; // 0..1
      pool.push({
        id: `opp-${i}-${j}`,
        name: `${OPPONENT_NAMES[i]} Player ${j + 1}`,
        position: pos,
        team: 'opponent',
        decade: '2020s',
        era: 'Current',
        stats: {
          pts: randomStat(8 + star * 6, 12 + star * 6),
          reb: randomStat(3 + star * 2, 6 + star * 3),
          ast: randomStat(2 + star * 2, 4 + star * 3),
          stl: randomStat(0.5, 0.8 + star * 0.8),
          blk: randomStat(0.2, 0.5 + star * 0.8),
        },
        overall,
        archetype: 'Role Player',
      });
    }
    pools.push(pool);
  }

  return { pools, names: [...OPPONENT_NAMES] };
}

export default router;
