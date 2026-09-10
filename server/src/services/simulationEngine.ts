import {
  Player,
  PlayerStats,
  GameSimulationInput,
  GameSimulationOutput,
  SeasonSimulationResult,
  SimulationConfig,
  GameEvent,
  PlayerSeasonStats,
  Position,
  TeamSeasonStats,
  MinutesMap,
  getPlayerPositions,
} from '../types/game.js';
import { DEFAULT_SIMULATION_CONFIG, SIMULATION_CONSTANTS, LEAGUE_AVG_IMPACT, IMPACT_TO_STRENGTH, WIN_CURVE_DIVISOR, OVERALL_CURVE_EXPONENT, STAR_USAGE_BONUS, POSITION_HEIGHT_BASELINE, HEIGHT_REB_PER_INCH, HEIGHT_BLK_PER_INCH, HEIGHT_FACTOR_MIN, HEIGHT_FACTOR_MAX } from './constants.js';
import {
  normalizeStat,
  efficiencyFactor,
  usageRateOf,
  defRatingOf,
  foulPronenessOf,
  paceRatingOf,
  clutchOf,
  teamFTr,
  team3PAR,
  rosterEra3PAR,
  LEAGUE_AVG_FTR,
  resolvePlayerAttributes,
  defRatingFromAttributes,
} from './playerTraits.js';
import { getEraContext } from './eraConfig.js';
import {
  applyEraModifiers,
  threePointEffectivenessMultiplier,
  midRangeEffectivenessMultiplier,
  rimSuccessMultiplier,
  fatigueRateMultiplier,
  helpDefenseContribution,
  perimeterDefenseMultiplier,
  possessionsMultiplier,
  turnoverMultiplier,
  foulPronenessMultiplier,
} from './eraEngine.js';
import type { EraContext, PlayerAttributes } from '../types/player.js';
import { secureRandom } from './random.js';

// --- 2K attribute + era integration (spec v1.4.0, Parts 6-9) ---
// Cache is content-aware: user-supplied Player objects with the same id but
// different stats must not share entries (cache poisoning). Keys include a
// fingerprint of everything that feeds resolve/apply. Bounded to avoid leaks.
const resolvedAttrCache = new Map<string, PlayerAttributes>();
const modifiedAttrCache = new Map<string, PlayerAttributes>();
const ATTR_CACHE_MAX = 5000;

function attrFingerprint(p: Player): string {
  const s = p.stats;
  const a = p.attributes ?? {};
  return `${p.id}|${p.position}|${p.decade ?? ''}|${p.overall}|${s.pts},${s.reb},${s.ast},${s.stl},${s.blk},${(s as { pf?: unknown }).pf ?? ''}|${JSON.stringify(a)}|${p.pace ?? ''},${p.tsPct ?? ''},${p.tov ?? ''},${p.usageRate ?? ''},${p.defRating ?? ''},${p.clutch ?? ''}`;
}

function cacheSetBounded(map: Map<string, PlayerAttributes>, key: string, value: PlayerAttributes): void {
  if (map.size >= ATTR_CACHE_MAX) {
    // Evict oldest entry (Map preserves insertion order).
    const oldest = map.keys().next();
    if (!oldest.done) map.delete(oldest.value);
  }
  map.set(key, value);
}

function resolvedAttributesOf(player: Player): PlayerAttributes {
  const key = attrFingerprint(player);
  const hit = resolvedAttrCache.get(key);
  if (hit) return hit;
  const resolved = resolvePlayerAttributes(player);
  cacheSetBounded(resolvedAttrCache, key, resolved);
  return resolved;
}

function modifiedAttributesOf(player: Player): PlayerAttributes {
  const key = attrFingerprint(player);
  const hit = modifiedAttrCache.get(key);
  if (hit) return hit;
  const base = resolvedAttributesOf(player);
  const era = getEraContext(player.decade ?? '2020s');
  const modified = applyEraModifiers(base, era, player.position);
  cacheSetBounded(modifiedAttrCache, key, modified);
  return modified;
}

export function clearAttributeCaches(): void {
  resolvedAttrCache.clear();
  modifiedAttrCache.clear();
}

/** Blended era rules for a (possibly mixed-era) lineup: numerics averaged, flags by majority. */
export function teamEraContext(lineup: Array<Player | null | undefined>): EraContext {
  const present = lineup.filter((p): p is Player => !!p);
  if (present.length === 0) return getEraContext('2020s');
  let hand = 0;
  let zone = 0;
  let illegal = 0;
  let paint = 0;
  let phys = 0;
  let pace = 0;
  let three = 0;
  for (const p of present) {
    const e = getEraContext(p.decade ?? '2020s');
    if (e.handChecking) hand++;
    if (e.zoneDefense) zone++;
    if (e.illegalDefenseRules) illegal++;
    paint += e.paintDensity;
    phys += e.physicality;
    pace += e.paceFactor;
    three += e.threePointEmphasis;
  }
  const n = present.length;
  return {
    handChecking: hand * 2 >= n,
    zoneDefense: zone * 2 >= n,
    illegalDefenseRules: illegal * 2 >= n,
    paintDensity: paint / n,
    physicality: phys / n,
    paceFactor: pace / n,
    threePointEmphasis: three / n,
  };
}

/**
 * Attribute-driven scoring quality for one player (mean-neutral by design:
 * typical starters sit near 1.00, stars reach ~1.03, liabilities ~0.97).
 */
export function attributeScoringMultiplier(mod: PlayerAttributes, era: EraContext): number {
  const rimQ = ((mod.drivingLayup + mod.drivingDunk) / 2 / 80) * rimSuccessMultiplier(era);
  const midQ = (mod.midRangeShot / 78) * midRangeEffectivenessMultiplier(era);
  const threeQ = (mod.threePointShot / 72) * threePointEffectivenessMultiplier(era);
  // Blend toward 1 so era swings move shot mix more than raw efficiency.
  const shotQuality = (rimQ * 0.4 + midQ * 0.35 + threeQ * 0.25);
  const iq = 1 + (mod.shotIq - 70) * 0.0006 + (mod.offensiveConsistency - 70) * 0.0005;
  return Math.max(0.9, Math.min(1.1, 0.82 + 0.18 * shotQuality)) * iq;
}

export function attributeDefenseMultiplier(mod: PlayerAttributes, era: EraContext, position: string): number {
  const anchor = (mod.perimeterDefense + mod.interiorDefense) / 2;
  let m = 1 + (anchor - 70) * 0.0009 + (mod.defensiveConsistency - 70) * 0.0006;
  if (era.zoneDefense) m += (mod.helpDefenseIq - 70) * 0.0004;
  if (era.handChecking && (position === 'PG' || position === 'SG')) {
    m *= 1.01;
  }
  return Math.max(0.9, Math.min(1.1, m));
}

export function attributePlaymakingMultiplier(mod: PlayerAttributes, era: EraContext): number {
  let m = 1 + (mod.passAccuracy - 70) * 0.0005 + (mod.ballHandle - 70) * 0.0003;
  m /= turnoverMultiplier(mod, era) ** 0.5;
  return Math.max(0.9, Math.min(1.08, m));
}

/** Effective stopper rating blending the legacy estimate with the 2K block. */
export function effectiveDefRating(player: Player): number {
  const legacy = defRatingOf(player);
  const mod = modifiedAttributesOf(player);
  const rebuilt = defRatingFromAttributes({
    ...mod,
    perimeterDefense: Math.min(110, Math.max(0, mod.perimeterDefense * perimeterDefenseMultiplier(getEraContext(player.decade ?? '2020s')))),
  });
  const era = getEraContext(player.decade ?? '2020s');
  const help = helpDefenseContribution(era) > 0 ? mod.helpDefenseIq * helpDefenseContribution(era) : 0;
  return Math.round(legacy * 0.6 + (rebuilt + help * 0.4) * 0.4);
}

// --- Tunable simulation knobs (see services/constants.ts) ---
const BASE_SCORE = SIMULATION_CONSTANTS.BASE_SCORE;
const MIN_SCORE = SIMULATION_CONSTANTS.MIN_SCORE;
const SCORE_SPREAD_FACTOR = SIMULATION_CONSTANTS.SCORE_SPREAD_FACTOR;
const SCORE_NOISE = SIMULATION_CONSTANTS.SCORE_NOISE;
const THREE_POINT_RATE = 0.38;
const AVG_POSSESSIONS = SIMULATION_CONSTANTS.BASE_PACE;

function randomFloat(): number {
  // Uniform [0, 1) via crypto for auditable fairness (draft + sim).
  return secureRandom();
}

const POSITION_WEIGHTS = {
  PG: { pts: 1.1, reb: 0.4, ast: 1.5, stl: 1.3, blk: 0.2 },
  SG: { pts: 1.3, reb: 0.4, ast: 0.8, stl: 1.2, blk: 0.3 },
  SF: { pts: 1.2, reb: 0.7, ast: 0.8, stl: 1.1, blk: 0.6 },
  PF: { pts: 1.1, reb: 1.2, ast: 0.6, stl: 0.8, blk: 1.0 },
  C: { pts: 1.0, reb: 1.5, ast: 0.4, stl: 0.5, blk: 1.5 },
};

const STAT_IMPORTANCE = {
  pts: 0.35,
  reb: 0.20,
  ast: 0.20,
  stl: 0.12,
  blk: 0.13,
};

/**
 * 10-man rotation weights (order = starters first 5, bench last 5).
 * Bench matters but starters carry the team; the Sixth Man plays starter-lite
 * minutes and gets a small team-wide boost for second-unit creation.
 * Normalized back to a 5-man scale so league balance is preserved.
 */
export const BENCH_WEIGHT = 0.35;
export const SIXTH_WEIGHT = 0.65;
export const SIXTH_TEAM_BOOST = 1.015;

/**
 * Custom-minutes system (v1.2): when a minutes plan is supplied, rotation
 * weight becomes minutes share (mins/48) instead of the fixed
 * starter/sixth/bench weights, so allocations move win% — and 6-foul
 * ejections with DNP cover turn on. Omit the plan for the legacy fixed
 * rotation (fouls cap at 5, nobody ejects). Defaults are calibrated so a
 * default plan rates within ~1% of the legacy weights.
 */
export const DEFAULT_STARTER_MINUTES = 34;
export const DEFAULT_SIXTH_MINUTES = 22;
export const DEFAULT_BENCH_MINUTES = 12;
export const DEFAULT_NOSIXTH_BENCH_MINUTES = 14;
export const TEAM_MINUTES_REGULATION = 240;
export const TEAM_MINUTES_PER_OT = 25;
export const FOUL_OUT_LIMIT = 6;
/** Score drag per ejection with valid cover (DNP sub or teammates absorbing). */
export const FOUL_OUT_PTS_COVERED = 1.5;
/** Score drag per ejection with fewer than 5 left able to play. */
export const FOUL_OUT_PTS_SHORTHANDED = 4;
/** Overuse guard against 40+ minute ironman exploits. */
export const OVERUSE_THRESHOLD = 32;
export const OVERUSE_PER_MIN = 0.008;

/** CPU default plan (sums to 240): star-ranked starter loads, Sixth 22, deep bench. */
export function defaultMinutesFor(team: Player[], sixthManId?: string | null): MinutesMap {
  const map: MinutesMap = {};
  if (team.length === 0) return map;
  if (team.length <= 5) {
    const each = TEAM_MINUTES_REGULATION / team.length;
    for (const p of team) {
      if (p) map[p.id] = each;
    }
    return map;
  }
  const hasSixth = !!sixthManId && team.slice(5, 10).some((p) => p && p.id === sixthManId);
  // Star-driven loads: starters ranked by overall get the big minutes, so an
  // elite centerpiece actually plays like one (with the same overuse drag and
  // foul risk human plans face). Generational starters (93+) take 44.
  const starterOrder = [0, 1, 2, 3, 4]
    .filter((i) => team[i])
    .sort((a, b) => (team[b]!.overall ?? 0) - (team[a]!.overall ?? 0));
  const topOverall = team[starterOrder[0] ?? 0]?.overall ?? 0;
  const starterLoads = topOverall >= 93 ? [44, 36, 33, 31, 26] : [40, 36, 33, 31, 30];
  starterOrder.forEach((rosterIdx, rank) => {
    map[team[rosterIdx]!.id] = starterLoads[rank] ?? 30;
  });
  const benchOthers = team
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => p && i >= 5 && (!hasSixth || p.id !== sixthManId))
    .sort((a, b) => (b.p!.overall ?? 0) - (a.p!.overall ?? 0));
  if (hasSixth && sixthManId) map[sixthManId] = DEFAULT_SIXTH_MINUTES;
  // 170 (starters) + 22 (sixth) + 48 (bench) = 240.
  const benchLoads = [12, 12, 12, 12];
  benchOthers.forEach(({ p }, rank) => {
    map[p!.id] = hasSixth ? (benchLoads[rank] ?? 11) : DEFAULT_NOSIXTH_BENCH_MINUTES;
  });
  return map;
}

/** Round a minutes map to integers while holding the target total (drift goes to the largest share). */
function roundMapToTarget(map: MinutesMap, target: number): MinutesMap {
  const ids = Object.keys(map);
  const out: MinutesMap = {};
  let largest = '';
  let total = 0;
  for (const id of ids) {
    out[id] = Math.round(map[id] ?? 0);
    total += out[id]!;
    if (!largest || out[id]! > out[largest]!) largest = id;
  }
  if (largest) out[largest]! += target - total;
  return out;
}

/**
 * Normalize a minutes map to the target total with a hard per-player cap
 * (default 48 = a full game). Overflow past the cap redistributes to players
 * under it instead of inflating anyone past a full game — the plain scaler
 * can otherwise push a 49-minute edge to 52 after renormalization.
 */
function normalizeMinutesCapped(raw: MinutesMap, target: number, cap: number): MinutesMap {
  const ids = Object.keys(raw);
  const scaled: MinutesMap = {};
  for (const id of ids) scaled[id] = Math.max(0, Math.min(cap, raw[id] ?? 0));
  for (let iter = 0; iter < 12; iter++) {
    const sum = ids.reduce((t, id) => t + (scaled[id] ?? 0), 0);
    if (!(sum > 0)) break;
    const factor = target / sum;
    if (Math.abs(factor - 1) < 0.0005) break;
    let over = 0;
    const under: string[] = [];
    for (const id of ids) {
      const v = (scaled[id] ?? 0) * factor;
      if (v > cap) {
        over += v - cap;
        scaled[id] = cap;
      } else {
        scaled[id] = v;
        under.push(id);
      }
    }
    if (over <= 0.001) break;
    const underSum = under.reduce((t, id) => t + (scaled[id] ?? 0), 0);
    if (underSum <= 0) break;
    for (const id of under) scaled[id] = (scaled[id] ?? 0) + over * ((scaled[id] ?? 0) / underSum);
  }
  const out: MinutesMap = {};
  for (const id of ids) out[id] = Math.round(Math.max(0, Math.min(cap, scaled[id] ?? 0)));
  let diff = target - ids.reduce((t, id) => t + (out[id] ?? 0), 0);
  for (let guard = 0; guard < 120 && diff !== 0; guard++) {
    const sorted = ids.slice().sort((a, b) => (diff > 0 ? (out[b]! - out[a]!) : (out[a]! - out[b]!)));
    const cand = sorted.find((id) => (diff > 0 ? (out[id]! < cap) : (out[id]! > 0)));
    if (!cand) break;
    out[cand]! += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  return out;
}

/** Defensive normalize: unknown IDs dropped, missing/invalid entries fall back to role defaults, total forced to 240. */
export function effectiveMinutes(team: Player[], sixthManId: string | null | undefined, minutes: MinutesMap): MinutesMap {
  const defaults = defaultMinutesFor(team, sixthManId ?? null);
  const map: MinutesMap = {};
  for (const p of team) {
    if (!p) continue;
    const raw = minutes[p.id];
    map[p.id] =
      typeof raw === 'number' && Number.isFinite(raw)
        ? Math.max(0, Math.min(48, raw))
        : (defaults[p.id] ?? 0);
  }
  const sum = Object.values(map).reduce((t, v) => t + v, 0);
  if (!(sum > 0)) return roundMapToTarget(defaults, TEAM_MINUTES_REGULATION);
  if (Math.abs(sum - TEAM_MINUTES_REGULATION) > 0.001) {
    for (const id of Object.keys(map)) map[id] = (map[id] ?? 0) / sum * TEAM_MINUTES_REGULATION;
  }
  return roundMapToTarget(map, TEAM_MINUTES_REGULATION);
}

/** Planned regulation actuals, or the legacy fixed rotation when no plan is supplied. */
function planActualMinutes(
  team: Player[],
  sixthManId: string | null | undefined,
  minutes: MinutesMap | null | undefined,
): MinutesMap {
  if (!minutes) {
    const legacy = assignRotationMinutes(team, sixthManId ?? null, 0);
    return legacy;
  }
  return effectiveMinutes(team, sixthManId ?? null, minutes);
}

/**
 * Stretch actuals to an OT target (240 + 25/OT). Fouled-out players are
 * frozen at their reduced minutes; the extra goes pro-rata to the rest.
 * DNPs that never subbed stay at 0.
 */
function scaleForOT(actual: MinutesMap, fouledOut: string[], otPeriods: number): MinutesMap {
  const out: MinutesMap = { ...actual };
  if (otPeriods <= 0) return out;
  const target = TEAM_MINUTES_REGULATION + otPeriods * TEAM_MINUTES_PER_OT;
  const frozen = new Set(fouledOut);
  const ids = Object.keys(out);
  const eligible = ids.filter((id) => !frozen.has(id) && (out[id] ?? 0) > 0);
  const pool = eligible.length > 0 ? eligible : ids.filter((id) => (out[id] ?? 0) > 0);
  if (pool.length === 0) return out;
  const frozenSum = ids.filter((id) => !pool.includes(id)).reduce((t, id) => t + (out[id] ?? 0), 0);
  const poolTarget = target - frozenSum;
  const current = pool.reduce((t, id) => t + (out[id] ?? 0), 0);
  const factor = current > 0 ? poolTarget / current : 0;
  const scaled: MinutesMap = {};
  for (const id of pool) scaled[id] = (out[id] ?? 0) * factor;
  const rounded = roundMapToTarget(scaled, Math.round(poolTarget));
  for (const id of pool) out[id] = Math.max(0, Math.min(55, rounded[id] ?? 0));
  // The 55 cap can shave minutes in deep OT — hand the excess back to
  // eligible players under the cap so the total still hits the target.
  for (let guard = 0; guard < 60; guard++) {
    const sumNow = ids.reduce((t, id) => t + (out[id] ?? 0), 0);
    const diff = target - sumNow;
    if (diff === 0) break;
    if (diff > 0) {
      const cand = pool.filter((id) => (out[id] ?? 0) < 55).sort((a, b) => (out[b] ?? 0) - (out[a] ?? 0))[0];
      if (!cand) break;
      out[cand]! += 1;
    } else {
      const cand = pool.filter((id) => (out[id] ?? 0) > 0).sort((a, b) => (out[b] ?? 0) - (out[a] ?? 0))[0];
      if (!cand) break;
      out[cand]! -= 1;
    }
  }
  return out;
}

/** 1st/2nd/3rd-option scoring bumps (applied to the PTS component). */
export const OPTION_PTS_BOOST: Record<number, number> = { 1: 1.08, 2: 1.04, 3: 1.02 };

export interface OptionRanks {
  first?: string | null;
  second?: string | null;
  third?: string | null;
}

function optionRankOf(playerId: string, options: OptionRanks | null | undefined): 1 | 2 | 3 | undefined {
  if (!options) return undefined;
  if (options.first && playerId === options.first) return 1;
  if (options.second && playerId === options.second) return 2;
  if (options.third && playerId === options.third) return 3;
  return undefined;
}

function rotationWeight(index: number, playerId: string, sixthManId: string | null | undefined, totalLen: number): number {
  if (totalLen <= 5) return 1;
  if (index < 5) return 1;
  if (sixthManId && playerId === sixthManId) return SIXTH_WEIGHT;
  return BENCH_WEIGHT;
}

function rotationDivisor(players: Player[], sixthManId: string | null | undefined): number {
  if (players.length <= 5) return Math.max(1, players.length);
  let div = 0;
  players.forEach((p, i) => {
    div += rotationWeight(i, p.id, sixthManId, players.length);
  });
  return div > 0 ? div : 5;
}

function hasSixthMan(players: Player[], sixthManId: string | null | undefined): boolean {
  if (!sixthManId) return false;
  return players.some((p, i) => i >= 5 && p.id === sixthManId);
}

/**
 * Height edge on the glass and at the rim, measured against the
 * positional average. A 7-footer at center grabs boards/blocks shots
 * better than a 6'9" one with identical stats — and vice versa.
 * Shared by live ratings and getBaseTeamImpact so strength/projection
 * move together with the sim.
 */
function heightFactors(player: Player): { reb: number; blk: number } {
  const baseline = POSITION_HEIGHT_BASELINE[player.position] ?? 79;
  const height = Number.isFinite(player.heightIn) ? player.heightIn : baseline;
  const diff = height - baseline;
  const clamp = (v: number) => Math.max(HEIGHT_FACTOR_MIN, Math.min(HEIGHT_FACTOR_MAX, v));
  return {
    reb: clamp(1 + HEIGHT_REB_PER_INCH * diff),
    blk: clamp(1 + HEIGHT_BLK_PER_INCH * diff),
  };
}

/**
 * Deterministic per-player building blocks: era-normalized stat terms run
 * through the overall curve and the efficiency modifier. Split three ways so
 * matchup logic can bite precisely: suppression hits PTS, discipline and the
 * handcuffed debuff hit the defensive (STL/BLK) components.
 */
function playerBaseParts(player: Player, handcuffed: boolean): { pts: number; defense: number; rest: number } {
  const weights = POSITION_WEIGHTS[player.position];
  const { stats, overall } = player;
  const height = heightFactors(player);
  const curve = Math.pow(overall / 100, OVERALL_CURVE_EXPONENT);
  const eff = efficiencyFactor(player);
  const proneness = foulPronenessOf(player);
  // Defensive discipline trade-off: lockdown technicians keep 102% of their
  // stocks impact; gamblers juice theirs to 105% (their matchup pays at the
  // stripe instead — see the grant below).
  const discMod = proneness < 40 ? 1.02 : proneness > 65 ? 1.05 : 1;
  const handcuffMod = handcuffed && proneness > 70 ? 0.9 : 1;
  // 2K attribute layer: era-modified shot selection, stopper craft and
  // ball security nudge each component a few percent (mean-neutral).
  let scoreMult = 1;
  let defMult = 1;
  let playMult = 1;
  try {
    const mod = modifiedAttributesOf(player);
    const era = getEraContext(player.decade ?? '2020s');
    scoreMult = attributeScoringMultiplier(mod, era);
    defMult = attributeDefenseMultiplier(mod, era, player.position);
    playMult = attributePlaymakingMultiplier(mod, era);
  } catch {
    // Attribute layer is best-effort; the legacy model stands alone.
  }
  const pts = normalizeStat(stats.pts, player.decade) * weights.pts * STAT_IMPORTANCE.pts * curve * eff * scoreMult;
  const defense =
    (normalizeStat(stats.stl, player.decade) * weights.stl * STAT_IMPORTANCE.stl +
      normalizeStat(stats.blk, player.decade) * weights.blk * STAT_IMPORTANCE.blk * height.blk) *
    curve *
    eff *
    discMod *
    handcuffMod *
    defMult;
  const rest =
    (normalizeStat(stats.reb, player.decade) * weights.reb * STAT_IMPORTANCE.reb * height.reb +
      normalizeStat(stats.ast, player.decade) * weights.ast * STAT_IMPORTANCE.ast * playMult) *
    curve *
    eff;
  return { pts, defense, rest };
}

/**
 * Assign each rostered player a distinct lineup slot (primary first, flex
 * second). Deterministic; mirrors the draft-validation spirit.
 */
function assignSlots(lineup: Array<Player | null | undefined>): Array<Position | undefined> {
  const slots: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const assigned: Array<Position | undefined> = new Array(lineup.length).fill(undefined);
  const taken = new Set<Position>();
  lineup.forEach((player, i) => {
    if (!player || taken.has(player.position)) return;
    assigned[i] = player.position;
    taken.add(player.position);
  });
  lineup.forEach((player, i) => {
    if (!player || assigned[i]) return;
    const alt = (player.secondaryPositions ?? []).find((s) => !taken.has(s));
    if (alt) {
      assigned[i] = alt;
      taken.add(alt);
    }
  });
  lineup.forEach((player, i) => {
    if (!player || assigned[i]) return;
    const free = slots.find((s) => !taken.has(s));
    if (free) {
      assigned[i] = free;
      taken.add(free);
    }
  });
  return assigned;
}

/** Floor-synergy roles from primary positions: a guard, a wing and a big. */
function hasFloorBalance(primaries: Set<Position>): boolean {
  const hasGuard = primaries.has('PG') || primaries.has('SG');
  const hasWing = primaries.has('SG') || primaries.has('SF') || primaries.has('PF');
  const hasBig = primaries.has('PF') || primaries.has('C');
  return hasGuard && hasWing && hasBig;
}

/** Ball-dominance collision: multiple >30% usage mouths, one ball. */
function collisionMultiplier(usages: number[]): number {
  const mouths = usages.filter((u) => u > 30).length;
  return mouths > 1 ? 1.0 - 0.035 * (mouths - 1) : 1.0;
}

function calculateTeamRating(
  players: Player[],
  config: SimulationConfig,
  isHome: boolean,
  gameIndex = 0,
  totalGames = 82,
  opponentPlayers?: Player[],
  handcuffed = false,
  sixthManId?: string | null,
  options?: OptionRanks | null,
  minutes?: MinutesMap | null,
): number {
  // Direct positional suppression received: an opposing stopper (defRating
  // 88+) at your primary slot shaves 4-8% off your scoring impact, while a
  // gambler (>65 proneness) on you grants ~3% back at the stripe.
  // 2K layer: the stopper read blends the legacy estimate with the rebuilt
  // 2K block; hand-checking eras add ~10% bite to perimeter stops and zone
  // eras fold help IQ into the matchup.
  const suppression = new Map<Position, number>();
  const grant = new Map<Position, number>();
  if (opponentPlayers) {
    for (const opp of opponentPlayers) {
      if (!opp) continue;
      let d = defRatingOf(opp);
      try {
        d = Math.max(d, effectiveDefRating(opp));
      } catch {
        // fall back to legacy
      }
      const oppEra = getEraContext(opp.decade ?? '2020s');
      let threshold = 88;
      // Hand-checking makes perimeter stops bite earlier; zone help adds bite.
      if (oppEra.handChecking && (opp.position === 'PG' || opp.position === 'SG')) threshold -= 1;
      if (d >= threshold) {
        let factor = 1 - Math.min(0.08, 0.04 + (d - threshold) * 0.005);
        if (oppEra.handChecking && (opp.position === 'PG' || opp.position === 'SG' || opp.position === 'SF')) {
          factor *= 0.99;
        }
        if (oppEra.zoneDefense) {
          try {
            const help = modifiedAttributesOf(opp).helpDefenseIq;
            factor *= 1 - Math.min(0.02, Math.max(0, (help - 75) * 0.0008));
          } catch {
            // ignore
          }
        }
        suppression.set(opp.position, Math.min(suppression.get(opp.position) ?? 1, factor));
      }
      const foulMult = foulPronenessMultiplier(oppEra);
      if (foulPronenessOf(opp) * foulMult > 65) {
        grant.set(opp.position, Math.max(grant.get(opp.position) ?? 1, 1.03));
      }
    }
  }

  const slots = assignSlots(players);
  // Custom minutes replace the fixed starter/sixth/bench weights with minutes
  // share (mins/48); a 0-min DNP contributes nothing to the rating.
  const effMin = minutes ? effectiveMinutes(players, sixthManId ?? null, minutes) : null;
  const weightOf = (player: Player, i: number): number =>
    effMin ? (effMin[player.id] ?? 0) / 48 : rotationWeight(i, player.id, sixthManId, players.length);
  const impacts: Array<{ impact: number; usage: number; rank?: 1 | 2 | 3 }> = [];
  const usages: number[] = [];
  const primaries = new Set<Position>();
  const ownEra = teamEraContext(players);
  players.forEach((player, i) => {
    if (!player) return;
    const playerEra = getEraContext(player.decade ?? '2020s');
    const foulMult = foulPronenessMultiplier(playerEra);
    const { pts, defense, rest } = playerBaseParts(player, handcuffed && foulPronenessOf(player) * foulMult > 70);
    const rank = optionRankOf(player.id, options);
    let ptsBoosted = pts * (rank ? (OPTION_PTS_BOOST[rank] ?? 1) : 1);
    // Usage priority by era: zone offenses run through handlers, illegal-
    // defense isolations through post/mid masters (Part 8).
    try {
      const mod = modifiedAttributesOf(player);
      if (ownEra.zoneDefense && mod.ballHandle >= 85) ptsBoosted *= 1.02;
      if (ownEra.illegalDefenseRules && (mod.postControl >= 85 || mod.midRangeShot >= 85)) ptsBoosted *= 1.02;
    } catch {
      // ignore
    }
    let impact = ptsBoosted * (suppression.get(player.position) ?? 1) * (grant.get(player.position) ?? 1) + defense + rest;
    // Flex-slot adaptation: playing off-primary retains 95%.
    const slot = slots[i];
    if (slot && slot !== player.position) impact *= 0.95;
    // Rotation weight: fixed role weights, or minutes share on a custom plan.
    const w = weightOf(player, i);
    impact *= w;
    // Overuse guard: heavy-minute loads lose efficiency (anti-ironman).
    if (effMin) {
      const m = effMin[player.id] ?? 0;
      if (m > OVERUSE_THRESHOLD) impact *= 1 - (m - OVERUSE_THRESHOLD) * OVERUSE_PER_MIN;
    }
    if (config.fatigueFactor > 0 && totalGames > 1) {
      const fatigue = config.fatigueFactor * (gameIndex / totalGames);
      // Stamina layer: low-motor players fade harder; fast/bruising eras
      // wear everyone down faster (Part 9). Mean effect stays near legacy.
      let staminaMult = 1;
      try {
        const stamina = modifiedAttributesOf(player).stamina;
        const rate = fatigueRateMultiplier(playerEra);
        const staminaEdge = (stamina - 75) * 0.0012;
        staminaMult = 1 - fatigue * 0.5 * rate + staminaEdge * fatigue;
      } catch {
        staminaMult = 1 - fatigue * 0.5;
      }
      impact *= Math.max(0.8, staminaMult);
    }
    impact += (randomFloat() - 0.5) * 2 * config.variance * impact;
    impacts.push({ impact: Math.max(0, impact), usage: usageRateOf(player), rank });
    usages.push(usageRateOf(player));
    // DNPs don't count toward floor balance — benching every big costs you.
    if (w > 0.02) primaries.add(player.position);
  });
  const counted = impacts.length;

  // Usage concentration: options carry the offense in rank order, then
  // best-first so the alpha carries what the options don't.
  impacts.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.impact - a.impact);
  let totalImpact = 0;
  for (let i = 0; i < impacts.length; i++) {
    totalImpact += impacts[i]!.impact * (STAR_USAGE_BONUS[i] ?? 1);
  }
  // Normalize 10-man rotations back to the 5-man scale (minutes shares already sum to 5).
  if (players.length > 5) {
    const div = effMin
      ? players.reduce((t, p, i) => t + (p ? weightOf(p, i) : 0), 0)
      : rotationDivisor(players, sixthManId);
    totalImpact = totalImpact / (div > 0 ? div : 5) * 5;
  }
  totalImpact *= collisionMultiplier(usages);
  if (!hasFloorBalance(primaries)) totalImpact *= 0.94;

  // Spacing boost: a roster shooting above its own eras' 3PAR average stretches
  // the floor (+1% to +4%). High-emphasis eras add a 2K-spacing kicker when
  // the lineup actually shoots (driving lanes open for teammates).
  const spacingExcess = team3PAR(players) - rosterEra3PAR(players);
  if (spacingExcess > 0) {
    totalImpact *= 1 + Math.min(0.04, 0.01 + spacingExcess * 0.15);
  }
  try {
    if (ownEra.threePointEmphasis >= 0.5) {
      const present = players.filter((p): p is Player => !!p);
      if (present.length > 0) {
        const avgThree = present.reduce((t, p) => t + modifiedAttributesOf(p).threePointShot, 0) / present.length;
        if (avgThree > 75) {
          totalImpact *= 1 + Math.min(0.02, (avgThree - 75) * 0.0012);
        }
      }
    }
  } catch {
    // spacing kicker is best-effort
  }

  // Soft-defense debuff: foul-drawing outfits (team FTr > 1.15x league average)
  // force the other side to play soft — shaves their total 2.5%.
  if (opponentPlayers && teamFTr(opponentPlayers) > LEAGUE_AVG_FTR * 1.15) {
    totalImpact *= 0.975;
  }

  // Sixth Man creation boost: a tagged bench spark lifts the second unit
  // (only when they actually play on a custom plan).
  if (hasSixthMan(players, sixthManId)) {
    if (!effMin || (sixthManId && (effMin[sixthManId] ?? 0) > 0)) {
      totalImpact *= SIXTH_TEAM_BOOST;
    }
  }

  // Scale short lineups down instead of silently treating missing players as 0-rated.
  if (counted < 5 && counted > 0) {
    totalImpact *= counted / 5;
  }

  if (isHome) {
    totalImpact *= (1 + config.homeCourtAdvantage);
  }

  return totalImpact;
}

/**
 * CPU counter-minutes for VS Mode: when the challenger brings a minutes
 * plan, the legends don't just run role defaults — they tilt extra run to
 * the slots where your minute-weighted usage is heaviest (up to +5) and
 * trim where you're thinnest (down to -5), then renormalize to 240.
 * Deterministic (no RNG) so series stay auditable.
 */
export function counterMinutesFor(
  cpuLineup: Player[],
  userLineup: Player[],
  userMinutes: MinutesMap,
): MinutesMap {
  const base = defaultMinutesFor(cpuLineup, null);
  const user = userLineup.filter((p): p is Player => !!p);
  if (user.length === 0) return base;
  const threat = new Map<Position, number>();
  for (const p of user) {
    const share = Math.max(0, Math.min(48, userMinutes[p.id] ?? 0)) / 48;
    threat.set(p.position, (threat.get(p.position) ?? 0) + usageRateOf(p) * share);
  }
  const vals = [...threat.values()];
  const avg = vals.reduce((t, v) => t + v, 0) / Math.max(1, vals.length);
  const raw: MinutesMap = {};
  for (const p of cpuLineup) {
    if (!p) continue;
    const edge = Math.max(-5, Math.min(5, ((threat.get(p.position) ?? avg) - avg) * 0.5));
    raw[p.id] = (base[p.id] ?? 0) + edge;
  }
  try {
    const out = normalizeMinutesCapped(raw, TEAM_MINUTES_REGULATION, 48);
    if (Object.keys(out).length === 0) return base;
    return out;
  } catch {
    return base;
  }
}

/** Mean pace rating of a 5-man unit. */
export function teamPace(lineup: Player[]): number {
  const present = lineup.filter(Boolean);
  if (present.length === 0) return SIMULATION_CONSTANTS.BASE_PACE;
  return present.reduce((t, p) => t + paceRatingOf(p!), 0) / present.length;
}

/** Mean clutch of the two coldest-blooded players available. */
export function teamClutch(lineup: Player[]): number {
  const present = lineup.filter(Boolean) as Player[];
  if (present.length === 0) return 70;
  // Clutch layer: base clutch blended with offensive/defensive consistency
  // so steady two-way closers edge pure volume closers in tight games.
  const blended = present.map((p) => {
    const base = clutchOf(p);
    try {
      const mod = modifiedAttributesOf(p);
      return base * 0.7 + mod.offensiveConsistency * 0.15 + mod.defensiveConsistency * 0.15;
    } catch {
      return base;
    }
  });
  const ratings = blended.sort((a, b) => b - a).slice(0, 2);
  if (ratings.length === 0) return 70;
  return ratings.reduce((t, r) => t + r, 0) / ratings.length;
}

/** Blended game pace with the era possessions multiplier (Part 5, RULE 6). */
export function gamePaceFor(homeTeam: Player[], awayTeam: Player[]): number {
  const base = (teamPace(homeTeam) + teamPace(awayTeam)) / 2;
  try {
    const homeMult = possessionsMultiplier(teamEraContext(homeTeam));
    const awayMult = possessionsMultiplier(teamEraContext(awayTeam));
    return base * ((homeMult + awayMult) / 2);
  } catch {
    return base;
  }
}

function simulateGameScore(
  homeRating: number,
  awayRating: number,
  config: SimulationConfig,
  gamePace: number = AVG_POSSESSIONS,
  clutchDelta = 0,
): { home: number; away: number; otPeriods: number } {
  const ratingDiff = homeRating - awayRating;
  const pointSpread = ratingDiff * SCORE_SPREAD_FACTOR;
  // Pace-scaled base: track meets play in the 120s, grind eras near 100.
  const base = BASE_SCORE * (gamePace / AVG_POSSESSIONS);

  let homeScore = base + pointSpread / 2 + clutchDelta / 2 + (randomFloat() - 0.5) * SCORE_NOISE * (0.5 + config.variance);
  let awayScore = base - pointSpread / 2 - clutchDelta / 2 + (randomFloat() - 0.5) * SCORE_NOISE * (0.5 + config.variance);

  homeScore = Math.max(MIN_SCORE, Math.round(homeScore));
  awayScore = Math.max(MIN_SCORE, Math.round(awayScore));

  // NBA has no ties: dead-even regulation goes to overtime, and once there,
  // even matchups extend — but each extra period demands a tighter finish
  // (up to 5 total), so 2-3OT classics happen while 5OT stays a rarity.
  // OT scoring runs ~42% of a regulation quarter at game pace.
  const otQuarter = (base / 4) * 0.42;
  const OT_WINDOWS = [0, 3, 2, 0, 0];
  let otPeriods = 0;
  while (otPeriods < 5 && Math.abs(homeScore - awayScore) <= OT_WINDOWS[otPeriods]!) {
    otPeriods++;
    // Wide swing per period (short-clock chaos) so most OTs end here and only
    // the truly deadlocked survive deeper — decaying 1OT > 2OT > 3OT > ….
    homeScore += Math.max(4, Math.round(otQuarter + (randomFloat() - 0.5) * 12));
    awayScore += Math.max(4, Math.round(otQuarter + (randomFloat() - 0.5) * 12));
  }
  if (homeScore === awayScore) {
    // Vanishingly rare fallback: home team takes it by a point.
    homeScore += 1;
  }

  return { home: homeScore, away: awayScore, otPeriods };
}

/**
 * Ironman rotation minutes for the no-sub system: all 5 play every game —
 * fouls NEVER bench anyone (the 5-foul guardrail caps the box-score line,
 * never participation). Regulation runs 42-48 by overall; each OT period
 * adds ~4 minutes (real 50+ minute nights happen in multi-OT games).
 */
function assignMinutes(player: Player, otPeriods = 0): number {
  const base = Math.min(48, Math.round(42 + (player.overall / 100) * 4 + randomFloat() * 2));
  if (otPeriods <= 0) return base;
  return Math.min(55, base + otPeriods * 4 + (randomFloat() < 0.5 ? 1 : 0));
}

/**
 * 10-man rotation minutes (starters ~30-33, Sixth Man ~22-24, bench ~14-17).
 * Scales to 240 team minutes (+25 per OT) so box scores stay realistic.
 * 5-man lineups keep legacy ironman minutes.
 */
function assignRotationMinutes(team: Player[], sixthManId: string | null | undefined, otPeriods = 0): Record<string, number> {
  const minutes: Record<string, number> = {};
  if (team.length <= 5) {
    for (const player of team) {
      if (!player) continue;
      minutes[player.id] = assignMinutes(player, otPeriods);
    }
    return minutes;
  }
  const raw: number[] = team.map((player, i) => {
    if (!player) return 0;
    if (i < 5) return 30 + (player.overall / 100) * 3 + randomFloat();
    if (sixthManId && player.id === sixthManId) return 22 + (player.overall / 100) * 2;
    return 14 + (player.overall / 100) * 3 + randomFloat();
  });
  const rawSum = raw.reduce((t, v) => t + v, 0) || 1;
  const target = 240 + otPeriods * 25;
  team.forEach((player, i) => {
    if (!player) return;
    const scaled = raw[i]! / rawSum * target;
    minutes[player.id] = Math.max(8, Math.min(38, Math.round(scaled)));
  });
  return minutes;
}

/**
 * Personal-foul guardrail: 2.2 base + proneness slope + jitter, HARD-CAPPED
 * at 5. The cap binds the box score only — participation is unconditional.
 */
function eraFoulMult(player: Player): number {
  try {
    return foulPronenessMultiplier(getEraContext(player.decade ?? '2020s'));
  } catch {
    return 1;
  }
}

function rollFouls(player: Player): number {
  const raw = Math.round(2.2 + ((foulPronenessOf(player) * eraFoulMult(player)) / 100) * 2.5 + (randomFloat() * 1.2 - 0.6));
  return Math.min(5, Math.max(0, raw));
}

/** Minutes-scaled foul roll for the custom-minutes path: DNPs can't foul; 6 = fouled out. */
function rollFoulsForMinutes(player: Player, minutes: number): number {
  if (minutes <= 0) return 0;
  const expected = (minutes / 30) * (2.2 + ((foulPronenessOf(player) * eraFoulMult(player)) / 100) * 2.5);
  return Math.min(FOUL_OUT_LIMIT, Math.max(0, Math.round(expected + (randomFloat() * 1.2 - 0.6))));
}

export interface FoulResolution {
  /** Post-ejection minutes (fouled-out reduced, cover credited). Sums to 240 pre-OT. */
  actual: MinutesMap;
  fouls: Record<string, number>;
  fouledOut: string[];
  /** Negative point drag applied to this team's margin (disruption / short-handed). */
  adjustment: number;
}

/**
 * 6-foul ejections with emergency cover. Each ejection (stars first) pulls
 * the best overall true DNP (planned 0) who fits the primary slot; failing
 * that, teammates absorb the freed minutes. Short-handed (<5 able left)
 * costs more than a covered ejection.
 */
function resolveFouls(team: Player[], planned: MinutesMap): FoulResolution {
  const actual: MinutesMap = { ...planned };
  const fouls: Record<string, number> = {};
  for (const p of team) {
    if (!p) continue;
    fouls[p.id] = rollFoulsForMinutes(p, planned[p.id] ?? 0);
  }
  const fouledOut = team
    .filter((p) => p && (fouls[p.id] ?? 0) >= FOUL_OUT_LIMIT)
    .map((p) => p!.id)
    .sort((a, b) => (planned[b] ?? 0) - (planned[a] ?? 0));
  const usedSubs = new Set<string>();
  let adjustment = 0;
  for (const outId of fouledOut) {
    const outPlayer = team.find((p) => p?.id === outId);
    if (!outPlayer) continue;
    const plan = planned[outId] ?? 0;
    const stay = Math.round(plan * (0.65 + randomFloat() * 0.15));
    actual[outId] = stay;
    const freed = Math.max(0, plan - stay);
    const cover = team
      .filter(
        (p) =>
          p &&
          !fouledOut.includes(p.id) &&
          !usedSubs.has(p.id) &&
          (planned[p.id] ?? 0) <= 0 &&
          getPlayerPositions(p).includes(outPlayer.position),
      )
      .sort((a, b) => (b!.overall ?? 0) - (a!.overall ?? 0))[0];
    if (cover) {
      usedSubs.add(cover.id);
      actual[cover.id] = (actual[cover.id] ?? 0) + freed;
      fouls[cover.id] = Math.min(FOUL_OUT_LIMIT - 1, rollFoulsForMinutes(cover, actual[cover.id] ?? 0));
      adjustment -= FOUL_OUT_PTS_COVERED;
    } else {
      const active = team.filter((p) => p && !fouledOut.includes(p.id) && (actual[p.id] ?? 0) > 0);
      const activeSum = active.reduce((t, p) => t + (actual[p!.id] ?? 0), 0);
      if (active.length >= 5 && activeSum > 0) {
        let given = 0;
        active.forEach((p, idx) => {
          const share = idx === active.length - 1 ? freed - given : Math.round((freed * (actual[p!.id] ?? 0)) / activeSum);
          actual[p!.id] = (actual[p!.id] ?? 0) + share;
          given += share;
        });
        adjustment -= FOUL_OUT_PTS_COVERED;
      } else {
        adjustment -= FOUL_OUT_PTS_SHORTHANDED;
      }
    }
    fouls[outId] = FOUL_OUT_LIMIT;
  }
  return { actual, fouls, fouledOut, adjustment };
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFloat() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Shuffled 82-game schedule. The old code cycled opponents in fixed order
 * (`(gameNum - 1) % pool.length`) with alternating home/away, so game #82
 * always faced the same team. Now every season draws a fresh balanced
 * schedule: each opponent appears 2-3x in random order (no back-to-back
 * repeats) and home/away is a shuffled 41/41 split.
 */
function buildSeasonSchedule(poolSize: number, totalGames: number): Array<{ poolIndex: number; isHome: boolean }> {
  const order: number[] = [];
  let prevLast = -1;
  while (order.length < totalGames) {
    const block: number[] = [];
    for (let i = 0; i < poolSize; i++) block.push(i);
    shuffleInPlace(block);
    // Avoid a repeat across the block boundary (last of prev == first of next).
    if (prevLast >= 0 && block[0] === prevLast && block.length > 1) {
      const swapIdx = 1 + Math.floor(randomFloat() * (block.length - 1));
      const tmp = block[0]!;
      block[0] = block[swapIdx]!;
      block[swapIdx] = tmp;
    }
    for (const idx of block) {
      if (order.length >= totalGames) break;
      order.push(idx!);
    }
    prevLast = order[order.length - 1]!;
  }

  const venues: boolean[] = [];
  for (let i = 0; i < totalGames; i++) venues.push(i < Math.ceil(totalGames / 2));
  shuffleInPlace(venues);

  return order.map((poolIndex, i) => ({ poolIndex, isHome: venues[i]! }));
}

function rollInjury(config: SimulationConfig): number {
  // Returns a performance multiplier. Most games return 1.
  if (config.injuryRisk > 0 && randomFloat() < config.injuryRisk) {
    return 0.7; // playing hurt
  }
  return 1;
}

function generatePlayerGameStats(player: Player, teamRating: number, opponentRating: number, minutes: number, config: SimulationConfig, forcedPf?: number): PlayerStats {
  // DNPs (0 actual minutes, never subbed) log a scoreless line.
  if (minutes <= 0) {
    return { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, pf: 0 };
  }
  const usageFactor = minutes / 48;
  const competitionFactor = Math.max(0.7, Math.min(1.3, 1 - (opponentRating - teamRating) / 200));
  const injuryFactor = rollInjury(config);

  const variance = config.variance;
  const factor = usageFactor * competitionFactor * injuryFactor;

  return {
    pts: Math.max(0, Math.round(player.stats.pts * factor + (randomFloat() - 0.5) * 8 * variance)),
    reb: Math.max(0, Math.round(player.stats.reb * factor + (randomFloat() - 0.5) * 4 * variance)),
    ast: Math.max(0, Math.round(player.stats.ast * factor + (randomFloat() - 0.5) * 3 * variance)),
    stl: Math.max(0, Math.round(player.stats.stl * factor + (randomFloat() - 0.5) * 1.5 * variance)),
    blk: Math.max(0, Math.round(player.stats.blk * factor + (randomFloat() - 0.5) * 1.5 * variance)),
    // Fouls never bench anyone on the legacy path; the minutes path resolves
    // ejections beforehand and passes the final count in (6 = fouled out).
    pf: forcedPf ?? rollFouls(player),
  };
}

function generateGameEvents(homePlayers: Player[], awayPlayers: Player[], homeScore: number, awayScore: number): GameEvent[] {
  const events: GameEvent[] = [];
  const totalPoints = homeScore + awayScore;
  const numEvents = Math.min(15, Math.floor(totalPoints / 8));

  const allPlayers = [
    ...homePlayers.filter(Boolean).map(p => ({ ...p, team: 'home' as const })),
    ...awayPlayers.filter(Boolean).map(p => ({ ...p, team: 'away' as const })),
  ];
  if (allPlayers.length === 0) return [];

  for (let i = 0; i < numEvents; i++) {
    const quarter = Math.floor(randomFloat() * 4) + 1;
    const minutes = Math.floor(randomFloat() * 12);
    const seconds = Math.floor(randomFloat() * 60);
    const player = allPlayers[Math.floor(randomFloat() * allPlayers.length)]!;
    const eventTypes = ['score', 'assist', 'rebound', 'steal', 'block'] as const;
    const type = eventTypes[Math.floor(randomFloat() * eventTypes.length)]!;

    let points: number | undefined;
    let description = '';

    switch (type) {
      case 'score':
        points = randomFloat() > (1 - THREE_POINT_RATE) ? 3 : 2;
        description = `${player.name} scores ${points} points`;
        break;
      case 'assist':
        description = `${player.name} records an assist`;
        break;
      case 'rebound':
        description = `${player.name} grabs a rebound`;
        break;
      case 'steal':
        description = `${player.name} steals the ball`;
        break;
      case 'block':
        description = `${player.name} blocks a shot`;
        break;
    }

    events.push({
      quarter,
      time: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      type,
      playerId: player.id,
      playerName: player.name,
      team: player.team,
      ...(points !== undefined ? { points } : {}),
      description,
    });
  }

  // Clock counts down 12:00 -> 00:00, so sort quarters ascending and
  // time-remaining descending to get chronological order.
  return events.sort((a, b) => {
    if (a.quarter !== b.quarter) return a.quarter - b.quarter;
    const aTime = parseInt(a.time.split(':')[0]!, 10) * 60 + parseInt(a.time.split(':')[1]!, 10);
    const bTime = parseInt(b.time.split(':')[0]!, 10) * 60 + parseInt(b.time.split(':')[1]!, 10);
    return bTime - aTime;
  });
}

export function simulateSingleGame(input: GameSimulationInput): GameSimulationOutput {
  const { homeTeam, awayTeam, config, gameIndex = 1, totalGames = 1, seriesGameNumber = 1, homeSixthManId = null, awaySixthManId = null, homeOptions = null, awayOptions = null, homeMinutes: homeMinutesPlan = null, awayMinutes: awayMinutesPlan = null } = input;

  if (!homeTeam || homeTeam.length === 0 || !awayTeam || awayTeam.length === 0) {
    throw new Error('Both teams must have at least one player');
  }

  let homeRating = calculateTeamRating(homeTeam, config, true, gameIndex, totalGames, awayTeam, false, homeSixthManId, homeOptions, homeMinutesPlan);
  let awayRating = calculateTeamRating(awayTeam, config, false, gameIndex, totalGames, homeTeam, false, awaySixthManId, awayOptions, awayMinutesPlan);

  // Series adaptation: past Game 1 the higher-rated side's adjustments compound.
  if (seriesGameNumber > 1) {
    const boost = 1 + 0.0075 * (seriesGameNumber - 1);
    if (homeRating >= awayRating) homeRating *= boost;
    else awayRating *= boost;
  }

  const gamePace = gamePaceFor(homeTeam, awayTeam);
  // Clutch decides tight games: top-2 comparison swings it past a 5-pt spread.
  // No quarter clock exists, so |spread| <= 5 IS the late-game proxy — and
  // handcuffed (>70 proneness) defenders play it safe at 0.90 impact here.
  let spread = (homeRating - awayRating) * SCORE_SPREAD_FACTOR;
  if (Math.abs(spread) <= 5) {
    homeRating = calculateTeamRating(homeTeam, config, true, gameIndex, totalGames, awayTeam, true, homeSixthManId, homeOptions, homeMinutesPlan);
    awayRating = calculateTeamRating(awayTeam, config, false, gameIndex, totalGames, homeTeam, true, awaySixthManId, awayOptions, awayMinutesPlan);
    if (seriesGameNumber > 1) {
      const boost = 1 + 0.0075 * (seriesGameNumber - 1);
      if (homeRating >= awayRating) homeRating *= boost;
      else awayRating *= boost;
    }
    spread = (homeRating - awayRating) * SCORE_SPREAD_FACTOR;
  }
  // Clutch layer: consistency-blended closers decide it; bruising eras lean
  // on stops + stripe (more whistles late), hand-checking eras on stops.
  let clutchDelta =
    Math.abs(spread) <= 5
      ? (teamClutch(homeTeam) - teamClutch(awayTeam)) * 0.15 + (teamFTr(homeTeam) - teamFTr(awayTeam)) * 10
      : 0;
  if (Math.abs(spread) <= 5) {
    try {
      const homeEra = teamEraContext(homeTeam);
      const awayEra = teamEraContext(awayTeam);
      if (homeEra.handChecking || awayEra.handChecking) {
        const homeStop = homeTeam.reduce((t, p) => t + (p ? modifiedAttributesOf(p).defensiveConsistency : 0), 0) / Math.max(1, homeTeam.filter(Boolean).length);
        const awayStop = awayTeam.reduce((t, p) => t + (p ? modifiedAttributesOf(p).defensiveConsistency : 0), 0) / Math.max(1, awayTeam.filter(Boolean).length);
        clutchDelta += (homeStop - awayStop) * 0.02;
      }
    } catch {
      // clutch kicker best-effort
    }
  }

  // Custom-minutes sides resolve 6-foul ejections on regulation minutes
  // first; the disruption drag folds into the margin before OT is decided.
  // Legacy sides (no plan) keep the old behavior: no ejections, no drag.
  let homeFoul: FoulResolution | null = null;
  let awayFoul: FoulResolution | null = null;
  let foulDelta = 0;
  if (homeMinutesPlan) {
    homeFoul = resolveFouls(homeTeam, planActualMinutes(homeTeam, homeSixthManId ?? null, homeMinutesPlan));
    foulDelta += homeFoul.adjustment;
  }
  if (awayMinutesPlan) {
    awayFoul = resolveFouls(awayTeam, planActualMinutes(awayTeam, awaySixthManId ?? null, awayMinutesPlan));
    foulDelta -= awayFoul.adjustment;
  }
  const { home: homeScore, away: awayScore, otPeriods } = simulateGameScore(homeRating, awayRating, config, gamePace, clutchDelta + foulDelta);

  const homePlayerStats: Record<string, PlayerStats> = {};
  const awayPlayerStats: Record<string, PlayerStats> = {};
  const homeMinutes: Record<string, number> = {};
  const awayMinutes: Record<string, number> = {};

  // Final actuals: minutes-plan sides stretch the post-ejection minute split
  // to the OT target; legacy sides use the fixed rotation formula as before.
  const homeRotation = homeFoul
    ? scaleForOT(homeFoul.actual, homeFoul.fouledOut, otPeriods)
    : assignRotationMinutes(homeTeam, homeSixthManId ?? null, otPeriods);
  const awayRotation = awayFoul
    ? scaleForOT(awayFoul.actual, awayFoul.fouledOut, otPeriods)
    : assignRotationMinutes(awayTeam, awaySixthManId ?? null, otPeriods);
  const homeFouls: Record<string, number> = {};
  const awayFouls: Record<string, number> = {};
  if (!homeFoul) {
    for (const p of homeTeam) {
      if (p) homeFouls[p.id] = rollFouls(p);
    }
  }
  if (!awayFoul) {
    for (const p of awayTeam) {
      if (p) awayFouls[p.id] = rollFouls(p);
    }
  }

  for (const player of homeTeam) {
    if (!player) continue;
    const minutes = homeRotation[player.id] ?? assignMinutes(player, otPeriods);
    homeMinutes[player.id] = minutes;
    homePlayerStats[player.id] = generatePlayerGameStats(player, homeRating, awayRating, minutes, config, homeFoul ? homeFoul.fouls[player.id] : homeFouls[player.id]);
  }

  for (const player of awayTeam) {
    if (!player) continue;
    const minutes = awayRotation[player.id] ?? assignMinutes(player, otPeriods);
    awayMinutes[player.id] = minutes;
    awayPlayerStats[player.id] = generatePlayerGameStats(player, awayRating, homeRating, minutes, config, awayFoul ? awayFoul.fouls[player.id] : awayFouls[player.id]);
  }

  const events = generateGameEvents(homeTeam, awayTeam, homeScore, awayScore);

  return {
    homeScore,
    awayScore,
    otPeriods,
    pace: Number(gamePace.toFixed(1)),
    homePlayerStats,
    awayPlayerStats,
    homeMinutes,
    awayMinutes,
    events,
  };
}

export function simulateSeason(
  userLineup: Player[],
  opponentPool: Player[][],
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
  opponentNames: string[] = [],
  userSixthManId?: string | null,
  userOptions?: OptionRanks | null,
  userMinutes?: MinutesMap | null
): SeasonSimulationResult {
  if (userLineup.length !== 5 && userLineup.length !== 10) {
    throw new Error('User lineup must have exactly 5 or 10 players');
  }
  if (opponentPool.length === 0) {
    throw new Error('Opponent pool must not be empty');
  }
  if (userLineup.length !== 5 && userLineup.length !== 10) {
    throw new Error('User lineup must have exactly 5 or 10 players');
  }
  if (opponentPool.length === 0) {
    throw new Error('Opponent pool must not be empty');
  }
  const totalGames = SIMULATION_CONSTANTS.MAX_GAMES;
  const games: SeasonSimulationResult['games'] = [];
  const playerSeasonStats: Record<string, PlayerSeasonStats> = {};
  const playerMinutes: Record<string, number[]> = {};
  const opponentPlayerSeasonStats: Record<string, PlayerSeasonStats> = {};
  const opponentPlayerMinutes: Record<string, number[]> = {};

  userLineup.forEach(player => {
    playerSeasonStats[player.id] = {
      playerId: player.id,
      playerName: player.name,
      gamesPlayed: 0,
      minutesPerGame: 0,
      averages: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, pf: 0 },
      totals: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, pf: 0 },
      highGames: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, pf: 0 },
    };
    playerMinutes[player.id] = [];
  });
  for (const team of opponentPool) {
    for (const player of team) {
      opponentPlayerSeasonStats[player.id] = {
        playerId: player.id,
        playerName: player.name,
        gamesPlayed: 0,
        minutesPerGame: 0,
        averages: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, pf: 0 },
        totals: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, pf: 0 },
        highGames: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, pf: 0 },
      };
      opponentPlayerMinutes[player.id] = [];
    }
  }

  let wins = 0;
  let losses = 0;

  // League-standings accumulators: every opponent's record starts with its
  // games vs the user, then inter-opponent games fill everyone to 82 so the
  // table shows real W/L for every team instead of just the user's line.
  const oppWins: number[] = new Array(opponentPool.length).fill(0);
  const oppLosses: number[] = new Array(opponentPool.length).fill(0);
  const oppPF: number[] = new Array(opponentPool.length).fill(0);
  const oppPA: number[] = new Array(opponentPool.length).fill(0);
  const gamesVsUser: number[] = new Array(opponentPool.length).fill(0);
  let userPF = 0;
  let userPA = 0;

  const schedule = buildSeasonSchedule(opponentPool.length, totalGames);

  // CPU opponents run role-based default plans so ejections/subs apply
  // symmetrically (they have no DNPs — teammates absorb freed minutes).
  // When the user has no plan (legacy clients), opponents stay legacy too.
  const oppDefaults = opponentPool.map((team) => (userMinutes ? defaultMinutesFor(team, null) : null));

  for (let gameNum = 1; gameNum <= totalGames; gameNum++) {
    const { poolIndex, isHome } = schedule[gameNum - 1]!;
    const opponent = opponentPool[poolIndex]!;
    const opponentName = opponentNames[poolIndex] ?? `Opponent ${((poolIndex) % 30) + 1}`;

    const gameInput: GameSimulationInput = {
      homeTeam: isHome ? userLineup : opponent,
      awayTeam: isHome ? opponent : userLineup,
      config,
      // Fatigue now actually flows into ratings (was previously dropped).
      gameIndex: gameNum,
      totalGames,
      homeSixthManId: isHome ? (userSixthManId ?? null) : null,
      awaySixthManId: isHome ? null : (userSixthManId ?? null),
      homeOptions: isHome ? (userOptions ?? null) : null,
      awayOptions: isHome ? null : (userOptions ?? null),
      homeMinutes: isHome ? (userMinutes ?? null) : (oppDefaults[poolIndex] ?? null),
      awayMinutes: isHome ? (oppDefaults[poolIndex] ?? null) : (userMinutes ?? null),
    };

    const gameResult = simulateSingleGame(gameInput);
    const userScore = isHome ? gameResult.homeScore : gameResult.awayScore;
    const oppScore = isHome ? gameResult.awayScore : gameResult.homeScore;
    // Overtime in simulateGameScore guarantees no ties, but guard anyway.
    const result = userScore > oppScore ? 'W' : userScore < oppScore ? 'L' : 'T';

    if (result === 'W') wins++;
    else if (result === 'L') losses++;
    else losses++; // A tie should never happen; count conservatively as a loss.

    userPF += userScore;
    userPA += oppScore;
    gamesVsUser[poolIndex]! += 1;
    if (result === 'W') {
      oppLosses[poolIndex]! += 1;
    } else {
      oppWins[poolIndex]! += 1;
    }
    oppPF[poolIndex]! += oppScore;
    oppPA[poolIndex]! += userScore;

    const userPlayerStats = isHome ? gameResult.homePlayerStats : gameResult.awayPlayerStats;
    const userGameMinutes = isHome ? gameResult.homeMinutes : gameResult.awayMinutes;
    const oppPlayerStats = isHome ? gameResult.awayPlayerStats : gameResult.homePlayerStats;
    const oppGameMinutes = isHome ? gameResult.awayMinutes : gameResult.homeMinutes;

    for (const [playerId, stats] of Object.entries(userPlayerStats)) {
      const seasonStat = playerSeasonStats[playerId];
      if (seasonStat) {
        // DNPs (0 actual minutes, never subbed in) don't count as games played.
        const mins = userGameMinutes[playerId] ?? 0;
        if (mins <= 0) continue;
        seasonStat.gamesPlayed++;
        seasonStat.totals.pts += stats.pts;
        seasonStat.totals.reb += stats.reb;
        seasonStat.totals.ast += stats.ast;
        seasonStat.totals.stl += stats.stl;
        seasonStat.totals.blk += stats.blk;
        seasonStat.totals.pf += stats.pf;

        seasonStat.highGames.pts = Math.max(seasonStat.highGames.pts, stats.pts);
        seasonStat.highGames.reb = Math.max(seasonStat.highGames.reb, stats.reb);
        seasonStat.highGames.ast = Math.max(seasonStat.highGames.ast, stats.ast);
        seasonStat.highGames.stl = Math.max(seasonStat.highGames.stl, stats.stl);
        seasonStat.highGames.blk = Math.max(seasonStat.highGames.blk, stats.blk);
        seasonStat.highGames.pf = Math.max(seasonStat.highGames.pf, stats.pf);

        // Track the actual minutes assigned this game.
        playerMinutes[playerId]?.push(userGameMinutes[playerId] ?? 40);
      }
    }
    for (const [playerId, stats] of Object.entries(oppPlayerStats)) {
      const seasonStat = opponentPlayerSeasonStats[playerId];
      if (!seasonStat) continue;
      const mins = oppGameMinutes[playerId] ?? 0;
      if (mins <= 0) continue;
      seasonStat.gamesPlayed++;
      seasonStat.totals.pts += stats.pts;
      seasonStat.totals.reb += stats.reb;
      seasonStat.totals.ast += stats.ast;
      seasonStat.totals.stl += stats.stl;
      seasonStat.totals.blk += stats.blk;
      seasonStat.totals.pf += stats.pf;
      seasonStat.highGames.pts = Math.max(seasonStat.highGames.pts, stats.pts);
      seasonStat.highGames.reb = Math.max(seasonStat.highGames.reb, stats.reb);
      seasonStat.highGames.ast = Math.max(seasonStat.highGames.ast, stats.ast);
      seasonStat.highGames.stl = Math.max(seasonStat.highGames.stl, stats.stl);
      seasonStat.highGames.blk = Math.max(seasonStat.highGames.blk, stats.blk);
      seasonStat.highGames.pf = Math.max(seasonStat.highGames.pf, stats.pf);
      opponentPlayerMinutes[playerId]?.push(oppGameMinutes[playerId] ?? 40);
    }

    games.push({
      gameNumber: gameNum,
      opponent: opponentName,
      isHome,
      result: result === 'T' ? 'L' : result,
      score: { us: userScore, them: oppScore },
      otPeriods: gameResult.otPeriods,
      pace: gameResult.pace,
      playerStats: userPlayerStats,
      userMinutes: userGameMinutes,
      opponentPlayerStats: oppPlayerStats,
      opponentMinutes: oppGameMinutes,
      opponentRoster: opponent.map(p => ({
        playerId: p.id,
        playerName: p.name,
        position: p.position,
        secondaryPositions: p.secondaryPositions,
        overall: p.overall,
        heightIn: p.heightIn,
        // Display schedule name so client joins (standings/bracket/awards) always match.
        team: opponentName,
        baseStats: { ...p.stats },
      })),
    });
  }

  for (const [, stats] of Object.entries(playerSeasonStats)) {
    if (stats.gamesPlayed > 0) {
      stats.averages = {
        pts: Number((stats.totals.pts / stats.gamesPlayed).toFixed(1)),
        reb: Number((stats.totals.reb / stats.gamesPlayed).toFixed(1)),
        ast: Number((stats.totals.ast / stats.gamesPlayed).toFixed(1)),
        stl: Number((stats.totals.stl / stats.gamesPlayed).toFixed(1)),
        blk: Number((stats.totals.blk / stats.gamesPlayed).toFixed(1)),
        pf: Number((stats.totals.pf / stats.gamesPlayed).toFixed(1)),
      };
      const mins = playerMinutes[stats.playerId] ?? [];
      stats.minutesPerGame = mins.length > 0
        ? Number((mins.reduce((a, b) => a + b, 0) / mins.length).toFixed(1))
        : 0;
    }
  }

  const teamStats = calculateTeamSeasonStats(userLineup, playerSeasonStats, games);
  const standings = simulateLeagueStandings(
    opponentPool,
    opponentNames,
    { wins, losses, pointsFor: userPF, pointsAgainst: userPA },
    { wins: oppWins, losses: oppLosses, pointsFor: oppPF, pointsAgainst: oppPA, gamesVsUser },
    config,
    totalGames,
    opponentPlayerSeasonStats,
    opponentPlayerMinutes,
    oppDefaults,
  );

  return {
    wins,
    losses,
    games,
    playerSeasonStats,
    teamStats,
    standings,
    opponentPlayerSeasonStats,
  };
}

/**
 * Full league table: every opponent already carries its games vs the user,
 * so fill the rest of each team's 82-game slate with simulated
 * opponent-vs-opponent games (mid-season fatigue context, random venue).
 * Every simulated game credits one win and one loss, keeping the league
 * at .500 while letting contender pools naturally rise to the top.
 */
function simulateLeagueStandings(
  opponentPool: Player[][],
  opponentNames: string[],
  userRecord: { wins: number; losses: number; pointsFor: number; pointsAgainst: number },
  opp: { wins: number[]; losses: number[]; pointsFor: number[]; pointsAgainst: number[]; gamesVsUser: number[] },
  config: SimulationConfig,
  totalGames: number,
  opponentPlayerSeasonStats: Record<string, PlayerSeasonStats>,
  opponentPlayerMinutes: Record<string, number[]>,
  /** Role-based default plans (null entries = legacy path, matching season games). */
  oppDefaults: Array<MinutesMap | null>,
): SeasonSimulationResult['standings'] {
  const n = opponentPool.length;
  const wins = [...opp.wins];
  const losses = [...opp.losses];
  const pf = [...opp.pointsFor];
  const pa = [...opp.pointsAgainst];

  // Exact-fill slots: team i appears (82 - gamesVsUser) times, shuffled and
  // paired so nobody is stranded and nobody exceeds 82.
  const slots: number[] = [];
  for (let i = 0; i < n; i++) {
    const remaining = Math.max(0, totalGames - (opp.gamesVsUser[i] ?? 0));
    for (let k = 0; k < remaining; k++) slots.push(i);
  }
  shuffleInPlace(slots);
  // Repair self-pairings by swapping with a neighbor; reshuffle if stuck.
  for (let attempt = 0; attempt < 25; attempt++) {
    let bad = -1;
    for (let p = 0; p + 1 < slots.length; p += 2) {
      if (slots[p] === slots[p + 1]) {
        bad = p;
        break;
      }
    }
    if (bad === -1) break;
    let fixed = false;
    for (let q = 0; q + 1 < slots.length; q += 2) {
      if (q === bad) continue;
      if (slots[q] !== slots[bad] && slots[q + 1] !== slots[bad]) {
        const tmp = slots[bad + 1]!;
        slots[bad + 1] = slots[q]!;
        slots[q] = tmp;
        fixed = true;
        break;
      }
    }
    if (!fixed) shuffleInPlace(slots);
  }
  // Final sweep: swap any leftover self-pair across pairs (counts preserved).
  // As an absolute fallback a team "plays itself" and takes both the win and
  // the loss, so every team still lands on exactly 82 games.
  for (let p = 0; p + 1 < slots.length; p += 2) {
    if (slots[p] !== slots[p + 1]) continue;
    const x = slots[p]!;
    let swapped = false;
    for (let r = 0; r + 1 < slots.length; r += 2) {
      if (r === p) continue;
      if (slots[r] !== x && slots[r + 1] !== x) {
        const tmp = slots[p + 1]!;
        slots[p + 1] = slots[r]!;
        slots[r] = tmp;
        swapped = true;
        break;
      }
    }
    void swapped;
  }

  const midSeason = Math.floor(totalGames / 2);
  for (let p = 0; p + 1 < slots.length; p += 2) {
    const a = slots[p]!;
    const b = slots[p + 1]!;
    if (a === b) {
      // Degenerate fallback (vanishingly rare): intrasquad scrimmage —
      // the team banks one win and one loss, staying at exactly 82 games.
      const squad = opponentPool[a]!;
      const rating = calculateTeamRating(squad, config, true, midSeason, totalGames, squad);
      const { home, away } = simulateGameScore(rating, rating, config, teamPace(squad), 0);
      wins[a]! += 1;
      losses[a]! += 1;
      pf[a]! += home + away;
      pa[a]! += home + away;
      continue;
    }
    const teamA = opponentPool[a]!;
    const teamB = opponentPool[b]!;
    const aHome = randomFloat() < 0.5;
    const homeRoster = aHome ? teamA : teamB;
    const awayRoster = aHome ? teamB : teamA;
    const homeDefaults = oppDefaults[aHome ? a : b] ?? null;
    const awayDefaults = oppDefaults[aHome ? b : a] ?? null;
    let homeRating = calculateTeamRating(homeRoster, config, true, midSeason, totalGames, awayRoster, false, null, null, homeDefaults);
    let awayRating = calculateTeamRating(awayRoster, config, false, midSeason, totalGames, homeRoster, false, null, null, awayDefaults);
    const gamePace = gamePaceFor(teamA, teamB);
    let spread = (homeRating - awayRating) * SCORE_SPREAD_FACTOR;
    if (Math.abs(spread) <= 5) {
      homeRating = calculateTeamRating(homeRoster, config, true, midSeason, totalGames, awayRoster, true, null, null, homeDefaults);
      awayRating = calculateTeamRating(awayRoster, config, false, midSeason, totalGames, homeRoster, true, null, null, awayDefaults);
      spread = (homeRating - awayRating) * SCORE_SPREAD_FACTOR;
    }
    const clutchDelta =
      Math.abs(spread) <= 5
        ? (teamClutch(homeRoster) - teamClutch(awayRoster)) * 0.15 + (teamFTr(homeRoster) - teamFTr(awayRoster)) * 10
        : 0;
    // Ejections resolve symmetrically on the minutes path; legacy stays frozen.
    let homeFoul: FoulResolution | null = null;
    let awayFoul: FoulResolution | null = null;
    let foulDelta = 0;
    if (homeDefaults) {
      homeFoul = resolveFouls(homeRoster, planActualMinutes(homeRoster, null, homeDefaults));
      foulDelta += homeFoul.adjustment;
    }
    if (awayDefaults) {
      awayFoul = resolveFouls(awayRoster, planActualMinutes(awayRoster, null, awayDefaults));
      foulDelta -= awayFoul.adjustment;
    }
    const { home, away } = simulateGameScore(homeRating, awayRating, config, gamePace, clutchDelta + foulDelta);
    // Box minutes: minutes-path sides use post-ejection actuals, legacy sides
    // the fixed rotation formula. CPU defaults have no DNPs so all play.
    const minutesA = awayFoul || homeFoul
      ? (aHome ? (homeFoul?.actual ?? planActualMinutes(teamA, null, oppDefaults[a] ?? null)) : (awayFoul?.actual ?? planActualMinutes(teamA, null, oppDefaults[a] ?? null)))
      : assignRotationMinutes(teamA, null, 0);
    const minutesB = awayFoul || homeFoul
      ? (aHome ? (awayFoul?.actual ?? planActualMinutes(teamB, null, oppDefaults[b] ?? null)) : (homeFoul?.actual ?? planActualMinutes(teamB, null, oppDefaults[b] ?? null)))
      : assignRotationMinutes(teamB, null, 0);
    const foulsFor = (team: Player[], hz: FoulResolution | null): Record<string, number> => {
      if (hz) return hz.fouls;
      const out: Record<string, number> = {};
      for (const p of team) {
        if (p) out[p.id] = rollFouls(p);
      }
      return out;
    };
    const minutesAFouls = aHome ? foulsFor(teamA, homeFoul) : foulsFor(teamA, awayFoul);
    const minutesBFouls = aHome ? foulsFor(teamB, awayFoul) : foulsFor(teamB, homeFoul);
    for (const [team, rating, opposingRating, rotation, fouls] of [[teamA, homeRating, awayRating, minutesA, minutesAFouls], [teamB, awayRating, homeRating, minutesB, minutesBFouls]] as const) {
      for (const player of team) {
        const seasonStat = opponentPlayerSeasonStats[player.id];
        if (!seasonStat) continue;
        const minutes = rotation[player.id] ?? assignMinutes(player);
        if (minutes <= 0) continue;
        const stats = generatePlayerGameStats(player, rating, opposingRating, minutes, config, fouls[player.id]);
        opponentPlayerMinutes[player.id]?.push(minutes);
        seasonStat.gamesPlayed++;
        seasonStat.totals.pts += stats.pts;
        seasonStat.totals.reb += stats.reb;
        seasonStat.totals.ast += stats.ast;
        seasonStat.totals.stl += stats.stl;
        seasonStat.totals.blk += stats.blk;
        seasonStat.totals.pf += stats.pf;
        seasonStat.highGames.pts = Math.max(seasonStat.highGames.pts, stats.pts);
        seasonStat.highGames.reb = Math.max(seasonStat.highGames.reb, stats.reb);
        seasonStat.highGames.ast = Math.max(seasonStat.highGames.ast, stats.ast);
        seasonStat.highGames.stl = Math.max(seasonStat.highGames.stl, stats.stl);
        seasonStat.highGames.blk = Math.max(seasonStat.highGames.blk, stats.blk);
        seasonStat.highGames.pf = Math.max(seasonStat.highGames.pf, stats.pf);
      }
    }
    const aScore = aHome ? home : away;
    const bScore = aHome ? away : home;
    if (aScore >= bScore) {
      wins[a]! += 1;
      losses[b]! += 1;
    } else {
      wins[b]! += 1;
      losses[a]! += 1;
    }
    pf[a]! += aScore;
    pa[a]! += bScore;
    pf[b]! += bScore;
    pa[b]! += aScore;
  }
  for (const stats of Object.values(opponentPlayerSeasonStats)) {
    if (stats.gamesPlayed === 0) continue;
    stats.averages = {
      pts: Number((stats.totals.pts / stats.gamesPlayed).toFixed(1)),
      reb: Number((stats.totals.reb / stats.gamesPlayed).toFixed(1)),
      ast: Number((stats.totals.ast / stats.gamesPlayed).toFixed(1)),
      stl: Number((stats.totals.stl / stats.gamesPlayed).toFixed(1)),
      blk: Number((stats.totals.blk / stats.gamesPlayed).toFixed(1)),
      pf: Number((stats.totals.pf / stats.gamesPlayed).toFixed(1)),
    };
    const minutes = opponentPlayerMinutes[stats.playerId] ?? [];
    stats.minutesPerGame = minutes.length > 0
      ? Number((minutes.reduce((sum, value) => sum + value, 0) / minutes.length).toFixed(1))
      : 0;
  }

  const rows: SeasonSimulationResult['standings'] = [];
  for (let i = 0; i < n; i++) {
    const w = wins[i] ?? 0;
    const l = losses[i] ?? 0;
    const played = w + l || 1;
    rows.push({
      team: opponentNames[i] ?? `Opponent ${((i) % 30) + 1}`,
      wins: w,
      losses: l,
      winPct: Number((w / played).toFixed(3)),
      pointsFor: pf[i] ?? 0,
      pointsAgainst: pa[i] ?? 0,
      pointDiff: (pf[i] ?? 0) - (pa[i] ?? 0),
      gamesBehind: 0,
      isUser: false,
    });
  }
  const userPlayed = userRecord.wins + userRecord.losses || 1;
  rows.push({
    team: 'Your Team',
    wins: userRecord.wins,
    losses: userRecord.losses,
    winPct: Number((userRecord.wins / userPlayed).toFixed(3)),
    pointsFor: userRecord.pointsFor,
    pointsAgainst: userRecord.pointsAgainst,
    pointDiff: userRecord.pointsFor - userRecord.pointsAgainst,
    gamesBehind: 0,
    isUser: true,
  });

  rows.sort((x, y) => y.wins - x.wins || y.pointDiff - x.pointDiff || x.team.localeCompare(y.team));
  const lead = rows[0];
  if (lead) {
    for (const r of rows) {
      r.gamesBehind = Number((((lead.wins - r.wins) + (r.losses - lead.losses)) / 2).toFixed(1));
    }
  }
  return rows;
}

function calculateTeamSeasonStats(
  _lineup: Player[],
  playerSeasonStats: Record<string, PlayerSeasonStats>,
  games: SeasonSimulationResult['games']
): TeamSeasonStats {
  let totalPts = 0;
  let totalAllowed = 0;
  let totalPace = 0;

  for (const game of games) {
    totalPts += game.score.us;
    totalAllowed += game.score.them;
    totalPace += game.pace;
  }

  const numGames = games.length || 1;
  const avgPts = totalPts / numGames;
  const avgAllowed = totalAllowed / numGames;
  // Real blended pace from the games actually played (era pace flows through).
  const pace = totalPace / numGames || AVG_POSSESSIONS;

  let totalReb = 0, totalAst = 0, totalStl = 0, totalBlk = 0;
  for (const [, stats] of Object.entries(playerSeasonStats)) {
    totalReb += stats.averages.reb;
    totalAst += stats.averages.ast;
    totalStl += stats.averages.stl;
    totalBlk += stats.averages.blk;
  }

  // Both ratings derive from actual simulated scoring per 100 possessions.
  const offensiveRating = (avgPts / pace) * 100;
  const defensiveRating = (avgAllowed / pace) * 100;

  return {
    offensiveRating: Number(offensiveRating.toFixed(1)),
    defensiveRating: Number(defensiveRating.toFixed(1)),
    pace: Number(pace.toFixed(1)),
    netRating: Number((offensiveRating - defensiveRating).toFixed(1)),
    avgPts: Number(avgPts.toFixed(1)),
    avgReb: Number(totalReb.toFixed(1)),
    avgAst: Number(totalAst.toFixed(1)),
    avgStl: Number(totalStl.toFixed(1)),
    avgBlk: Number(totalBlk.toFixed(1)),
    record: `${games.filter(g => g.result === 'W').length}-${games.filter(g => g.result === 'L').length}`,
  };
}

export function calculateNonLinearWinCurve(teamStrength: number): number {
  // Logistic win curve centered so a league-average team (strength 50)
  // projects to 41 wins. Same model family as the sim itself, so the
  // projection tracks actual results instead of compressing everyone
  // into the 70s: ~28 -> 6W, ~40 -> 21W, 50 -> 41W, 60 -> 61W, ~72 -> 76W.
  const clamped = Math.max(0, Math.min(100, teamStrength));
  const winPct = 1 / (1 + Math.pow(10, -(clamped - 50) / WIN_CURVE_DIVISOR));

  return Math.round(winPct * SIMULATION_CONSTANTS.MAX_GAMES);
}

/**
 * Deterministic base impact of a lineup: same weights as live ratings but
 * neutral venue, no variance, no fatigue, no matchup suppression, no clutch.
 * Used for strength/projection so the estimate and the sim can never disagree
 * structurally. Partial lineups are prorated (n/10 for 10-man) so draft previews
 * read low until filled. Primary slots are assumed (flex penalty needs assignments).
 */
export function getBaseTeamImpact(lineup: Player[], sixthManId?: string | null, options?: OptionRanks | null, minutes?: MinutesMap | null): number {
  const slots = assignSlots(lineup);
  const effMin = minutes ? effectiveMinutes(lineup, sixthManId ?? null, minutes) : null;
  const items: Array<{ impact: number; usage: number; rank?: 1 | 2 | 3 }> = [];
  const primaries = new Set<Position>();
  let ownEra: EraContext;
  try {
    ownEra = teamEraContext(lineup);
  } catch {
    ownEra = getEraContext('2020s');
  }
  for (const [index, player] of lineup.entries()) {
    if (!player) continue;
    const { pts, defense, rest } = playerBaseParts(player, false);
    const rank = optionRankOf(player.id, options);
    let ptsWithOptions = pts * (rank ? (OPTION_PTS_BOOST[rank] ?? 1) : 1);
    try {
      const mod = modifiedAttributesOf(player);
      if (ownEra.zoneDefense && mod.ballHandle >= 85) ptsWithOptions *= 1.02;
      if (ownEra.illegalDefenseRules && (mod.postControl >= 85 || mod.midRangeShot >= 85)) ptsWithOptions *= 1.02;
    } catch {
      // ignore
    }
    let impact = ptsWithOptions + defense + rest;
    const slot = slots[index];
    if (slot && slot !== player.position) impact *= 0.95;
    const w = effMin ? (effMin[player.id] ?? 0) / 48 : rotationWeight(index, player.id, sixthManId, lineup.length);
    impact *= w;
    if (effMin) {
      const m = effMin[player.id] ?? 0;
      if (m > OVERUSE_THRESHOLD) impact *= 1 - (m - OVERUSE_THRESHOLD) * OVERUSE_PER_MIN;
    }
    items.push({ impact, usage: usageRateOf(player), rank });
    if (w > 0.02) primaries.add(player.position);
  }
  if (items.length === 0) return 0;
  items.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.impact - a.impact);
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i]!.impact * (STAR_USAGE_BONUS[i] ?? 1);
  }
  if (lineup.length > 5) {
    const div = effMin
      ? lineup.reduce((t, p) => t + (p ? (effMin[p.id] ?? 0) / 48 : 0), 0)
      : rotationDivisor(lineup, sixthManId);
    total = total / (div > 0 ? div : 5) * 5;
  }
  total *= collisionMultiplier(items.map((it) => it.usage));
  if (!hasFloorBalance(primaries)) total *= 0.94;
  const present = lineup.filter(Boolean) as Player[];
  const spacingExcess = team3PAR(present) - rosterEra3PAR(present);
  if (spacingExcess > 0) {
    total *= 1 + Math.min(0.04, 0.01 + spacingExcess * 0.15);
  }
  try {
    if (ownEra.threePointEmphasis >= 0.5 && present.length > 0) {
      const avgThree = present.reduce((t, p) => t + modifiedAttributesOf(p).threePointShot, 0) / present.length;
      if (avgThree > 75) total *= 1 + Math.min(0.02, (avgThree - 75) * 0.0012);
    }
  } catch {
    // ignore
  }
  if (hasSixthMan(lineup, sixthManId)) {
    if (!effMin || (sixthManId && (effMin[sixthManId] ?? 0) > 0)) {
      total *= SIXTH_TEAM_BOOST;
    }
  }
  const counted = items.length;
  const fullSize = lineup.length > 5 ? 10 : 5;
  return total * (counted / fullSize);
}

export function getTeamStrength(lineup: Player[], sixthManId?: string | null, options?: OptionRanks | null, minutes?: MinutesMap | null): number {
  if (lineup.length === 0) return 0;
  // Strength is just the base-impact differential vs a league-average
  // opponent, scaled to 0-100. Full coverage is enforced by
  // validation, so no separate coverage bonus is needed.
  return strengthVsLeague(getBaseTeamImpact(lineup, sixthManId, options, minutes), LEAGUE_AVG_IMPACT);
}

/**
 * Strength of a base impact against an arbitrary league average (e.g. an
 * era league instead of the synthetic reference league). Same scale as
 * getTeamStrength, so calculateNonLinearWinCurve applies unchanged —
 * projections stay honest no matter which league is simulated.
 */
export function strengthVsLeague(baseImpact: number, leagueAvgImpact: number): number {
  return Math.max(0, Math.min(100, Math.round(50 + (baseImpact - leagueAvgImpact) * IMPACT_TO_STRENGTH)));
}
