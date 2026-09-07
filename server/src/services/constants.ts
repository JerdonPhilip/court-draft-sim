import { SimulationConfig } from '../types/game.js';

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  variance: 0.15,
  homeCourtAdvantage: 0.035,
  fatigueFactor: 0.02,
  injuryRisk: 0.005,
};

export const SIMULATION_CONSTANTS = {
  BASE_PACE: 98,
  BASE_EFFICIENCY: 1.08,
  MAX_GAMES: 82,
  PLAYOFF_SERIES_LENGTH: 7,
  BASE_SCORE: 105,
  MIN_SCORE: 70,
} as const;