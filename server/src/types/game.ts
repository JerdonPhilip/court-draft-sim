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
}

export interface GameSimulationOutput {
  homeScore: number;
  awayScore: number;
  homePlayerStats: Map<string, PlayerStats>;
  awayPlayerStats: Map<string, PlayerStats>;
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

export interface SeasonSimulationResult {
  wins: number;
  losses: number;
  games: SeasonGameResult[];
  playerSeasonStats: Map<string, PlayerSeasonStats>;
  teamStats: TeamSeasonStats;
}

export interface SeasonGameResult {
  gameNumber: number;
  opponent: string;
  isHome: boolean;
  result: 'W' | 'L';
  score: { us: number; them: number };
  playerStats: Map<string, PlayerStats>;
}

export interface PlayerSeasonStats {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  minutesPerGame: number;
  averages: PlayerStats;
  totals: PlayerStats;
  highGames: { pts: number; reb: number; ast: number; stl: number; blk: number };
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