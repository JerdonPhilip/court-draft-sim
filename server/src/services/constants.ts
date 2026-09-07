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
  // Points per unit of rating differential. Lower = more parity/underdog wins.
  SCORE_SPREAD_FACTOR: 0.45,
  // Uniform score noise amplitude multiplier (see simulateGameScore).
  SCORE_NOISE: 20,
} as const;

// --- Strength / projection model (mirrored in client/src/utils/helpers.ts) ---
// Expected deterministic base impact of one average league opponent pool
// (neutral venue, no variance/fatigue). Derived analytically from the
// opponent generator in routes/simulation.ts, which fields 24 regular
// pools (overall ~ U[74,88], E[base] ~= 35.9) and 6 contender pools
// (overall ~ U[88,96], E[base] ~= 53.3):
//   (24 x 35.9 + 6 x 53.3) / 30 ~= 39.4
// Recompute if those ranges change; harness checks projection error.
export const LEAGUE_AVG_IMPACT = 39.4;

// Strength points per unit of base-impact differential vs league average.
export const IMPACT_TO_STRENGTH = 1.2;

// Logistic divisor mapping strength differential to win probability.
export const WIN_CURVE_DIVISOR = 22;
