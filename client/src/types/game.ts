export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export interface PlayerStats {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  /** Personal fouls, hard-capped at 5. NEVER ejects: all 5 play every game. */
  pf: number;
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  /** Extra positions the player can credibly fill (e.g. Garnett PF/C). Primary stays in `position`. */
  secondaryPositions?: Position[];
  /** Height in inches. Optional on the client so old persisted lineups still load (falls back to positional average). */
  heightIn?: number;
  team: string;
  decade: string;
  era: string;
  stats: PlayerStats;
  overall: number;
  archetype: string;
  imageUrl?: string;
  /** Engine trait overrides (optional; estimated formulaically when absent). */
  pace?: number;
  tsPct?: number;
  tov?: number;
  usageRate?: number;
  defRating?: number;
  clutch?: number;
  ftr?: number;
  ftPct?: number;
  threePar?: number;
  foulProneness?: number;
}

export function getPlayerPositions(player: Pick<Player, 'position' | 'secondaryPositions'>): Position[] {
  const seen = new Set<Position>([player.position]);
  for (const p of player.secondaryPositions ?? []) seen.add(p);
  return [...seen];
}

export function canPlayPosition(player: Pick<Player, 'position' | 'secondaryPositions'>, slot: Position): boolean {
  return getPlayerPositions(player).includes(slot);
}

/**
 * Same-person key across eras: cards sharing a name (e.g. Lillard 10s/20s)
 * are the same player and can't share a roster. Known namesakes — same name,
 * different people — resolve to their own id so they stay draftable together.
 * Must stay in sync with the server copy in server/src/types/game.ts.
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

export interface LineupSlot {
  position: Position;
  player: Player | null;
  /** Starters (indices 0-4) vs bench (indices 5-9). */
  role: 'starter' | 'bench';
  /** Exactly one bench slot should carry this once the roster is full. */
  isSixthMan?: boolean;
  /** 1st/2nd/3rd offensive option. Ranks must be unique across the roster. */
  optionRank?: 1 | 2 | 3;
}

/** 1st/2nd/3rd offensive options by player ID. */
export interface OffensiveOptions {
  first?: string | null;
  second?: string | null;
  third?: string | null;
}

export interface Lineup {
  slots: LineupSlot[];
}

export interface TeamSkip {
  used: boolean;
  remaining: number;
  franchise?: string;
}

export interface DecadeSkip {
  used: boolean;
  remaining: number;
  decade?: string;
}

export interface DraftState {
  currentRound: number;
  maxRounds: number;
  pool: DraftPool | null;
  lineup: Lineup;
  teamSkip: TeamSkip;
  decadeSkip: DecadeSkip;
  spinsLeft: number;
  draftedPlayers: string[];
  /** Same-person keys of drafted players — blocks other-era versions of the same player. */
  draftedPersonKeys: string[];
  availablePools: DraftPool[];
  isSpinning: boolean;
  spinResult: { franchise: string; decade: string } | null;
  error: string | null;
}

export interface EraInfo {
  id: string;
  label: string;
  era: string;
  range: string;
  teams: number;
  avgOverall: number;
  difficulty: string;
}

export interface SimulationResult {
  wins: number;
  losses: number;
  winPct: number;
  projectedWins?: number;
  teamStrength?: number;
  /** Player ID of the Sixth Man (bench) if the season was simulated with a 10-man rotation. */
  sixthManId?: string | null;
  /** 1st/2nd/3rd offensive options used for the season sim. */
  optionIds?: OffensiveOptions | null;
  /** Null = default mixed modern league. */
  era: { id: string; label: string } | null;
  games: GameResult[];
  playerStats: SimulatedPlayerStats[];
  teamStats: TeamSeasonStats;
  /** Full league table. Absent on seasons simulated before this shipped. */
  standings?: TeamStanding[];
  opponentPlayerStats?: SimulatedPlayerStats[];
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

export interface GameResult {
  gameNumber: number;
  opponent: string;
  result: 'W' | 'L';
  score: { us: number; them: number };
  isHome: boolean;
  /** Overtime periods played (0 = regulation). Absent on old saves. */
  otPeriods?: number;
  playerPerformances: PlayerGamePerformance[];
  /** Opponent box score. Absent on seasons simulated before this shipped. */
  opponentPerformances?: PlayerGamePerformance[];
}

export interface PlayerGamePerformance {
  playerId: string;
  playerName: string;
  stats: PlayerStats;
  minutes: number;
  /** Base card info (present on fresh sims, absent on old saves). */
  position?: Position;
  secondaryPositions?: Position[];
  overall?: number;
  heightIn?: number;
  team?: string;
  baseStats?: PlayerStats;
}

export interface SimulatedPlayerStats {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  minutesPerGame?: number;
  averages: PlayerStats;
  totals: PlayerStats;
  highGames?: { pts: number; reb: number; ast: number; stl: number; blk: number; pf: number };
  position?: Position;
  secondaryPositions?: Position[];
  overall?: number;
  heightIn?: number;
  team?: string;
  baseStats?: PlayerStats;
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
}

export interface PlayoffGameResult {
  homeScore: number;
  awayScore: number;
  otPeriods: number;
  homePlayerStats: Record<string, PlayerStats>;
  awayPlayerStats: Record<string, PlayerStats>;
  homeMinutes: Record<string, number>;
  awayMinutes: Record<string, number>;
  events: Array<{
    quarter: number;
    time: string;
    type: string;
    playerId: string;
    playerName: string;
    team: 'home' | 'away';
    points?: number;
    description: string;
  }>;
}

// Matches GET /api/simulation/historical-teams + POST /vs-mode response.
export interface VSModeMatchup {
  userLineup: Lineup;
  historicalTeam: HistoricalTeam;
  seriesLength: 1 | 7;
  results: VSSeriesResult[];
  games: VSSeriesResult[];
  userWins: number;
  historicalWins: number;
  seriesWinner: 'user' | 'historical';
}

export interface VSSeriesResult {
  gameNumber: number;
  winner: 'user' | 'historical';
  score: { user: number; historical: number };
  /** Overtime periods played (0 = regulation). Absent on old saves. */
  otPeriods?: number;
  boxScore: VSBoxScore;
}

export interface VSBoxScore {
  user: PlayerGamePerformance[];
  historical: PlayerGamePerformance[];
}

export interface AppState {
  phase: 'draft' | 'season-setup' | 'simulation' | 'results' | 'vs-mode';
  draftState: DraftState;
  simulationResult: SimulationResult | null;
  vsMatchup: VSModeMatchup | null;
}
