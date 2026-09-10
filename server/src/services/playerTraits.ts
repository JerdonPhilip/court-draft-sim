import { Player, Position } from '../types/game.js';
import type { EraContext, NormalizedStats, PlayerAttributes } from '../types/player.js';
import { getEraContext } from './eraConfig.js';

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
  return ERA_TS[decade ?? ''] ?? ERA_TS['2020s']!;
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
  return Math.max(0.5, Math.min(1.25, tsPctOf(p) / eraLeagueTS(p.decade)));
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

// ---------------------------------------------------------------------------
// 2K-style attribute estimator pipeline (spec v1.4.0)
// ---------------------------------------------------------------------------

const clampAttr = (v: number): number => Math.max(25, Math.min(99, Math.round(v)));

const isBig = (pos: Position): boolean => pos === 'C' || pos === 'PF';
const isGuard = (pos: Position): boolean => pos === 'PG' || pos === 'SG';
const isWing = (pos: Position): boolean => pos === 'PG' || pos === 'SG' || pos === 'SF';

const POSITION_HEIGHT_BASELINE_LOCAL: Record<Position, number> = {
  PG: 74,
  SG: 77,
  SF: 79,
  PF: 81,
  C: 83,
};

function heightOf(card: Pick<Player, 'position' | 'heightIn'>): number {
  if (typeof card.heightIn === 'number' && Number.isFinite(card.heightIn)) return card.heightIn;
  return POSITION_HEIGHT_BASELINE_LOCAL[card.position] ?? 79;
}

function mpgEstimate(overall: number, explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return Math.max(10, Math.min(40, explicit));
  return Math.max(15, Math.min(38, 20 + (overall - 60) * 0.5));
}

export type AttributeEstimatorInput = Pick<Player, 'position' | 'overall' | 'decade' | 'heightIn'> &
  Partial<Pick<Player, 'attributes'>>;

function explicitOr(
  card: AttributeEstimatorInput,
  key: keyof PlayerAttributes,
  fallback: number,
): number {
  const raw = card.attributes?.[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return clampAttr(raw);
  return clampAttr(fallback);
}

/**
 * Build pace-normalized estimator inputs from a stored Player card.
 * Counting stats are pace-neutralized; rate/defense traits reuse the
 * existing estimators so explicit overrides still win.
 */
export function normalizedStatsFor(player: Player, mpg?: number): NormalizedStats {
  return {
    pts: normalizeStat(player.stats.pts, player.decade),
    reb: normalizeStat(player.stats.reb, player.decade),
    ast: normalizeStat(player.stats.ast, player.decade),
    stl: normalizeStat(player.stats.stl, player.decade),
    blk: normalizeStat(player.stats.blk, player.decade),
    tov: tovOf(player),
    tsPct: tsPctOf(player),
    ftPct: ftPctOf(player),
    threePar: threeParOf(player),
    defRating: defRatingOf(player),
    clutch: clutchOf(player),
    usageRate: usageRateOf(player),
    mpg: mpgEstimate(player.overall, mpg),
  };
}

/**
 * Estimate the full 2K attribute block. Any explicitly defined rating on
 * `card.attributes` takes priority; missing keys use the documented
 * formula fallback derived from position, overall, pace-normalized stats
 * and era context. All outputs are integers in [25, 99].
 */
export function estimateAttributes(
  card: AttributeEstimatorInput,
  stats: NormalizedStats,
  era: EraContext,
): PlayerAttributes {
  const pos = card.position;
  const ovr = card.overall;
  const big = isBig(pos);
  const guard = isGuard(pos);
  const wing = isWing(pos);
  const height = heightOf(card as Pick<Player, 'position' | 'heightIn'>);
  const decade = (card as { decade?: string }).decade ?? era.decade ?? '';
  const pts = stats.pts;
  const reb = stats.reb;
  const ast = stats.ast;
  const stl = stats.stl;
  const blk = stats.blk;
  const tov = stats.tov;
  const tsPct = stats.tsPct;
  const ftPct = stats.ftPct;
  const threePar = stats.threePar;
  const defRating = stats.defRating;
  const clutch = stats.clutch;
  const mpg = mpgEstimate(ovr, stats.mpg);

  // --- Physicals first (other estimators depend on them) ---
  const strengthBase: Record<Position, number> = { C: 65, PF: 55, SF: 45, SG: 35, PG: 30 };
  let strengthRaw = strengthBase[pos] ?? 40;
  if (big) strengthRaw += reb * 1.5;
  if (era.physicality >= 0.8) strengthRaw += 8;

  const baseline = POSITION_HEIGHT_BASELINE_LOCAL[pos] ?? 79;
  const heightPenalty = Math.max(0, height - baseline) * 1.0;
  let speedRaw = 50 + (ovr - 70) * 0.7 - heightPenalty;
  if (pos === 'PG' || pos === 'SG') speedRaw += 10;
  if (pos === 'C') speedRaw -= 15;
  else if (pos === 'PF') speedRaw -= 8;
  if (era.paceFactor >= 1.05) speedRaw += 5;

  let agilityRaw = 50 + stl * 5 + (ovr - 70) * 0.5;
  if (pos === 'PG' || pos === 'SG') agilityRaw += 12;
  else if (pos === 'SF') agilityRaw += 5;
  if (big) agilityRaw -= 10;

  // Vertical base (before the drivingDunk kicker) so the dunk <-> vert
  // cycle resolves deterministically in one pass.
  let verticalBase = 40 + pts * 0.4 + clampAttr(speedRaw) * 0.3;
  if (wing) verticalBase += 10;

  // --- Finishing / shooting fallbacks ---
  const closeRaw = 45 + pts * 0.8 + (ovr - 75) * 0.5 + (big ? 10 : 0);

  // drivingLayup needs speed + strength (hand-checking check).
  const speedEst = clampAttr(speedRaw);
  const strengthEst = clampAttr(strengthRaw);
  let layupRaw = 40 + pts * 0.6 + speedEst * 0.3 + (guard ? 12 : 0);
  if (era.handChecking && strengthEst < 70) layupRaw -= 5;

  // drivingDunk needs vertical.
  const verticalEstBase = clampAttr(verticalBase);
  let dunkRaw: number;
  if (big) dunkRaw = 25 + verticalEstBase * 0.4 + pts * 0.2;
  else dunkRaw = 30 + verticalEstBase * 0.5 + pts * 0.3 + (ovr - 80) * 0.8;
  if (height < 76 && verticalEstBase < 95) dunkRaw = Math.min(dunkRaw, 85);
  const dunkEst = clampAttr(dunkRaw);

  const verticalRaw = verticalBase + (dunkEst >= 80 ? 8 : 0);

  const standingRaw = big
    ? 50 + reb * 1.5 + strengthEst * 0.4
    : 25 + verticalEstBase * 0.3;

  let postRaw = big ? 40 + pts * 0.7 + strengthEst * 0.5 : 30 + pts * 0.4;
  if (big && era.paintDensity >= 0.7) postRaw += 8;

  let midRaw = 40 + pts * 0.9 + (ovr - 75) * 0.6;
  if (decade === '1990s' || decade === '2000s') midRaw += 5;
  else if (decade === '2010s' || decade === '2020s') midRaw -= 5;

  let threeRaw: number;
  if (era.threePointEmphasis <= 0.0) {
    threeRaw = 25 + (ovr - 70) * 0.3;
    if (pos === 'SG' || pos === 'SF') threeRaw += 5;
    threeRaw = Math.min(threeRaw, 45);
  } else if (era.threePointEmphasis < 0.5) {
    threeRaw = 30 + threePar * 40 + (ovr - 75) * 0.4;
    if (pos === 'SG' || pos === 'SF') threeRaw += 5;
    threeRaw = Math.min(threeRaw, 75);
  } else {
    threeRaw = 35 + threePar * 50 + (ovr - 75) * 0.5;
    if (pos === 'SG' || pos === 'SF') threeRaw += 5;
  }

  const ftRaw = ftPct >= 0.75 ? 60 + ftPct * 40 : 50 + ftPct * 50;

  // --- Playmaking ---
  let passRaw = 35 + ast * 4 - tov * 3 + (ovr - 75) * 0.4;
  if (pos === 'PG') passRaw += 15;
  else if (pos === 'SG' || pos === 'SF') passRaw += 5;
  if (era.zoneDefense) passRaw += 5;

  let handleRaw = 35 + ast * 3 - tov * 4 + (ovr - 70) * 0.6;
  if (pos === 'PG') handleRaw += 18;
  else if (pos === 'SG') handleRaw += 10;
  if (era.handChecking) handleRaw -= 5;
  const handleEst = clampAttr(handleRaw);

  let swbRaw = 35 + speedEst * 0.5 + handleEst * 0.3;
  if (guard) swbRaw += 10;
  if (era.handChecking) swbRaw -= 5;

  // --- Defense / rebounding ---
  const agilityEst = clampAttr(agilityRaw);
  let intDefRaw = big
    ? 45 + defRating * 0.5 + blk * 4 + strengthEst * 0.3
    : 30 + defRating * 0.4 + blk * 2;
  if (big && era.paintDensity >= 0.7) intDefRaw += 5;

  let perDefRaw = !big
    ? 45 + defRating * 0.5 + stl * 4 + agilityEst * 0.3
    : 30 + defRating * 0.4 + stl * 2;
  if (guard && era.handChecking) perDefRaw += 8;

  let stealRaw = 30 + stl * 10 + defRating * 0.2;
  if (guard) stealRaw += 10;
  if (era.handChecking) stealRaw += 5;

  let blockRaw = 25 + blk * 15 + verticalEstBase * 0.3;
  if (pos === 'C' || pos === 'PF') blockRaw += 20;
  else if (pos === 'SF') blockRaw += 10;

  let orebRaw = 25 + reb * 3 + strengthEst * 0.4;
  if (big) orebRaw += 15;
  if (era.paintDensity >= 0.7) orebRaw += 5;
  if (era.threePointEmphasis >= 0.5) orebRaw -= 5;

  let drebRaw = 30 + reb * 4 + strengthEst * 0.3;
  if (big) drebRaw += 15;

  let staminaRaw = 50 + (ovr - 70) * 0.8 + mpg * 0.5;
  if (era.paceFactor >= 1.05) staminaRaw += 5;

  // --- Mental ---
  const shotIqRaw = 40 + ovr * 0.4 + tsPct * 40 + (pts >= 25 ? 5 : 0);

  let ppRaw = 35 + ast * 5 + defRating * 0.3;
  if (pos === 'PG') ppRaw += 10;

  const dcRaw = 40 + defRating * 0.5 + (defRating >= 88 ? 8 : 0);

  let ocRaw = 40 + ovr * 0.5;
  if (ovr >= 90) ocRaw += 10;
  else if (ovr < 75) ocRaw -= 5;

  let helpRaw = 35 + defRating * 0.4 + blk * 5 + stl * 5;
  if (big) helpRaw += 5;
  if (era.zoneDefense) helpRaw += 5;

  const intRaw = 40 + ovr * 0.5 + clutch * 0.2 + (ovr >= 95 ? 10 : 0);

  let potRaw: number;
  if (ovr >= 90) potRaw = 90 + (ovr - 90) * 0.5;
  else if (ovr >= 80) potRaw = 80 + (ovr - 80) * 0.6;
  else if (ovr >= 70) potRaw = 75 + (ovr - 70) * 0.5;
  else potRaw = 65 + (ovr - 60) * 0.5;
  potRaw = Math.min(potRaw, 99);

  // Respect explicit overrides (clamped) for every key.
  return {
    closeShot: explicitOr(card, 'closeShot', closeRaw),
    drivingLayup: explicitOr(card, 'drivingLayup', layupRaw),
    drivingDunk: explicitOr(card, 'drivingDunk', dunkRaw),
    standingDunk: explicitOr(card, 'standingDunk', standingRaw),
    postControl: explicitOr(card, 'postControl', postRaw),
    midRangeShot: explicitOr(card, 'midRangeShot', midRaw),
    threePointShot: explicitOr(card, 'threePointShot', threeRaw),
    freeThrow: explicitOr(card, 'freeThrow', ftRaw),
    passAccuracy: explicitOr(card, 'passAccuracy', passRaw),
    ballHandle: explicitOr(card, 'ballHandle', handleRaw),
    speedWithBall: explicitOr(card, 'speedWithBall', swbRaw),
    interiorDefense: explicitOr(card, 'interiorDefense', intDefRaw),
    perimeterDefense: explicitOr(card, 'perimeterDefense', perDefRaw),
    steal: explicitOr(card, 'steal', stealRaw),
    block: explicitOr(card, 'block', blockRaw),
    offensiveRebound: explicitOr(card, 'offensiveRebound', orebRaw),
    defensiveRebound: explicitOr(card, 'defensiveRebound', drebRaw),
    speed: explicitOr(card, 'speed', speedRaw),
    agility: explicitOr(card, 'agility', agilityRaw),
    strength: explicitOr(card, 'strength', strengthRaw),
    vertical: explicitOr(card, 'vertical', verticalRaw),
    stamina: explicitOr(card, 'stamina', staminaRaw),
    shotIq: explicitOr(card, 'shotIq', shotIqRaw),
    passPerception: explicitOr(card, 'passPerception', ppRaw),
    defensiveConsistency: explicitOr(card, 'defensiveConsistency', dcRaw),
    offensiveConsistency: explicitOr(card, 'offensiveConsistency', ocRaw),
    helpDefenseIq: explicitOr(card, 'helpDefenseIq', helpRaw),
    intangibles: explicitOr(card, 'intangibles', intRaw),
    potential: explicitOr(card, 'potential', potRaw),
  };
}

/**
 * Convenience: resolve attributes for a stored Player, deriving the era
 * from the card decade when no explicit EraContext is supplied.
 */
export function resolvePlayerAttributes(player: Player, era?: EraContext): PlayerAttributes {
  const ctx = era ?? getEraContext(player.decade ?? '2020s');
  return estimateAttributes(player, normalizedStatsFor(player), ctx);
}

/** Recalculated stopper rating from the 2K defensive block (Part 7). */
export function defRatingFromAttributes(a: PlayerAttributes): number {
  return Math.round(
    a.perimeterDefense * 0.35 +
      a.interiorDefense * 0.25 +
      a.steal * 0.15 +
      a.block * 0.1 +
      a.defensiveConsistency * 0.15,
  );
}
