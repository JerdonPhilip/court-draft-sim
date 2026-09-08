import { Player, Position } from '../types/game.js';

/**
 * Engine trait tables & estimators (Section 1/3 supply).
 *
 * The historical database stores only PTS/REB/AST/STL/BLK (+ height/overall/
 * positions). Everything below that isn't on the card is ESTIMATED here with
 * fixed, documented formulas — never random, never hidden. Any explicit
 * per-player override (pace, tsPct, tov, usageRate, defRating, clutch) wins
 * over the estimate, so real data can slot in card-by-card later.
 *
 * Client mirror: ERA_PACE / ERA_TS / normalizeStat / tsPctOf / tovOf /
 * usageRateOf / efficiencyFactor are duplicated in client/src/utils/helpers.ts
 * (deterministic base impact must match the sim structurally). Pace,
 * defRating and clutch stay server-side (live-game only).
 */

export const REFERENCE_PACE = 98;

/** Typical possessions-per-48 by decade (research approximations). */
export const ERA_PACE: Record<string, number> = {
  '1960s': 118,
  '1970s': 106,
  '1980s': 102,
  '1990s': 92,
  '2000s': 91,
  '2010s': 96,
  '2020s': 99,
};

/** League-average true shooting by decade (research approximations). */
export const ERA_TS: Record<string, number> = {
  '1960s': 0.487,
  '1970s': 0.5,
  '1980s': 0.532,
  '1990s': 0.529,
  '2000s': 0.531,
  '2010s': 0.545,
  '2020s': 0.58,
};

const POSITION_PACE_OFFSET: Record<Position, number> = {
  PG: 3,
  SG: 1,
  SF: 0,
  PF: -2,
  C: -4,
};

/** League-average free-throw rate (server-side only: the soft-defense debuff needs matchup context). */
export const LEAGUE_AVG_FTR = 0.25;

/** Era-average 3PT attempt rate (mirrored on the client for the spacing boost). */
export const ERA_3PAR: Record<string, number> = {
  '1960s': 0.02,
  '1970s': 0.02,
  '1980s': 0.06,
  '1990s': 0.1,
  '2000s': 0.18,
  '2010s': 0.28,
  '2020s': 0.35,
};

const POSITION_3PAR_BASE: Record<Position, number> = {
  PG: 0.35,
  SG: 0.38,
  SF: 0.33,
  PF: 0.25,
  C: 0.12,
};

const POSITION_FT_BASE: Record<Position, number> = {
  PG: 0.78,
  SG: 0.76,
  SF: 0.74,
  PF: 0.72,
  C: 0.68,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function eraPace(decade: string | undefined): number {
  return ERA_PACE[decade ?? ''] ?? ERA_PACE['2020s']!;
}

export function eraLeagueTS(decade: string | undefined): number {
  return ERA_TS[decade ?? ''] ?? ERA_TS['2010s']!;
}

type TraitInput = Pick<Player, 'position' | 'stats' | 'overall' | 'decade'> &
  Partial<Pick<Player, 'pace' | 'tsPct' | 'tov' | 'usageRate' | 'defRating' | 'clutch' | 'ftr' | 'ftPct' | 'threePar' | 'foulProneness'>>;

/** Pace-neutralize one raw stat against the reference pace. */
export function normalizeStat(raw: number, decade: string | undefined): number {
  return raw * (REFERENCE_PACE / eraPace(decade));
}

export function paceRatingOf(p: TraitInput): number {
  if (typeof p.pace === 'number' && Number.isFinite(p.pace)) return p.pace;
  return clamp(Math.round(eraPace(p.decade) + (POSITION_PACE_OFFSET[p.position] ?? 0)), 85, 110);
}

/** Efficiency proxy: era baseline shifted by overall tier. */
export function tsPctOf(p: TraitInput): number {
  if (typeof p.tsPct === 'number' && Number.isFinite(p.tsPct)) return p.tsPct;
  return clamp(eraLeagueTS(p.decade) + (p.overall - 82) * 0.0035, 0.42, 0.68);
}

/** Ball-security proxy: handlers turn it over more; precision offsets it. */
export function tovOf(p: TraitInput): number {
  if (typeof p.tov === 'number' && Number.isFinite(p.tov)) return p.tov;
  return clamp(1.2 + p.stats.ast * 0.18 + (p.stats.pts > 20 ? 0.5 : 0) - (p.overall - 80) * 0.02, 0.5, 5);
}

/** Load proxy: scoring volume + creation burden. */
export function usageRateOf(p: TraitInput): number {
  if (typeof p.usageRate === 'number' && Number.isFinite(p.usageRate)) return p.usageRate;
  return clamp(14 + p.stats.pts * 0.55 + p.stats.ast * 0.4, 10, 38);
}

/** Stopper proxy: stocks + boards + size bonus for glass-eaters. */
export function defRatingOf(p: TraitInput): number {
  if (typeof p.defRating === 'number' && Number.isFinite(p.defRating)) return p.defRating;
  return clamp(
    Math.round(
      66 + (p.overall - 75) * 0.7 + (p.stats.stl + p.stats.blk) * 4 + p.stats.reb * 0.25 + Math.max(0, p.stats.reb - 8) * 1.5,
    ),
    60,
    99,
  );
}

/** Late-game proxy: proven overall tier + scoring burden. */
export function clutchOf(p: TraitInput): number {
  if (typeof p.clutch === 'number' && Number.isFinite(p.clutch)) return p.clutch;
  return clamp(Math.round(62 + (p.overall - 78) * 0.9 + (p.stats.pts - 15) * 0.6), 50, 99);
}

/** Section 1.4 efficiency modifier: TS% vs era average (spec v2 drops the TOV term). */
export function efficiencyFactor(p: TraitInput): number {
  return Math.max(0.5, tsPctOf(p) / eraLeagueTS(p.decade));
}

/** Perimeter gravity: high-volume guards space the floor; pre-1980 ~0 (no line). */
export function threeParOf(p: TraitInput): number {
  if (typeof p.threePar === 'number' && Number.isFinite(p.threePar)) return p.threePar;
  if (p.decade === '1960s' || p.decade === '1970s') return 0.02;
  return clamp((POSITION_3PAR_BASE[p.position] ?? 0.3) + (p.stats.pts - 15) * 0.008, 0.02, 0.55);
}

/** Foul-drawing: slashers and bigs live at the stripe; bombers don't. */
export function ftrOf(p: TraitInput): number {
  if (typeof p.ftr === 'number' && Number.isFinite(p.ftr)) return p.ftr;
  const bigBonus = p.position === 'C' || p.position === 'PF' ? 0.05 : 0;
  return clamp(0.18 + (p.stats.pts - 12) * 0.006 + bigBonus - threeParOf(p) * 0.15, 0.1, 0.5);
}

export function ftPctOf(p: TraitInput): number {
  if (typeof p.ftPct === 'number' && Number.isFinite(p.ftPct)) return p.ftPct;
  return clamp((POSITION_FT_BASE[p.position] ?? 0.73) + (p.overall - 80) * 0.002, 0.5, 0.92);
}

/** Gambling vs clean: stocks raise it, precision lowers it. */
export function foulPronenessOf(p: TraitInput): number {
  if (typeof p.foulProneness === 'number' && Number.isFinite(p.foulProneness)) return p.foulProneness;
  return clamp(Math.round(42 + (p.stats.stl + p.stats.blk) * 7 - (p.overall - 80) * 0.3), 1, 100);
}

export function teamFTr(lineup: Array<Player | null | undefined>): number {
  const present = lineup.filter((p): p is Player => !!p);
  if (present.length === 0) return LEAGUE_AVG_FTR;
  return present.reduce((t, p) => t + ftrOf(p), 0) / present.length;
}

export function team3PAR(lineup: Array<Player | null | undefined>): number {
  const present = lineup.filter((p): p is Player => !!p);
  if (present.length === 0) return 0.2;
  return present.reduce((t, p) => t + threeParOf(p), 0) / present.length;
}

/** Mean era-average 3PAR across a roster's own decades (spacing benchmark). */
export function rosterEra3PAR(lineup: Array<Player | null | undefined>): number {
  const present = lineup.filter((p): p is Player => !!p);
  if (present.length === 0) return 0.2;
  return present.reduce((t, p) => t + (ERA_3PAR[p.decade ?? ''] ?? 0.2), 0) / present.length;
}
