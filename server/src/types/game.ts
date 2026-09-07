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
}

export function getPlayerPositions(player: Pick<Player, 'position' | 'secondaryPositions'>): Position[] {
  const seen = new Set<Position>([player.position]);
  for (const p of player.secondaryPositions ?? []) seen.add(p);
  return [...seen];
}

export function canPlayPosition(player: Pick<Player, 'position' | 'secondaryPositions'>, slot: Position): boolean {
  return getPlayerPositions(player).includes(slot);
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
  /** Overtime periods played (0 = regulation decision). */
  otPeriods: number;
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
}

export interface SeasonGameResult {
  gameNumber: number;
  opponent: string;
  isHome: boolean;
  result: 'W' | 'L' | 'T';
  score: { us: number; them: number };
  /** Overtime periods played (0 = regulation decision). */
  otPeriods: number;
  playerStats: Record<string, PlayerStats>;
  userMinutes: Record<string, number>;
  opponentPlayerStats: Record<string, PlayerStats>;
  opponentRoster: Array<{ playerId: string; playerName: string }>;
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