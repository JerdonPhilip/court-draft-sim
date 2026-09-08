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
// Rating curve + usage concentration (keep both files in sync):
// - OVERALL_CURVE_EXPONENT bends the overall multiplier so MVP-tier cards
//   separate from starters: 96 -> 0.94x, 89 -> 0.84x, 78 -> 0.69x instead of
//   a flat 0.96/0.89/0.78 that compressed stars into their supporting cast.
// - STAR_USAGE_BONUS concentrates possessions in the best players (real teams
//   run everything through their stars; the 5th man doesn't match the alpha
//   possession for possession). Applied to the impact-sorted lineup.
// Recompute LEAGUE_AVG_IMPACT empirically if either changes (see note below).
export const OVERALL_CURVE_EXPONENT = 1.5;
export const STAR_USAGE_BONUS = [1.18, 1.07, 1.0, 0.95, 0.9] as const;
// Expected deterministic base impact of one average league opponent pool
// (neutral venue, no variance/fatigue), measured empirically: mean over 1200
// generated pools. Recompute the same way if the model or the generator in
// routes/simulation.ts changes.
export const LEAGUE_AVG_IMPACT = 38.1;

// --- Height model (mirrored in client/src/utils/helpers.ts) ---
// Average NBA height per position (inches). Players rebound and protect
// the rim better than their positional average when taller than it.
export const POSITION_HEIGHT_BASELINE: Record<string, number> = {
  PG: 74,
  SG: 77,
  SF: 79,
  PF: 81,
  C: 83,
};

// Rating multiplier per inch above/below baseline, by category.
export const HEIGHT_REB_PER_INCH = 0.05;
export const HEIGHT_BLK_PER_INCH = 0.06;
export const HEIGHT_FACTOR_MIN = 0.88;
export const HEIGHT_FACTOR_MAX = 1.12;

// Strength points per unit of base-impact differential vs league average.
export const IMPACT_TO_STRENGTH = 1.2;

// Logistic divisor mapping strength differential to win probability.
export const WIN_CURVE_DIVISOR = 22;
