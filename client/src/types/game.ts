export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export interface PlayerStats {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  team: string;
  decade: string;
  era: string;
  stats: PlayerStats;
  overall: number;
  archetype: string;
  imageUrl?: string;
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
}

export interface Lineup {
  slots: LineupSlot[];
}

export interface TeamSkip {
  used: boolean;
  franchise?: string;
}

export interface DecadeSkip {
  used: boolean;
  decade?: string;
}

export interface DraftState {
  currentRound: number;
  maxRounds: number;
  pool: DraftPool | null;
  lineup: Lineup;
  teamSkip: TeamSkip;
  decadeSkip: DecadeSkip;
  draftedPlayers: string[];
  availablePools: DraftPool[];
  isSpinning: boolean;
  spinResult: { franchise: string; decade: string } | null;
  error: string | null;
}

export interface SimulationResult {
  wins: number;
  losses: number;
  winPct: number;
  games: GameResult[];
  playerStats: SimulatedPlayerStats[];
  teamStats: TeamSeasonStats;
}

export interface GameResult {
  gameNumber: number;
  opponent: string;
  result: 'W' | 'L';
  score: { us: number; them: number };
  isHome: boolean;
  playerPerformances: PlayerGamePerformance[];
}

export interface PlayerGamePerformance {
  playerId: string;
  playerName: string;
  stats: PlayerStats;
  minutes: number;
}

export interface SimulatedPlayerStats {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  averages: PlayerStats;
  totals: PlayerStats;
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

export interface VSModeMatchup {
  userLineup: Lineup;
  historicalTeam: HistoricalTeam;
  seriesLength: 1 | 7;
  results: VSSeriesResult[];
}

export interface VSSeriesResult {
  gameNumber: number;
  winner: 'user' | 'historical';
  score: { user: number; historical: number };
  boxScore: VSBoxScore;
}

export interface VSBoxScore {
  user: PlayerGamePerformance[];
  historical: PlayerGamePerformance[];
}

export interface AppState {
  phase: 'draft' | 'simulation' | 'results' | 'vs-mode';
  draftState: DraftState;
  simulationResult: SimulationResult | null;
  vsMatchup: VSModeMatchup | null;
}