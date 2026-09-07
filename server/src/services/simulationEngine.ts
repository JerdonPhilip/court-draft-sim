import {
  Player,
  PlayerStats,
  GameSimulationInput,
  GameSimulationOutput,
  SeasonSimulationResult,
  SimulationConfig,
  GameEvent,
  PlayerSeasonStats,
  TeamSeasonStats,
} from '../types/game';
import { DEFAULT_SIMULATION_CONFIG } from './constants';

const POSITION_WEIGHTS = {
  PG: { pts: 1.0, reb: 0.3, ast: 1.5, stl: 1.3, blk: 0.2 },
  SG: { pts: 1.3, reb: 0.4, ast: 0.8, stl: 1.2, blk: 0.3 },
  SF: { pts: 1.2, reb: 0.8, ast: 0.9, stl: 1.1, blk: 0.6 },
  PF: { pts: 1.1, reb: 1.2, ast: 0.6, stl: 0.8, blk: 1.0 },
  C: { pts: 1.0, reb: 1.5, ast: 0.4, stl: 0.5, blk: 1.5 },
};

const STAT_IMPORTANCE = {
  pts: 0.35,
  reb: 0.20,
  ast: 0.20,
  stl: 0.12,
  blk: 0.13,
};

function calculatePlayerImpact(player: Player, config: SimulationConfig): number {
  const weights = POSITION_WEIGHTS[player.position];
  const { stats, overall } = player;

  let impact = 0;
  impact += stats.pts * weights.pts * STAT_IMPORTANCE.pts;
  impact += stats.reb * weights.reb * STAT_IMPORTANCE.reb;
  impact += stats.ast * weights.ast * STAT_IMPORTANCE.ast;
  impact += stats.stl * weights.stl * STAT_IMPORTANCE.stl;
  impact += stats.blk * weights.blk * STAT_IMPORTANCE.blk;

  impact = impact * (overall / 100);

  const variance = (Math.random() - 0.5) * 2 * config.variance * impact;
  impact += variance;

  return Math.max(0, impact);
}

function calculateTeamRating(players: Player[], config: SimulationConfig, isHome: boolean): number {
  let totalImpact = 0;
  for (const player of players) {
    if (player) {
      totalImpact += calculatePlayerImpact(player, config);
    }
  }

  if (isHome) {
    totalImpact *= (1 + config.homeCourtAdvantage);
  }

  return totalImpact;
}

function simulateGameScore(homeRating: number, awayRating: number, config: SimulationConfig): { home: number; away: number } {
  const baseScore = 105;
  const ratingDiff = homeRating - awayRating;
  const pointSpread = ratingDiff * 0.8;

  const homeScore = baseScore + pointSpread / 2 + (Math.random() - 0.5) * 15 * config.variance;
  const awayScore = baseScore - pointSpread / 2 + (Math.random() - 0.5) * 15 * config.variance;

  return {
    home: Math.max(70, Math.round(homeScore)),
    away: Math.max(70, Math.round(awayScore)),
  };
}

function generatePlayerGameStats(player: Player, teamRating: number, opponentRating: number, minutes: number, config: SimulationConfig): PlayerStats {
  const usageFactor = minutes / 48;
  const competitionFactor = Math.max(0.7, Math.min(1.3, 1 - (opponentRating - teamRating) / 200));

  const variance = config.variance;

  return {
    pts: Math.max(0, Math.round(player.stats.pts * usageFactor * competitionFactor + (Math.random() - 0.5) * 8 * variance)),
    reb: Math.max(0, Math.round(player.stats.reb * usageFactor * competitionFactor + (Math.random() - 0.5) * 4 * variance)),
    ast: Math.max(0, Math.round(player.stats.ast * usageFactor * competitionFactor + (Math.random() - 0.5) * 3 * variance)),
    stl: Math.max(0, Math.round(player.stats.stl * usageFactor * competitionFactor + (Math.random() - 0.5) * 1.5 * variance)),
    blk: Math.max(0, Math.round(player.stats.blk * usageFactor * competitionFactor + (Math.random() - 0.5) * 1.5 * variance)),
  };
}

function generateGameEvents(homePlayers: Player[], awayPlayers: Player[], homeScore: number, awayScore: number): GameEvent[] {
  const events: GameEvent[] = [];
  const totalPoints = homeScore + awayScore;
  const numEvents = Math.min(15, Math.floor(totalPoints / 8));

  const allPlayers = [
    ...homePlayers.map(p => ({ ...p, team: 'home' as const })),
    ...awayPlayers.map(p => ({ ...p, team: 'away' as const })),
  ];

  for (let i = 0; i < numEvents; i++) {
    const quarter = Math.floor(Math.random() * 4) + 1;
    const minutes = Math.floor(Math.random() * 12);
    const seconds = Math.floor(Math.random() * 60);
    const player = allPlayers[Math.floor(Math.random() * allPlayers.length)];
    const eventTypes = ['score', 'assist', 'rebound', 'steal', 'block'] as const;
    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];

    let points = 0;
    let description = '';

    switch (type) {
      case 'score':
        points = Math.random() > 0.6 ? 3 : 2;
        description = `${player.name} scores ${points} points`;
        break;
      case 'assist':
        description = `${player.name} records an assist`;
        break;
      case 'rebound':
        description = `${player.name} grabs a rebound`;
        break;
      case 'steal':
        description = `${player.name} steals the ball`;
        break;
      case 'block':
        description = `${player.name} blocks a shot`;
        break;
    }

    events.push({
      quarter,
      time: `${minutes}:${seconds.toString().padStart(2, '0')}`,
      type,
      playerId: player.id,
      playerName: player.name,
      team: player.team,
      points,
      description,
    });
  }

  return events.sort((a, b) => {
    if (a.quarter !== b.quarter) return a.quarter - b.quarter;
    const aTime = parseInt(a.time.split(':')[0]) * 60 + parseInt(a.time.split(':')[1]);
    const bTime = parseInt(b.time.split(':')[0]) * 60 + parseInt(b.time.split(':')[1]);
    return bTime - aTime;
  });
}

export function simulateSingleGame(input: GameSimulationInput): GameSimulationOutput {
  const { homeTeam, awayTeam, config } = input;

  const homeRating = calculateTeamRating(homeTeam, config, true);
  const awayRating = calculateTeamRating(awayTeam, config, false);

  const { home: homeScore, away: awayScore } = simulateGameScore(homeRating, awayRating, config);

  const homePlayerStats = new Map<string, PlayerStats>();
  const awayPlayerStats = new Map<string, PlayerStats>();

  for (const player of homeTeam) {
    const minutes = 24 + Math.random() * 12;
    homePlayerStats.set(player.id, generatePlayerGameStats(player, homeRating, awayRating, minutes, config));
  }

  for (const player of awayTeam) {
    const minutes = 24 + Math.random() * 12;
    awayPlayerStats.set(player.id, generatePlayerGameStats(player, awayRating, homeRating, minutes, config));
  }

  const events = generateGameEvents(homeTeam, awayTeam, homeScore, awayScore);

  return {
    homeScore,
    awayScore,
    homePlayerStats,
    awayPlayerStats,
    events,
  };
}

export function simulateSeason(
  userLineup: Player[],
  opponentPool: Player[][],
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG
): SeasonSimulationResult {
  const games: SeasonSimulationResult['games'] = [];
  const playerSeasonStats = new Map<string, PlayerSeasonStats>();

  userLineup.forEach(player => {
    playerSeasonStats.set(player.id, {
      playerId: player.id,
      playerName: player.name,
      gamesPlayed: 0,
      minutesPerGame: 0,
      averages: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
      totals: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
      highGames: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
    });
  });

  let wins = 0;
  let losses = 0;

  for (let gameNum = 1; gameNum <= 82; gameNum++) {
    const isHome = gameNum % 2 === 1;
    const opponent = opponentPool[gameNum % opponentPool.length];

    const gameInput: GameSimulationInput = {
      homeTeam: isHome ? userLineup : opponent,
      awayTeam: isHome ? opponent : userLineup,
      config,
    };

    const gameResult = simulateSingleGame(gameInput);
    const userScore = isHome ? gameResult.homeScore : gameResult.awayScore;
    const oppScore = isHome ? gameResult.awayScore : gameResult.homeScore;
    const result = userScore > oppScore ? 'W' : 'L';

    if (result === 'W') wins++;
    else losses++;

    const userPlayerStats = isHome ? gameResult.homePlayerStats : gameResult.awayPlayerStats;

    for (const [playerId, stats] of userPlayerStats) {
      const seasonStat = playerSeasonStats.get(playerId);
      if (seasonStat) {
        seasonStat.gamesPlayed++;
        seasonStat.totals.pts += stats.pts;
        seasonStat.totals.reb += stats.reb;
        seasonStat.totals.ast += stats.ast;
        seasonStat.totals.stl += stats.stl;
        seasonStat.totals.blk += stats.blk;

        seasonStat.highGames.pts = Math.max(seasonStat.highGames.pts, stats.pts);
        seasonStat.highGames.reb = Math.max(seasonStat.highGames.reb, stats.reb);
        seasonStat.highGames.ast = Math.max(seasonStat.highGames.ast, stats.ast);
        seasonStat.highGames.stl = Math.max(seasonStat.highGames.stl, stats.stl);
        seasonStat.highGames.blk = Math.max(seasonStat.highGames.blk, stats.blk);
      }
    }

    games.push({
      gameNumber: gameNum,
      opponent: `Opponent ${gameNum}`,
      isHome,
      result,
      score: { us: userScore, them: oppScore },
      playerStats: userPlayerStats,
    });
  }

  for (const [, stats] of playerSeasonStats) {
    if (stats.gamesPlayed > 0) {
      stats.averages = {
        pts: Number((stats.totals.pts / stats.gamesPlayed).toFixed(1)),
        reb: Number((stats.totals.reb / stats.gamesPlayed).toFixed(1)),
        ast: Number((stats.totals.ast / stats.gamesPlayed).toFixed(1)),
        stl: Number((stats.totals.stl / stats.gamesPlayed).toFixed(1)),
        blk: Number((stats.totals.blk / stats.gamesPlayed).toFixed(1)),
      };
      stats.minutesPerGame = 36;
    }
  }

  const teamStats = calculateTeamSeasonStats(userLineup, playerSeasonStats, games);

  return {
    wins,
    losses,
    games,
    playerSeasonStats,
    teamStats,
  };
}

function calculateTeamSeasonStats(
  lineup: Player[],
  playerSeasonStats: Map<string, PlayerSeasonStats>,
  games: SeasonSimulationResult['games']
): TeamSeasonStats {
  let totalPts = 0, totalReb = 0, totalAst = 0, totalStl = 0, totalBlk = 0;
  let totalPossessions = 0;

  for (const game of games) {
    totalPts += game.score.us;
    const gamePoss = 95 + Math.random() * 15;
    totalPossessions += gamePoss;
  }

  const avgPts = totalPts / 82;
  const pace = totalPossessions / 82;

  for (const [, stats] of playerSeasonStats) {
    totalReb += stats.averages.reb;
    totalAst += stats.averages.ast;
    totalStl += stats.averages.stl;
    totalBlk += stats.averages.blk;
  }

  const offensiveRating = (avgPts / pace) * 100;
  const defensiveRating = offensiveRating - (lineup.reduce((sum, p) => sum + p.overall, 0) / 5 - 75) * 0.5;

  return {
    offensiveRating: Number(offensiveRating.toFixed(1)),
    defensiveRating: Number(defensiveRating.toFixed(1)),
    pace: Number(pace.toFixed(1)),
    netRating: Number((offensiveRating - defensiveRating).toFixed(1)),
    avgPts: Number(avgPts.toFixed(1)),
    avgReb: Number((totalReb).toFixed(1)),
    avgAst: Number((totalAst).toFixed(1)),
    avgStl: Number((totalStl).toFixed(1)),
    avgBlk: Number((totalBlk).toFixed(1)),
    record: `${games.filter(g => g.result === 'W').length}-${games.filter(g => g.result === 'L').length}`,
  };
}

export function calculateNonLinearWinCurve(teamStrength: number): number {
  const baseWins = 41;
  const maxWins = 82;
  const minWins = 0;

  const strengthNormalized = (teamStrength - 50) / 50;

  let winPct: number;
  if (strengthNormalized <= 0) {
    winPct = 0.5 + strengthNormalized * 0.4;
  } else {
    winPct = 0.5 + strengthNormalized * 0.3 - Math.pow(strengthNormalized, 2) * 0.15;
  }

  winPct = Math.max(0.05, Math.min(0.98, winPct));

  return Math.round(winPct * 82);
}

export function getTeamStrength(lineup: Player[]): number {
  const positionCoverage = new Set(lineup.map(p => p.position)).size;
  const coverageBonus = positionCoverage === 5 ? 5 : positionCoverage * 1.5;

  const avgOverall = lineup.reduce((sum, p) => sum + p.overall, 0) / 5;

  const statBalance = calculateStatBalance(lineup);

  return Math.min(100, avgOverall + coverageBonus + statBalance);
}

function calculateStatBalance(lineup: Player[]): number {
  const totals = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };

  for (const player of lineup) {
    totals.pts += player.stats.pts;
    totals.reb += player.stats.reb;
    totals.ast += player.stats.ast;
    totals.stl += player.stats.stl;
    totals.blk += player.stats.blk;
  }

  const avgPts = totals.pts / 5;
  const avgReb = totals.reb / 5;
  const avgAst = totals.ast / 5;
  const avgStl = totals.stl / 5;
  const avgBlk = totals.blk / 5;

  const ptsScore = Math.min(10, avgPts / 2.5);
  const rebScore = Math.min(8, avgReb / 1.2);
  const astScore = Math.min(8, avgAst / 1.5);
  const stlScore = Math.min(5, avgStl / 0.3);
  const blkScore = Math.min(5, avgBlk / 0.4);

  return ptsScore + rebScore + astScore + stlScore + blkScore;
}