export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export interface PlayerStats {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  /** Personal fouls. 6 = fouled out (only when a custom minutes plan is in
   * effect — legacy rotations without minutes still cap at 5, never ejecting). */
  pf: number;
}

/** Planned regulation minutes per player ID (must sum to ~240; normalized server-side). */
export type MinutesMap = Record<string, number>;

import type { PlayerAttributes, EngineTraits, EraContext } from './player.js';

export type { PlayerAttributes, EngineTraits, EraContext } from './player.js';

export interface Player {
  id: string;
  name: string;
  position: Position;
  /** Extra positions the player can credibly fill (e.g. Garnett PF/C). Primary stays in `position`. */
  secondaryPositions?: Position[];
  /** Height in inches (e.g. 81 = 6'9"). Feeds rebounding/rim-protection in the sim. */
  heightIn: number;
  team: string;
  decade: string;
  era: string;
  stats: PlayerStats;
  overall: number;
  archetype: string;
  imageUrl?: string;
  /**
   * Optional 2K-style ratings (25-99). Any explicitly defined key wins;
   * missing keys are formula-estimated in services/playerTraits.ts.
   */
  attributes?: Partial<PlayerAttributes>;
  // --- Engine trait overrides (all optional; estimated formulaically when absent) ---
  /** Pace rating (~85-110). Falls back to era pace + positional offset. */
  pace?: number;
  /** True shooting 0-1. Falls back to era-average + overall curve. */
  tsPct?: number;
  /** Turnovers per game. Falls back to a guard-heavy estimate. */
  tov?: number;
  /** Usage rate 0-100. Falls back to a scoring/load estimate. */
  usageRate?: number;
  /** Defensive rating 0-100. Falls back to a stocks/boards/overall estimate. */
  defRating?: number;
  /** Clutch rating 0-100. Falls back to an overall/scoring estimate. */
  clutch?: number;
  /** Free-throw rate (FTA/FGA). Falls back to a slasher/big estimate. */
  ftr?: number;
  /** Free-throw percentage 0-1. Falls back to a positional estimate. */
  ftPct?: number;
  /** 3PT attempt rate (3PA/FGA). Pre-1980 players ~0 (no line). Estimated otherwise. */
  threePar?: number;
  /** Foul proneness 1-100 (gambling vs clean). Estimated from stocks/overall. */
  foulProneness?: number;
}

/** Alias used by the 2K-attribute spec: a card is the stored Player row. */
export type PlayerCard = Player;

export function getPlayerPositions(player: Pick<Player, 'position' | 'secondaryPositions'>): Position[] {
  const seen = new Set<Position>([player.position]);
  for (const p of player.secondaryPositions ?? []) seen.add(p);
  return [...seen];
}

export function canPlayPosition(player: Pick<Player, 'position' | 'secondaryPositions'>, slot: Position): boolean {
  return getPlayerPositions(player).includes(slot);
}

/**
 * Same-person key across eras: cards sharing a name (e.g. LeBron 00s/10s/20s)
 * are the same player and can't share a roster. Known namesakes — same name,
 * different people — resolve to their own id so they stay draftable together.
 */
const NAMESAKE_IDS = new Set([
  'johnny-davis-20s', // Johnny Davis (b.2002), not the 1970s/80s guard
  'gerald-henderson-10s', // Gerald Henderson Jr., not his father (1980s)
]);

export function personKeyOf(player: Pick<Player, 'id' | 'name'>): string {
  if (NAMESAKE_IDS.has(player.id)) return `id:${player.id}`;
  return `name:${player.name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export interface HistoricalTeam {
  id: string;
  name: string;
  season: string;
  players: Player[];
  record: string;
  championships: number;
  description: string;
}

export interface DraftPool {
  franchise: string;
  decade: string;
  players: Player[];
}

export interface SimulationConfig {
  variance: number;
  homeCourtAdvantage: number;
  fatigueFactor: number;
  injuryRisk: number;
}

export interface GameSimulationInput {
  homeTeam: Player[];
  awayTeam: Player[];
  config: SimulationConfig;
  /** 1-based season game number for fatigue; default 1 (no fatigue for one-off/playoff games). */
  gameIndex?: number;
  totalGames?: number;
  /** 1-based game number within a best-of-7 (coaching adaptation past Game 1). */
  seriesGameNumber?: number;
  /** 10-man rotation: player ID of the home Sixth Man (must be bench index 5-9). */
  homeSixthManId?: string | null;
  /** 10-man rotation: player ID of the away Sixth Man (must be bench index 5-9). */
  awaySixthManId?: string | null;
  /** Custom minutes plan for the home side (foul-outs + DNP cover enabled). Omit for legacy fixed rotation. */
  homeMinutes?: MinutesMap | null;
  /** Custom minutes plan for the away side. */
  awayMinutes?: MinutesMap | null;
  /** Offensive pecking order — 1st/2nd/3rd options get usage priority + scoring bumps. */
  homeOptions?: OffensiveOptions | null;
  /** Offensive pecking order for the away side. */
  awayOptions?: OffensiveOptions | null;
}

/** 1st/2nd/3rd offensive options by player ID. IDs must be unique roster members. */
export interface OffensiveOptions {
  first?: string | null;
  second?: string | null;
  third?: string | null;
}

export interface GameSimulationOutput {
  homeScore: number;
  awayScore: number;
  /** Overtime periods played (0 = regulation decision). */
  otPeriods: number;
  /** Blended possessions-per-48 both teams played at. */
  pace: number;
  homePlayerStats: Record<string, PlayerStats>;
  awayPlayerStats: Record<string, PlayerStats>;
  homeMinutes: Record<string, number>;
  awayMinutes: Record<string, number>;
  events: GameEvent[];
}

export interface GameEvent {
  quarter: number;
  time: string;
  type: 'score' | 'assist' | 'rebound' | 'steal' | 'block' | 'turnover' | 'foul';
  playerId: string;
  playerName: string;
  team: 'home' | 'away';
  points?: number;
  description: string;
}

export type GameWinner = 'home' | 'away' | 'tie';

export interface SeasonSimulationResult {
  wins: number;
  losses: number;
  games: SeasonGameResult[];
  playerSeasonStats: Record<string, PlayerSeasonStats>;
  teamStats: TeamSeasonStats;
  standings: TeamStanding[];
  opponentPlayerSeasonStats: Record<string, PlayerSeasonStats>;
}

export interface TeamStanding {
  team: string;
  wins: number;
  losses: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  gamesBehind: number;
  isUser: boolean;
}

export interface SeasonGameResult {
  gameNumber: number;
  opponent: string;
  isHome: boolean;
  result: 'W' | 'L' | 'T';
  score: { us: number; them: number };
  /** Overtime periods played (0 = regulation decision). */
  otPeriods: number;
  /** Blended possessions-per-48 both teams played at. */
  pace: number;
  playerStats: Record<string, PlayerStats>;
  userMinutes: Record<string, number>;
  opponentPlayerStats: Record<string, PlayerStats>;
  opponentMinutes: Record<string, number>;
  opponentRoster: Array<{
    playerId: string;
    playerName: string;
    position?: Position;
    secondaryPositions?: Position[];
    overall?: number;
    heightIn?: number;
    team?: string;
    baseStats?: PlayerStats;
  }>;
}

export interface PlayerSeasonStats {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  minutesPerGame: number;
  averages: PlayerStats;
  totals: PlayerStats;
  highGames: { pts: number; reb: number; ast: number; stl: number; blk: number; pf: number };
}

export interface TeamSeasonStats {
  offensiveRating: number;
  defensiveRating: number;
  pace: number;
  netRating: number;
  avgPts: number;
  avgReb: number;
  avgAst: number;
  avgStl: number;
  avgBlk: number;
  record: string;
}