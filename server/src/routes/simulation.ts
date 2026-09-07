import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { simulateSeason, getTeamStrength, calculateNonLinearWinCurve, simulateSingleGame } from '../services/simulationEngine';
import { DEFAULT_SIMULATION_CONFIG } from '../services/constants';
import { Player, Position } from '../types/game';
import { getPlayerById } from '../data/players';
import { getAllHistoricalTeams } from '../data/historicalTeams';

const router = Router();

const simulateSeasonSchema = z.object({
  lineup: z.array(z.object({
    id: z.string(),
    name: z.string(),
    position: z.enum(['PG', 'SG', 'SF', 'PF', 'C']),
    team: z.string(),
    decade: z.string(),
    era: z.string(),
    stats: z.object({
      pts: z.number(),
      reb: z.number(),
      ast: z.number(),
      stl: z.number(),
      blk: z.number(),
    }),
    overall: z.number(),
    archetype: z.string(),
  })).length(5),
  config: z.object({
    variance: z.number().min(0).max(1).optional(),
    homeCourtAdvantage: z.number().min(0).max(1).optional(),
    fatigueFactor: z.number().min(0).max(1).optional(),
    injuryRisk: z.number().min(0).max(1).optional(),
  }).optional(),
});

const simulateGameSchema = z.object({
  homeTeam: z.array(z.object({
    id: z.string(),
    name: z.string(),
    position: z.enum(['PG', 'SG', 'SF', 'PF', 'C']),
    team: z.string(),
    decade: z.string(),
    era: z.string(),
    stats: z.object({
      pts: z.number(),
      reb: z.number(),
      ast: z.number(),
      stl: z.number(),
      blk: z.number(),
    }),
    overall: z.number(),
    archetype: z.string(),
  })).length(5),
  awayTeam: z.array(z.object({
    id: z.string(),
    name: z.string(),
    position: z.enum(['PG', 'SG', 'SF', 'PF', 'C']),
    team: z.string(),
    decade: z.string(),
    era: z.string(),
    stats: z.object({
      pts: z.number(),
      reb: z.number(),
      ast: z.number(),
      stl: z.number(),
      blk: z.number(),
    }),
    overall: z.number(),
    archetype: z.string(),
  })).length(5),
});

const vsModeSchema = z.object({
  userLineup: z.array(z.object({
    id: z.string(),
    name: z.string(),
    position: z.enum(['PG', 'SG', 'SF', 'PF', 'C']),
    team: z.string(),
    decade: z.string(),
    era: z.string(),
    stats: z.object({
      pts: z.number(),
      reb: z.number(),
      ast: z.number(),
      stl: z.number(),
      blk: z.number(),
    }),
    overall: z.number(),
    archetype: z.string(),
  })).length(5),
  historicalTeamId: z.string(),
  seriesLength: z.union([z.literal(1), z.literal(7)]),
});

router.post('/season', (req: Request, res: Response) => {
  const result = simulateSeasonSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request', details: result.error.flatten() });
  }

  const { lineup, config } = result.data;
  const players = lineup as Player[];

  const opponentPool = generateOpponentPools();
  const simulationConfig = { ...DEFAULT_SIMULATION_CONFIG, ...config };

  const seasonResult = simulateSeason(players, opponentPool, simulationConfig);
  const teamStrength = getTeamStrength(players);
  const projectedWins = calculateNonLinearWinCurve(teamStrength);

  const formattedResult = {
    wins: seasonResult.wins,
    losses: seasonResult.losses,
    winPct: Number((seasonResult.wins / 82).toFixed(3)),
    projectedWins,
    teamStrength,
    games: seasonResult.games.map(g => ({
      gameNumber: g.gameNumber,
      opponent: g.opponent,
      isHome: g.isHome,
      result: g.result,
      score: g.score,
    })),
    playerStats: Array.from(seasonResult.playerSeasonStats.values()).map(s => ({
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
  const gameResult = simulateSingleGame({
    homeTeam: homeTeam as Player[],
    awayTeam: awayTeam as Player[],
    config: DEFAULT_SIMULATION_CONFIG,
  });

  res.json({
    result: {
      homeScore: gameResult.homeScore,
      awayScore: gameResult.awayScore,
      homePlayerStats: Object.fromEntries(gameResult.homePlayerStats),
      awayPlayerStats: Object.fromEntries(gameResult.awayPlayerStats),
      events: gameResult.events,
    },
  });
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

  const historicalLineup = historicalTeam.players.slice(0, 5) as Player[];

  const seriesResults = [];
  let userWins = 0;
  let historicalWins = 0;

  for (let gameNum = 1; gameNum <= seriesLength; gameNum++) {
    const isHome = gameNum % 2 === 1;

    const gameResult = simulateSingleGame({
      homeTeam: isHome ? userLineup : historicalLineup,
      awayTeam: isHome ? historicalLineup : userLineup,
      config: DEFAULT_SIMULATION_CONFIG,
    });

    const userScore = isHome ? gameResult.homeScore : gameResult.awayScore;
    const historicalScore = isHome ? gameResult.awayScore : gameResult.homeScore;
    const winner = userScore > historicalScore ? 'user' : 'historical';

    if (winner === 'user') userWins++;
    else historicalWins++;

    const userStats = isHome ? gameResult.homePlayerStats : gameResult.awayPlayerStats;
    const historicalStats = isHome ? gameResult.awayPlayerStats : gameResult.homePlayerStats;

    seriesResults.push({
      gameNumber: gameNum,
      winner,
      score: { user: userScore, historical: historicalScore },
      boxScore: {
        user: Array.from(userStats.entries()).map(([playerId, stats]) => {
          const player = userLineup.find(p => p.id === playerId);
          return { playerId, playerName: player?.name || playerId, stats, minutes: 36 };
        }),
        historical: Array.from(historicalStats.entries()).map(([playerId, stats]) => {
          const player = historicalLineup.find(p => p.id === playerId);
          return { playerId, playerName: player?.name || playerId, stats, minutes: 36 };
        }),
      },
    });

    if (seriesLength === 7 && (userWins === 4 || historicalWins === 4)) {
      break;
    }
  }

  res.json({
    result: {
      seriesLength,
      userWins,
      historicalWins,
      seriesWinner: userWins > historicalWins ? 'user' : 'historical',
      games: seriesResults,
      historicalTeam: {
        id: historicalTeam.id,
        name: historicalTeam.name,
        season: historicalTeam.season,
        record: historicalTeam.record,
      },
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
    })),
  }));
  res.json({ teams });
});

function generateOpponentPools(): Player[][] {
  const pools: Player[][] = [];
  const allPlayers = [
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `opp-${i}`,
      name: `Opponent Player ${i + 1}`,
      position: ['PG', 'SG', 'SF', 'PF', 'C'][i % 5] as Position,
      team: 'opponent',
      decade: '2020s',
      era: 'Current',
      stats: { pts: 12 + Math.random() * 10, reb: 4 + Math.random() * 6, ast: 3 + Math.random() * 4, stl: 0.5 + Math.random() * 1, blk: 0.3 + Math.random() * 1 },
      overall: 65 + Math.random() * 20,
      archetype: 'Role Player',
    })),
  ];

  for (let i = 0; i < 30; i++) {
    const pool = [];
    for (let j = 0; j < 5; j++) {
      pool.push(allPlayers[i * 5 + j]);
    }
    pools.push(pool);
  }

  return pools;
}

export default router;