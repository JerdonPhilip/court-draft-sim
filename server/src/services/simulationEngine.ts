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
} from '../types/game.js';
import { DEFAULT_SIMULATION_CONFIG, SIMULATION_CONSTANTS, LEAGUE_AVG_IMPACT, IMPACT_TO_STRENGTH, WIN_CURVE_DIVISOR, OVERALL_CURVE_EXPONENT, STAR_USAGE_BONUS, POSITION_HEIGHT_BASELINE, HEIGHT_REB_PER_INCH, HEIGHT_BLK_PER_INCH, HEIGHT_FACTOR_MIN, HEIGHT_FACTOR_MAX } from './constants.js';
import { randomInt } from 'node:crypto';

// --- Tunable simulation knobs (see services/constants.ts) ---
const BASE_SCORE = SIMULATION_CONSTANTS.BASE_SCORE;
const MIN_SCORE = SIMULATION_CONSTANTS.MIN_SCORE;
const SCORE_SPREAD_FACTOR = SIMULATION_CONSTANTS.SCORE_SPREAD_FACTOR;
const SCORE_NOISE = SIMULATION_CONSTANTS.SCORE_NOISE;
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

/**
 * Height edge on the glass and at the rim, measured against the
 * positional average. A 7-footer at center grabs boards/blocks shots
 * better than a 6'9" one with identical stats — and vice versa.
 * Shared by live ratings and getBaseTeamImpact so strength/projection
 * move together with the sim.
 */
function heightFactors(player: Player): { reb: number; blk: number } {
  const baseline = POSITION_HEIGHT_BASELINE[player.position] ?? 79;
  const height = Number.isFinite(player.heightIn) ? player.heightIn : baseline;
  const diff = height - baseline;
  const clamp = (v: number) => Math.max(HEIGHT_FACTOR_MIN, Math.min(HEIGHT_FACTOR_MAX, v));
  return {
    reb: clamp(1 + HEIGHT_REB_PER_INCH * diff),
    blk: clamp(1 + HEIGHT_BLK_PER_INCH * diff),
  };
}

function calculatePlayerImpact(player: Player, config: SimulationConfig, gameIndex = 0, totalGames = 82): number {
  const weights = POSITION_WEIGHTS[player.position];
  const { stats, overall } = player;
  const height = heightFactors(player);

  let impact = 0;
  impact += stats.pts * weights.pts * STAT_IMPORTANCE.pts;
  impact += stats.reb * weights.reb * STAT_IMPORTANCE.reb * height.reb;
  impact += stats.ast * weights.ast * STAT_IMPORTANCE.ast;
  impact += stats.stl * weights.stl * STAT_IMPORTANCE.stl;
  impact += stats.blk * weights.blk * STAT_IMPORTANCE.blk * height.blk;

  impact = impact * Math.pow(overall / 100, OVERALL_CURVE_EXPONENT);

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
  const impacts: number[] = [];
  for (const player of players) {
    if (player) {
      impacts.push(calculatePlayerImpact(player, config, gameIndex, totalGames));
    }
  }
  const counted = impacts.length;

  // Usage concentration: sort best-first so the alpha carries the offense.
  impacts.sort((a, b) => b - a);
  let totalImpact = 0;
  for (let i = 0; i < impacts.length; i++) {
    totalImpact += impacts[i]! * (STAR_USAGE_BONUS[i] ?? 1);
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

function simulateGameScore(homeRating: number, awayRating: number, config: SimulationConfig): { home: number; away: number; otPeriods: number } {
  const ratingDiff = homeRating - awayRating;
  const pointSpread = ratingDiff * SCORE_SPREAD_FACTOR;

  let homeScore = BASE_SCORE + pointSpread / 2 + (randomFloat() - 0.5) * SCORE_NOISE * (0.5 + config.variance);
  let awayScore = BASE_SCORE - pointSpread / 2 + (randomFloat() - 0.5) * SCORE_NOISE * (0.5 + config.variance);

  homeScore = Math.max(MIN_SCORE, Math.round(homeScore));
  awayScore = Math.max(MIN_SCORE, Math.round(awayScore));

  // NBA has no ties: overtime decides drawn games instead of auto-loss for the user.
  // Close matchups (small spread) tie far more often, so OT naturally
  // clusters where it should — even contests, up to 5 extra periods.
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

  return { home: homeScore, away: awayScore, otPeriods };
}

/**
 * Ironman rotation minutes: a 5-man roster with no bench plays its men
 * heavy minutes in a 48-minute game. Stars play more (up to the full 48),
 * role players catch short breathers. Team total lands ~225-235 of the
 * real 240 player-minutes.
 */
function assignMinutes(player: Player): number {
  return Math.min(48, Math.round(42 + (player.overall / 100) * 4 + randomFloat() * 2));
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFloat() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Shuffled 82-game schedule. The old code cycled opponents in fixed order
 * (`(gameNum - 1) % pool.length`) with alternating home/away, so game #82
 * always faced the same team. Now every season draws a fresh balanced
 * schedule: each opponent appears 2-3x in random order (no back-to-back
 * repeats) and home/away is a shuffled 41/41 split.
 */
function buildSeasonSchedule(poolSize: number, totalGames: number): Array<{ poolIndex: number; isHome: boolean }> {
  const order: number[] = [];
  let prevLast = -1;
  while (order.length < totalGames) {
    const block: number[] = [];
    for (let i = 0; i < poolSize; i++) block.push(i);
    shuffleInPlace(block);
    // Avoid a repeat across the block boundary (last of prev == first of next).
    if (prevLast >= 0 && block[0] === prevLast && block.length > 1) {
      const swapIdx = 1 + Math.floor(randomFloat() * (block.length - 1));
      const tmp = block[0]!;
      block[0] = block[swapIdx]!;
      block[swapIdx] = tmp;
    }
    for (const idx of block) {
      if (order.length >= totalGames) break;
      order.push(idx!);
    }
    prevLast = order[order.length - 1]!;
  }

  const venues: boolean[] = [];
  for (let i = 0; i < totalGames; i++) venues.push(i < Math.ceil(totalGames / 2));
  shuffleInPlace(venues);

  return order.map((poolIndex, i) => ({ poolIndex, isHome: venues[i]! }));
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
  const { homeTeam, awayTeam, config, gameIndex = 1, totalGames = 1 } = input;

  if (!homeTeam || homeTeam.length === 0 || !awayTeam || awayTeam.length === 0) {
    throw new Error('Both teams must have at least one player');
  }

  const homeRating = calculateTeamRating(homeTeam, config, true, gameIndex, totalGames);
  const awayRating = calculateTeamRating(awayTeam, config, false, gameIndex, totalGames);

  const { home: homeScore, away: awayScore, otPeriods } = simulateGameScore(homeRating, awayRating, config);

  const homePlayerStats: Record<string, PlayerStats> = {};
  const awayPlayerStats: Record<string, PlayerStats> = {};
  const homeMinutes: Record<string, number> = {};
  const awayMinutes: Record<string, number> = {};

  for (const player of homeTeam) {
    if (!player) continue;
    const minutes = assignMinutes(player);
    homeMinutes[player.id] = minutes;
    homePlayerStats[player.id] = generatePlayerGameStats(player, homeRating, awayRating, minutes, config);
  }

  for (const player of awayTeam) {
    if (!player) continue;
    const minutes = assignMinutes(player);
    awayMinutes[player.id] = minutes;
    awayPlayerStats[player.id] = generatePlayerGameStats(player, awayRating, homeRating, minutes, config);
  }

  const events = generateGameEvents(homeTeam, awayTeam, homeScore, awayScore);

  return {
    homeScore,
    awayScore,
    otPeriods,
    homePlayerStats,
    awayPlayerStats,
    homeMinutes,
    awayMinutes,
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
  const opponentPlayerSeasonStats: Record<string, PlayerSeasonStats> = {};
  const opponentPlayerMinutes: Record<string, number[]> = {};

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
  for (const team of opponentPool) {
    for (const player of team) {
      opponentPlayerSeasonStats[player.id] = {
        playerId: player.id,
        playerName: player.name,
        gamesPlayed: 0,
        minutesPerGame: 0,
        averages: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
        totals: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
        highGames: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
      };
      opponentPlayerMinutes[player.id] = [];
    }
  }

  let wins = 0;
  let losses = 0;

  // League-standings accumulators: every opponent's record starts with its
  // games vs the user, then inter-opponent games fill everyone to 82 so the
  // table shows real W/L for every team instead of just the user's line.
  const oppWins: number[] = new Array(opponentPool.length).fill(0);
  const oppLosses: number[] = new Array(opponentPool.length).fill(0);
  const oppPF: number[] = new Array(opponentPool.length).fill(0);
  const oppPA: number[] = new Array(opponentPool.length).fill(0);
  const gamesVsUser: number[] = new Array(opponentPool.length).fill(0);
  let userPF = 0;
  let userPA = 0;

  const schedule = buildSeasonSchedule(opponentPool.length, totalGames);

  for (let gameNum = 1; gameNum <= totalGames; gameNum++) {
    const { poolIndex, isHome } = schedule[gameNum - 1]!;
    const opponent = opponentPool[poolIndex]!;
    const opponentName = opponentNames[poolIndex] ?? `Opponent ${((poolIndex) % 30) + 1}`;

    const gameInput: GameSimulationInput = {
      homeTeam: isHome ? userLineup : opponent,
      awayTeam: isHome ? opponent : userLineup,
      config,
      // Fatigue now actually flows into ratings (was previously dropped).
      gameIndex: gameNum,
      totalGames,
    };

    const gameResult = simulateSingleGame(gameInput);
    const userScore = isHome ? gameResult.homeScore : gameResult.awayScore;
    const oppScore = isHome ? gameResult.awayScore : gameResult.homeScore;
    // Overtime in simulateGameScore guarantees no ties, but guard anyway.
    const result = userScore > oppScore ? 'W' : userScore < oppScore ? 'L' : 'T';

    if (result === 'W') wins++;
    else if (result === 'L') losses++;
    else losses++; // A tie should never happen; count conservatively as a loss.

    userPF += userScore;
    userPA += oppScore;
    gamesVsUser[poolIndex]! += 1;
    if (result === 'W') {
      oppLosses[poolIndex]! += 1;
    } else {
      oppWins[poolIndex]! += 1;
    }
    oppPF[poolIndex]! += oppScore;
    oppPA[poolIndex]! += userScore;

    const userPlayerStats = isHome ? gameResult.homePlayerStats : gameResult.awayPlayerStats;
    const userMinutes = isHome ? gameResult.homeMinutes : gameResult.awayMinutes;
    const oppPlayerStats = isHome ? gameResult.awayPlayerStats : gameResult.homePlayerStats;
    const oppMinutes = isHome ? gameResult.awayMinutes : gameResult.homeMinutes;

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

        // Track the actual minutes assigned this game.
        playerMinutes[playerId]?.push(userMinutes[playerId] ?? 40);
      }
    }
    for (const [playerId, stats] of Object.entries(oppPlayerStats)) {
      const seasonStat = opponentPlayerSeasonStats[playerId];
      if (!seasonStat) continue;
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
      opponentPlayerMinutes[playerId]?.push(oppMinutes[playerId] ?? 40);
    }

    games.push({
      gameNumber: gameNum,
      opponent: opponentName,
      isHome,
      result: result === 'T' ? 'L' : result,
      score: { us: userScore, them: oppScore },
      otPeriods: gameResult.otPeriods,
      playerStats: userPlayerStats,
      userMinutes,
      opponentPlayerStats: oppPlayerStats,
      opponentMinutes: oppMinutes,
      opponentRoster: opponent.map(p => ({
        playerId: p.id,
        playerName: p.name,
        position: p.position,
        secondaryPositions: p.secondaryPositions,
        overall: p.overall,
        heightIn: p.heightIn,
        // Display schedule name so client joins (standings/bracket/awards) always match.
        team: opponentName,
        baseStats: { ...p.stats },
      })),
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
  const standings = simulateLeagueStandings(
    opponentPool,
    opponentNames,
    { wins, losses, pointsFor: userPF, pointsAgainst: userPA },
    { wins: oppWins, losses: oppLosses, pointsFor: oppPF, pointsAgainst: oppPA, gamesVsUser },
    config,
    totalGames,
    opponentPlayerSeasonStats,
    opponentPlayerMinutes,
  );

  return {
    wins,
    losses,
    games,
    playerSeasonStats,
    teamStats,
    standings,
    opponentPlayerSeasonStats,
  };
}

/**
 * Full league table: every opponent already carries its games vs the user,
 * so fill the rest of each team's 82-game slate with simulated
 * opponent-vs-opponent games (mid-season fatigue context, random venue).
 * Every simulated game credits one win and one loss, keeping the league
 * at .500 while letting contender pools naturally rise to the top.
 */
function simulateLeagueStandings(
  opponentPool: Player[][],
  opponentNames: string[],
  userRecord: { wins: number; losses: number; pointsFor: number; pointsAgainst: number },
  opp: { wins: number[]; losses: number[]; pointsFor: number[]; pointsAgainst: number[]; gamesVsUser: number[] },
  config: SimulationConfig,
  totalGames: number,
  opponentPlayerSeasonStats: Record<string, PlayerSeasonStats>,
  opponentPlayerMinutes: Record<string, number[]>,
): SeasonSimulationResult['standings'] {
  const n = opponentPool.length;
  const wins = [...opp.wins];
  const losses = [...opp.losses];
  const pf = [...opp.pointsFor];
  const pa = [...opp.pointsAgainst];

  // Exact-fill slots: team i appears (82 - gamesVsUser) times, shuffled and
  // paired so nobody is stranded and nobody exceeds 82.
  const slots: number[] = [];
  for (let i = 0; i < n; i++) {
    const remaining = Math.max(0, totalGames - (opp.gamesVsUser[i] ?? 0));
    for (let k = 0; k < remaining; k++) slots.push(i);
  }
  shuffleInPlace(slots);
  // Repair self-pairings by swapping with a neighbor; reshuffle if stuck.
  for (let attempt = 0; attempt < 25; attempt++) {
    let bad = -1;
    for (let p = 0; p + 1 < slots.length; p += 2) {
      if (slots[p] === slots[p + 1]) {
        bad = p;
        break;
      }
    }
    if (bad === -1) break;
    let fixed = false;
    for (let q = 0; q + 1 < slots.length; q += 2) {
      if (q === bad) continue;
      if (slots[q] !== slots[bad] && slots[q + 1] !== slots[bad]) {
        const tmp = slots[bad + 1]!;
        slots[bad + 1] = slots[q]!;
        slots[q] = tmp;
        fixed = true;
        break;
      }
    }
    if (!fixed) shuffleInPlace(slots);
  }
  // Final sweep: swap any leftover self-pair across pairs (counts preserved).
  // As an absolute fallback a team "plays itself" and takes both the win and
  // the loss, so every team still lands on exactly 82 games.
  for (let p = 0; p + 1 < slots.length; p += 2) {
    if (slots[p] !== slots[p + 1]) continue;
    const x = slots[p]!;
    let swapped = false;
    for (let r = 0; r + 1 < slots.length; r += 2) {
      if (r === p) continue;
      if (slots[r] !== x && slots[r + 1] !== x) {
        const tmp = slots[p + 1]!;
        slots[p + 1] = slots[r]!;
        slots[r] = tmp;
        swapped = true;
        break;
      }
    }
    void swapped;
  }

  const midSeason = Math.floor(totalGames / 2);
  for (let p = 0; p + 1 < slots.length; p += 2) {
    const a = slots[p]!;
    const b = slots[p + 1]!;
    if (a === b) {
      // Degenerate fallback (vanishingly rare): intrasquad scrimmage —
      // the team banks one win and one loss, staying at exactly 82 games.
      const rating = calculateTeamRating(opponentPool[a]!, config, true, midSeason, totalGames);
      const { home, away } = simulateGameScore(rating, rating, config);
      wins[a]! += 1;
      losses[a]! += 1;
      pf[a]! += home + away;
      pa[a]! += home + away;
      continue;
    }
    const teamA = opponentPool[a]!;
    const teamB = opponentPool[b]!;
    const aHome = randomFloat() < 0.5;
    const homeRating = calculateTeamRating(aHome ? teamA : teamB, config, true, midSeason, totalGames);
    const awayRating = calculateTeamRating(aHome ? teamB : teamA, config, false, midSeason, totalGames);
    const { home, away } = simulateGameScore(homeRating, awayRating, config);
    for (const [team, rating, opposingRating] of [[teamA, homeRating, awayRating], [teamB, awayRating, homeRating]] as const) {
      for (const player of team) {
        const seasonStat = opponentPlayerSeasonStats[player.id];
        if (!seasonStat) continue;
        const minutes = assignMinutes(player);
        const stats = generatePlayerGameStats(player, rating, opposingRating, minutes, config);
        opponentPlayerMinutes[player.id]?.push(minutes);
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
    const aScore = aHome ? home : away;
    const bScore = aHome ? away : home;
    if (aScore >= bScore) {
      wins[a]! += 1;
      losses[b]! += 1;
    } else {
      wins[b]! += 1;
      losses[a]! += 1;
    }
    pf[a]! += aScore;
    pa[a]! += bScore;
    pf[b]! += bScore;
    pa[b]! += aScore;
  }
  for (const stats of Object.values(opponentPlayerSeasonStats)) {
    if (stats.gamesPlayed === 0) continue;
    stats.averages = {
      pts: Number((stats.totals.pts / stats.gamesPlayed).toFixed(1)),
      reb: Number((stats.totals.reb / stats.gamesPlayed).toFixed(1)),
      ast: Number((stats.totals.ast / stats.gamesPlayed).toFixed(1)),
      stl: Number((stats.totals.stl / stats.gamesPlayed).toFixed(1)),
      blk: Number((stats.totals.blk / stats.gamesPlayed).toFixed(1)),
    };
    const minutes = opponentPlayerMinutes[stats.playerId] ?? [];
    stats.minutesPerGame = minutes.length > 0
      ? Number((minutes.reduce((sum, value) => sum + value, 0) / minutes.length).toFixed(1))
      : 0;
  }

  const rows: SeasonSimulationResult['standings'] = [];
  for (let i = 0; i < n; i++) {
    const w = wins[i] ?? 0;
    const l = losses[i] ?? 0;
    const played = w + l || 1;
    rows.push({
      team: opponentNames[i] ?? `Opponent ${((i) % 30) + 1}`,
      wins: w,
      losses: l,
      winPct: Number((w / played).toFixed(3)),
      pointsFor: pf[i] ?? 0,
      pointsAgainst: pa[i] ?? 0,
      pointDiff: (pf[i] ?? 0) - (pa[i] ?? 0),
      gamesBehind: 0,
      isUser: false,
    });
  }
  const userPlayed = userRecord.wins + userRecord.losses || 1;
  rows.push({
    team: 'Your Team',
    wins: userRecord.wins,
    losses: userRecord.losses,
    winPct: Number((userRecord.wins / userPlayed).toFixed(3)),
    pointsFor: userRecord.pointsFor,
    pointsAgainst: userRecord.pointsAgainst,
    pointDiff: userRecord.pointsFor - userRecord.pointsAgainst,
    gamesBehind: 0,
    isUser: true,
  });

  rows.sort((x, y) => y.wins - x.wins || y.pointDiff - x.pointDiff || x.team.localeCompare(y.team));
  const lead = rows[0];
  if (lead) {
    for (const r of rows) {
      r.gamesBehind = Number((((lead.wins - r.wins) + (r.losses - lead.losses)) / 2).toFixed(1));
    }
  }
  return rows;
}

function calculateTeamSeasonStats(
  _lineup: Player[],
  playerSeasonStats: Record<string, PlayerSeasonStats>,
  games: SeasonSimulationResult['games']
): TeamSeasonStats {
  let totalPts = 0;
  let totalAllowed = 0;
  let totalPossessions = 0;

  for (const game of games) {
    totalPts += game.score.us;
    totalAllowed += game.score.them;
    totalPossessions += AVG_POSSESSIONS + randomFloat() * POSSESSION_SPREAD;
  }

  const numGames = games.length || 1;
  const avgPts = totalPts / numGames;
  const avgAllowed = totalAllowed / numGames;
  const pace = totalPossessions / numGames;

  let totalReb = 0, totalAst = 0, totalStl = 0, totalBlk = 0;
  for (const [, stats] of Object.entries(playerSeasonStats)) {
    totalReb += stats.averages.reb;
    totalAst += stats.averages.ast;
    totalStl += stats.averages.stl;
    totalBlk += stats.averages.blk;
  }

  // Both ratings derive from actual simulated scoring per 100 possessions.
  const offensiveRating = (avgPts / pace) * 100;
  const defensiveRating = (avgAllowed / pace) * 100;

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
  // Logistic win curve centered so a league-average team (strength 50)
  // projects to 41 wins. Same model family as the sim itself, so the
  // projection tracks actual results instead of compressing everyone
  // into the 70s: ~28 -> 6W, ~40 -> 21W, 50 -> 41W, 60 -> 61W, ~72 -> 76W.
  const clamped = Math.max(0, Math.min(100, teamStrength));
  const winPct = 1 / (1 + Math.pow(10, -(clamped - 50) / WIN_CURVE_DIVISOR));

  return Math.round(winPct * SIMULATION_CONSTANTS.MAX_GAMES);
}

/**
 * Deterministic base impact of a lineup: same weights as live ratings but
 * neutral venue, no variance, no fatigue. Used for strength/projection so
 * the estimate and the sim can never disagree structurally.
 * Partial lineups are prorated (n/5) so draft previews read low until filled.
 */
export function getBaseTeamImpact(lineup: Player[]): number {
  const impacts: number[] = [];
  for (const player of lineup) {
    if (!player) continue;
    const weights = POSITION_WEIGHTS[player.position];
    const { stats, overall } = player;
    const height = heightFactors(player);
    impacts.push((
      stats.pts * weights.pts * STAT_IMPORTANCE.pts +
      stats.reb * weights.reb * STAT_IMPORTANCE.reb * height.reb +
      stats.ast * weights.ast * STAT_IMPORTANCE.ast +
      stats.stl * weights.stl * STAT_IMPORTANCE.stl +
      stats.blk * weights.blk * STAT_IMPORTANCE.blk * height.blk
    ) * Math.pow(overall / 100, OVERALL_CURVE_EXPONENT));
  }
  if (impacts.length === 0) return 0;
  impacts.sort((a, b) => b - a);
  let total = 0;
  for (let i = 0; i < impacts.length; i++) {
    total += impacts[i]! * (STAR_USAGE_BONUS[i] ?? 1);
  }
  const counted = impacts.length;
  return total * (counted / 5);
}

export function getTeamStrength(lineup: Player[]): number {
  if (lineup.length === 0) return 0;
  // Strength is just the base-impact differential vs a league-average
  // opponent, scaled to 0-100. Full 5-man coverage is enforced by
  // validation, so no separate coverage bonus is needed.
  return strengthVsLeague(getBaseTeamImpact(lineup), LEAGUE_AVG_IMPACT);
}

/**
 * Strength of a base impact against an arbitrary league average (e.g. an
 * era league instead of the synthetic reference league). Same scale as
 * getTeamStrength, so calculateNonLinearWinCurve applies unchanged —
 * projections stay honest no matter which league is simulated.
 */
export function strengthVsLeague(baseImpact: number, leagueAvgImpact: number): number {
  return Math.max(0, Math.min(100, Math.round(50 + (baseImpact - leagueAvgImpact) * IMPACT_TO_STRENGTH)));
}
