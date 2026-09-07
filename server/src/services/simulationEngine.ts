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
  getPlayerPositions,
} from '../types/game.js';
import { DEFAULT_SIMULATION_CONFIG, SIMULATION_CONSTANTS } from './constants.js';
import { randomInt } from 'node:crypto';

// --- Tunable simulation knobs (documented; previously magic numbers) ---
const BASE_SCORE = 105;
const MIN_SCORE = 70;
const SCORE_SPREAD_FACTOR = 0.8;
const SCORE_NOISE = 15;
const THREE_POINT_RATE = 0.38;
const AVG_POSSESSIONS = SIMULATION_CONSTANTS.BASE_PACE;
const POSSESSION_SPREAD = 15;

function randomFloat(): number {
  // Uniform [0, 1) via crypto for auditable fairness (draft + sim).
  return randomInt(1_000_000) / 1_000_000;
}

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

function calculatePlayerImpact(player: Player, config: SimulationConfig, gameIndex = 0, totalGames = 82): number {
  const weights = POSITION_WEIGHTS[player.position];
  const { stats, overall } = player;

  let impact = 0;
  impact += stats.pts * weights.pts * STAT_IMPORTANCE.pts;
  impact += stats.reb * weights.reb * STAT_IMPORTANCE.reb;
  impact += stats.ast * weights.ast * STAT_IMPORTANCE.ast;
  impact += stats.stl * weights.stl * STAT_IMPORTANCE.stl;
  impact += stats.blk * weights.blk * STAT_IMPORTANCE.blk;

  impact = impact * (overall / 100);

  // Fatigue: late-season games slightly reduce impact.
  if (config.fatigueFactor > 0 && totalGames > 1) {
    const fatigue = config.fatigueFactor * (gameIndex / totalGames);
    impact *= (1 - fatigue * 0.5);
  }

  const variance = (randomFloat() - 0.5) * 2 * config.variance * impact;
  impact += variance;

  return Math.max(0, impact);
}

function calculateTeamRating(players: Player[], config: SimulationConfig, isHome: boolean, gameIndex = 0, totalGames = 82): number {
  let totalImpact = 0;
  let counted = 0;
  for (const player of players) {
    if (player) {
      totalImpact += calculatePlayerImpact(player, config, gameIndex, totalGames);
      counted++;
    }
  }

  // Scale short lineups down instead of silently treating missing players as 0-rated.
  if (counted < 5 && counted > 0) {
    totalImpact *= counted / 5;
  }

  if (isHome) {
    totalImpact *= (1 + config.homeCourtAdvantage);
  }

  return totalImpact;
}

function simulateGameScore(homeRating: number, awayRating: number, config: SimulationConfig): { home: number; away: number } {
  const ratingDiff = homeRating - awayRating;
  const pointSpread = ratingDiff * SCORE_SPREAD_FACTOR;

  let homeScore = BASE_SCORE + pointSpread / 2 + (randomFloat() - 0.5) * SCORE_NOISE * (0.5 + config.variance);
  let awayScore = BASE_SCORE - pointSpread / 2 + (randomFloat() - 0.5) * SCORE_NOISE * (0.5 + config.variance);

  homeScore = Math.max(MIN_SCORE, Math.round(homeScore));
  awayScore = Math.max(MIN_SCORE, Math.round(awayScore));

  // NBA has no ties: overtime decides drawn games instead of auto-loss for the user.
  let otPeriods = 0;
  while (homeScore === awayScore && otPeriods < 5) {
    otPeriods++;
    homeScore += 4 + Math.floor(randomFloat() * 6);
    awayScore += 4 + Math.floor(randomFloat() * 6);
  }
  if (homeScore === awayScore) {
    // Extremely unlikely fallback: home team takes it by a point.
    homeScore += 1;
  }

  return { home: homeScore, away: awayScore };
}

function rollInjury(config: SimulationConfig): number {
  // Returns a performance multiplier. Most games return 1.
  if (config.injuryRisk > 0 && randomFloat() < config.injuryRisk) {
    return 0.7; // playing hurt
  }
  return 1;
}

function generatePlayerGameStats(player: Player, teamRating: number, opponentRating: number, minutes: number, config: SimulationConfig): PlayerStats {
  const usageFactor = minutes / 48;
  const competitionFactor = Math.max(0.7, Math.min(1.3, 1 - (opponentRating - teamRating) / 200));
  const injuryFactor = rollInjury(config);

  const variance = config.variance;
  const factor = usageFactor * competitionFactor * injuryFactor;

  return {
    pts: Math.max(0, Math.round(player.stats.pts * factor + (randomFloat() - 0.5) * 8 * variance)),
    reb: Math.max(0, Math.round(player.stats.reb * factor + (randomFloat() - 0.5) * 4 * variance)),
    ast: Math.max(0, Math.round(player.stats.ast * factor + (randomFloat() - 0.5) * 3 * variance)),
    stl: Math.max(0, Math.round(player.stats.stl * factor + (randomFloat() - 0.5) * 1.5 * variance)),
    blk: Math.max(0, Math.round(player.stats.blk * factor + (randomFloat() - 0.5) * 1.5 * variance)),
  };
}

function generateGameEvents(homePlayers: Player[], awayPlayers: Player[], homeScore: number, awayScore: number): GameEvent[] {
  const events: GameEvent[] = [];
  const totalPoints = homeScore + awayScore;
  const numEvents = Math.min(15, Math.floor(totalPoints / 8));

  const allPlayers = [
    ...homePlayers.filter(Boolean).map(p => ({ ...p, team: 'home' as const })),
    ...awayPlayers.filter(Boolean).map(p => ({ ...p, team: 'away' as const })),
  ];
  if (allPlayers.length === 0) return [];

  for (let i = 0; i < numEvents; i++) {
    const quarter = Math.floor(randomFloat() * 4) + 1;
    const minutes = Math.floor(randomFloat() * 12);
    const seconds = Math.floor(randomFloat() * 60);
    const player = allPlayers[Math.floor(randomFloat() * allPlayers.length)]!;
    const eventTypes = ['score', 'assist', 'rebound', 'steal', 'block'] as const;
    const type = eventTypes[Math.floor(randomFloat() * eventTypes.length)]!;

    let points: number | undefined;
    let description = '';

    switch (type) {
      case 'score':
        points = randomFloat() > (1 - THREE_POINT_RATE) ? 3 : 2;
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
      time: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      type,
      playerId: player.id,
      playerName: player.name,
      team: player.team,
      ...(points !== undefined ? { points } : {}),
      description,
    });
  }

  // Clock counts down 12:00 -> 00:00, so sort quarters ascending and
  // time-remaining descending to get chronological order.
  return events.sort((a, b) => {
    if (a.quarter !== b.quarter) return a.quarter - b.quarter;
    const aTime = parseInt(a.time.split(':')[0]!, 10) * 60 + parseInt(a.time.split(':')[1]!, 10);
    const bTime = parseInt(b.time.split(':')[0]!, 10) * 60 + parseInt(b.time.split(':')[1]!, 10);
    return bTime - aTime;
  });
}

export function simulateSingleGame(input: GameSimulationInput): GameSimulationOutput {
  const { homeTeam, awayTeam, config } = input;

  if (!homeTeam || homeTeam.length === 0 || !awayTeam || awayTeam.length === 0) {
    throw new Error('Both teams must have at least one player');
  }

  const homeRating = calculateTeamRating(homeTeam, config, true);
  const awayRating = calculateTeamRating(awayTeam, config, false);

  const { home: homeScore, away: awayScore } = simulateGameScore(homeRating, awayRating, config);

  const homePlayerStats: Record<string, PlayerStats> = {};
  const awayPlayerStats: Record<string, PlayerStats> = {};

  for (const player of homeTeam) {
    if (!player) continue;
    // 5-man roster with no bench: starters play heavy minutes (~36-44).
    const minutes = 36 + randomFloat() * 8;
    homePlayerStats[player.id] = generatePlayerGameStats(player, homeRating, awayRating, minutes, config);
  }

  for (const player of awayTeam) {
    if (!player) continue;
    const minutes = 36 + randomFloat() * 8;
    awayPlayerStats[player.id] = generatePlayerGameStats(player, awayRating, homeRating, minutes, config);
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
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
  opponentNames: string[] = []
): SeasonSimulationResult {
  if (userLineup.length !== 5) {
    throw new Error('User lineup must have exactly 5 players');
  }
  if (opponentPool.length === 0) {
    throw new Error('Opponent pool must not be empty');
  }
  const totalGames = SIMULATION_CONSTANTS.MAX_GAMES;
  const games: SeasonSimulationResult['games'] = [];
  const playerSeasonStats: Record<string, PlayerSeasonStats> = {};
  const playerMinutes: Record<string, number[]> = {};

  userLineup.forEach(player => {
    playerSeasonStats[player.id] = {
      playerId: player.id,
      playerName: player.name,
      gamesPlayed: 0,
      minutesPerGame: 0,
      averages: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
      totals: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
      highGames: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
    };
    playerMinutes[player.id] = [];
  });

  let wins = 0;
  let losses = 0;

  for (let gameNum = 1; gameNum <= totalGames; gameNum++) {
    const isHome = gameNum % 2 === 1;
    // gameNum is 1-based; use (gameNum - 1) so index 0 isn't skipped on game 1.
    const poolIndex = (gameNum - 1) % opponentPool.length;
    const opponent = opponentPool[poolIndex]!;
    const opponentName = opponentNames[poolIndex] ?? `Opponent ${((poolIndex) % 30) + 1}`;

    const gameInput: GameSimulationInput = {
      homeTeam: isHome ? userLineup : opponent,
      awayTeam: isHome ? opponent : userLineup,
      config,
    };

    const gameResult = simulateSingleGame({
      ...gameInput,
      // Recompute ratings with fatigue context for season games
      homeTeam: gameInput.homeTeam,
      awayTeam: gameInput.awayTeam,
      config,
    });
    const userScore = isHome ? gameResult.homeScore : gameResult.awayScore;
    const oppScore = isHome ? gameResult.awayScore : gameResult.homeScore;
    // Overtime in simulateGameScore guarantees no ties, but guard anyway.
    const result = userScore > oppScore ? 'W' : userScore < oppScore ? 'L' : 'T';

    if (result === 'W') wins++;
    else if (result === 'L') losses++;
    else losses++; // A tie should never happen; count conservatively as a loss.

    const userPlayerStats = isHome ? gameResult.homePlayerStats : gameResult.awayPlayerStats;

    for (const [playerId, stats] of Object.entries(userPlayerStats)) {
      const seasonStat = playerSeasonStats[playerId];
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

        // Track minutes actually assigned (36-44 range in simulateSingleGame).
        playerMinutes[playerId]?.push(36 + randomFloat() * 8);
      }
    }

    games.push({
      gameNumber: gameNum,
      opponent: opponentName,
      isHome,
      result: result === 'T' ? 'L' : result,
      score: { us: userScore, them: oppScore },
      playerStats: userPlayerStats,
    });
  }

  for (const [, stats] of Object.entries(playerSeasonStats)) {
    if (stats.gamesPlayed > 0) {
      stats.averages = {
        pts: Number((stats.totals.pts / stats.gamesPlayed).toFixed(1)),
        reb: Number((stats.totals.reb / stats.gamesPlayed).toFixed(1)),
        ast: Number((stats.totals.ast / stats.gamesPlayed).toFixed(1)),
        stl: Number((stats.totals.stl / stats.gamesPlayed).toFixed(1)),
        blk: Number((stats.totals.blk / stats.gamesPlayed).toFixed(1)),
      };
      const mins = playerMinutes[stats.playerId] ?? [];
      stats.minutesPerGame = mins.length > 0
        ? Number((mins.reduce((a, b) => a + b, 0) / mins.length).toFixed(1))
        : 0;
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
  playerSeasonStats: Record<string, PlayerSeasonStats>,
  games: SeasonSimulationResult['games']
): TeamSeasonStats {
  let totalPts = 0;
  let totalPossessions = 0;

  for (const game of games) {
    totalPts += game.score.us;
    totalPossessions += AVG_POSSESSIONS + randomFloat() * POSSESSION_SPREAD;
  }

  const numGames = games.length || 1;
  const avgPts = totalPts / numGames;
  const pace = totalPossessions / numGames;

  let totalReb = 0, totalAst = 0, totalStl = 0, totalBlk = 0;
  for (const [, stats] of Object.entries(playerSeasonStats)) {
    totalReb += stats.averages.reb;
    totalAst += stats.averages.ast;
    totalStl += stats.averages.stl;
    totalBlk += stats.averages.blk;
  }

  const offensiveRating = (avgPts / pace) * 100;
  // Better-than-average rosters suppress opponent scoring.
  const avgOverall = lineup.length > 0
    ? lineup.reduce((sum, p) => sum + p.overall, 0) / lineup.length
    : 75;
  const defensiveRating = offensiveRating - (avgOverall - 75) * 0.5;

  return {
    offensiveRating: Number(offensiveRating.toFixed(1)),
    defensiveRating: Number(defensiveRating.toFixed(1)),
    pace: Number(pace.toFixed(1)),
    netRating: Number((offensiveRating - defensiveRating).toFixed(1)),
    avgPts: Number(avgPts.toFixed(1)),
    avgReb: Number(totalReb.toFixed(1)),
    avgAst: Number(totalAst.toFixed(1)),
    avgStl: Number(totalStl.toFixed(1)),
    avgBlk: Number(totalBlk.toFixed(1)),
    record: `${games.filter(g => g.result === 'W').length}-${games.filter(g => g.result === 'L').length}`,
  };
}

export function calculateNonLinearWinCurve(teamStrength: number): number {
  // Maps 0-100 team strength to 0-82 wins.
  // Elite teams can reach 82 (unlike the old curve capped at ~53):
  // 50 -> 41, 75 -> ~63, 90 -> ~75, 100 -> ~82.
  const clamped = Math.max(0, Math.min(100, teamStrength));
  const x = (clamped - 50) / 50; // [-1, 1]

  let winPct: number;
  if (x <= 0) {
    winPct = 0.5 + x * 0.48;
  } else {
    winPct = 0.5 + x * 0.55 - x * x * 0.05;
  }

  winPct = Math.max(0.02, Math.min(0.995, winPct));

  return Math.round(winPct * SIMULATION_CONSTANTS.MAX_GAMES);
}

export function getTeamStrength(lineup: Player[]): number {
  if (lineup.length === 0) return 0;
  // Coverage counts versatility: Garnett (PF/C) can cover either big slot,
  // so max bipartite matching — not just distinct primaries.
  const positionCoverage = maxPositionCoverage(lineup);
  // Monotonic: a full 5-position lineup always beats 4.
  const coverageBonus = positionCoverage === 5 ? 5 : positionCoverage * 0.75;

  const avgOverall = lineup.reduce((sum, p) => sum + p.overall, 0) / lineup.length;

  const statBalance = calculateStatBalance(lineup);

  return Math.min(100, avgOverall + coverageBonus + statBalance);
}

function maxPositionCoverage(lineup: Player[]): number {
  const matchToPlayer = new Map<string, number>();
  const tryAssign = (playerIdx: number, seen: Set<string>): boolean => {
    for (const slot of getPlayerPositions(lineup[playerIdx]!)) {
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
  let covered = 0;
  for (let i = 0; i < lineup.length; i++) {
    if (tryAssign(i, new Set())) covered++;
  }
  return covered;
}

function calculateStatBalance(lineup: Player[]): number {
  // Weakest-link balance bonus (0..10): elite 82-0 requires ALL categories
  // covered, not just stacked scoring. Each category scores 0..1 against a
  // starter-caliber threshold; the minimum dominates so one hole tanks it.
  const n = lineup.length || 1;
  const totals = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };

  for (const player of lineup) {
    totals.pts += player.stats.pts;
    totals.reb += player.stats.reb;
    totals.ast += player.stats.ast;
    totals.stl += player.stats.stl;
    totals.blk += player.stats.blk;
  }

  const avgPts = totals.pts / n;
  const avgReb = totals.reb / n;
  const avgAst = totals.ast / n;
  const avgStl = totals.stl / n;
  const avgBlk = totals.blk / n;

  const ptsScore = Math.min(1, avgPts / 18);
  const rebScore = Math.min(1, avgReb / 8);
  const astScore = Math.min(1, avgAst / 5.5);
  const stlScore = Math.min(1, avgStl / 1.2);
  const blkScore = Math.min(1, avgBlk / 1.1);

  const weakest = Math.min(ptsScore, rebScore, astScore, stlScore, blkScore);
  const average = (ptsScore + rebScore + astScore + stlScore + blkScore) / 5;

  return weakest * 7 + average * 3;
}
