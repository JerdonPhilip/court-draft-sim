import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Player, Position, MinutesMap } from '../types/game';
import { canPlayPosition, getPlayerPositions } from '../types/game';
import { FRANCHISES } from '../data/constants';

export type { MinutesMap };

export { canPlayPosition, getPlayerPositions };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number, decimals = 1): string {
  if (!Number.isFinite(num)) return '—';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(decimals) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(decimals) + 'K';
  }
  return Number.isInteger(num) ? String(num) : num.toFixed(decimals);
}

const POSITION_COLORS: Record<string, string> = {
  PG: '#00d4aa',
  SG: '#ffd700',
  SF: '#ff6b6b',
  PF: '#7c5cff',
  C: '#007aff',
};

export function getPositionColor(position: string): string {
  return POSITION_COLORS[position] || '#8fabbf';
}

export const POSITION_LABELS: Record<string, string> = {
  PG: 'Point Guard',
  SG: 'Shooting Guard',
  SF: 'Small Forward',
  PF: 'Power Forward',
  C: 'Center',
};

export function getPositionLabel(position: string): string {
  return POSITION_LABELS[position] ?? position;
}

// Kept for non-visual contexts; UI should prefer text labels + getPositionColor.
export function getPositionIcon(position: string): string {
  const icons: Record<string, string> = {
    PG: 'PG',
    SG: 'SG',
    SF: 'SF',
    PF: 'PF',
    C: 'C',
  };
  return icons[position] || '•';
}

interface StrengthInput {
  overall: number;
  position: string;
  secondaryPositions?: Position[];
  heightIn?: number;
  decade?: string;
  tsPct?: number;
  tov?: number;
  usageRate?: number;
  threePar?: number;
  foulProneness?: number;
  stats: { pts: number; reb: number; ast: number; stl: number; blk: number };
}

// --- Strength / projection model (must match server simulationEngine.ts
// + services/constants.ts + services/playerTraits.ts). Strength is the
// deterministic base-impact differential vs a league-average opponent
// (LEAGUE_AVG_IMPACT), so the draft-screen projection and the sim can never
// disagree structurally. Base impact mirrors the live formula minus venue,
// variance, fatigue, matchup suppression and clutch (neutral-matchup estimate).
const LEAGUE_AVG_IMPACT = 38.1;
const IMPACT_TO_STRENGTH = 1.2;
// Must match server services/constants.ts.
const OVERALL_CURVE_EXPONENT = 1.5;
const STAR_USAGE_BONUS = [1.18, 1.07, 1.0, 0.95, 0.9] as const;
// Must match server services/playerTraits.ts (estimates, not measurements).
const REFERENCE_PACE = 98;
const ERA_PACE: Record<string, number> = {
  '1960s': 118, '1970s': 106, '1980s': 102, '1990s': 92, '2000s': 91, '2010s': 96, '2020s': 99,
};
const ERA_TS: Record<string, number> = {
  '1960s': 0.487, '1970s': 0.5, '1980s': 0.532, '1990s': 0.529, '2000s': 0.531, '2010s': 0.545, '2020s': 0.58,
};
const ERA_3PAR: Record<string, number> = {
  '1960s': 0.02, '1970s': 0.02, '1980s': 0.06, '1990s': 0.1, '2000s': 0.18, '2010s': 0.28, '2020s': 0.35,
};
const POSITION_3PAR_BASE: Record<string, number> = {
  PG: 0.35, SG: 0.38, SF: 0.33, PF: 0.25, C: 0.12,
};
const WIN_CURVE_DIVISOR = 22;

// Must match server services/constants.ts.
const POSITION_HEIGHT_BASELINE: Record<string, number> = {
  PG: 74,
  SG: 77,
  SF: 79,
  PF: 81,
  C: 83,
};
const HEIGHT_REB_PER_INCH = 0.05;
const HEIGHT_BLK_PER_INCH = 0.06;
const HEIGHT_FACTOR_MIN = 0.88;
const HEIGHT_FACTOR_MAX = 1.12;

/** "Michael Jordan" -> { first: "Michael", last: "Jordan" }. Suffixes stay on the last line ("Robert Horry III"). */
export function splitPlayerName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  const [first = '', ...rest] = parts;
  return { first, last: rest.join(' ') };
}

/**
 * Single-line name sizing: longer last names render smaller so the
 * row never wraps (which would stretch the card and scroll the page).
 * Returns a px size; pair with whitespace-nowrap + an overflow-hidden
 * wrapper so extreme cases clip at the boundary instead of painting
 * behind the overall rating.
 */
export function fitNameSize(lastName: string, basePx = 20): number {
  const len = lastName.length;
  if (len > 17) return Math.max(12, basePx - 7);
  if (len > 14) return Math.max(13, basePx - 4);
  if (len > 10) return Math.max(14, basePx - 2);
  return basePx;
}
/** 0/undefined -> '', 1 -> 'OT', 3 -> '3OT'. */
export function otLabel(otPeriods: number | undefined): string {
  if (!otPeriods || otPeriods <= 0) return '';
  return otPeriods === 1 ? 'OT' : `${otPeriods}OT`;
}

export function formatHeight(heightIn: number | undefined, position?: string): string {
  const baseline = (position ? POSITION_HEIGHT_BASELINE[position] : undefined) ?? 79;
  const h = typeof heightIn === 'number' && Number.isFinite(heightIn) ? heightIn : baseline;
  return `${Math.floor(h / 12)}'${Math.round(h % 12)}"`;
}

export function heightEdgeLabel(heightIn: number | undefined, position: string): string | null {
  const baseline = POSITION_HEIGHT_BASELINE[position];
  if (baseline === undefined || !Number.isFinite(heightIn)) return null;
  const diff = (heightIn as number) - baseline;
  if (diff >= 2) return `+${diff}" size edge`;
  if (diff <= -2) return `${diff}" undersized`;
  return null;
}

const IMPACT_WEIGHTS: Record<string, { pts: number; reb: number; ast: number; stl: number; blk: number }> = {
  PG: { pts: 1.1, reb: 0.4, ast: 1.5, stl: 1.3, blk: 0.2 },
  SG: { pts: 1.3, reb: 0.4, ast: 0.8, stl: 1.2, blk: 0.3 },
  SF: { pts: 1.2, reb: 0.7, ast: 0.8, stl: 1.1, blk: 0.6 },
  PF: { pts: 1.1, reb: 1.2, ast: 0.6, stl: 0.8, blk: 1.0 },
  C: { pts: 1.0, reb: 1.5, ast: 0.4, stl: 0.5, blk: 1.5 },
};

const STAT_SHARE = { pts: 0.35, reb: 0.20, ast: 0.20, stl: 0.12, blk: 0.13 };

function traitEraPace(decade: string | undefined): number {
  return ERA_PACE[decade ?? ''] ?? ERA_PACE['2020s']!;
}

function traitEraTS(decade: string | undefined): number {
  return ERA_TS[decade ?? ''] ?? ERA_TS['2010s']!;
}

function traitTsPct(p: StrengthInput): number {
  if (typeof p.tsPct === 'number' && Number.isFinite(p.tsPct)) return p.tsPct;
  return Math.max(0.42, Math.min(0.68, traitEraTS(p.decade) + (p.overall - 82) * 0.0035));
}

function traitTov(p: StrengthInput): number {
  if (typeof p.tov === 'number' && Number.isFinite(p.tov)) return p.tov;
  return Math.max(0.5, Math.min(5, 1.2 + p.stats.ast * 0.18 + (p.stats.pts > 20 ? 0.5 : 0) - (p.overall - 80) * 0.02));
}

function traitUsage(p: StrengthInput): number {
  if (typeof p.usageRate === 'number' && Number.isFinite(p.usageRate)) return p.usageRate;
  return Math.max(10, Math.min(38, 14 + p.stats.pts * 0.55 + p.stats.ast * 0.4));
}

function traitEfficiency(p: StrengthInput): number {
  return Math.max(0.5, traitTsPct(p) / traitEraTS(p.decade));
}

function traitThreePar(p: StrengthInput): number {
  if (typeof p.threePar === 'number' && Number.isFinite(p.threePar)) return p.threePar;
  if (p.decade === '1960s' || p.decade === '1970s') return 0.02;
  return Math.max(0.02, Math.min(0.55, (POSITION_3PAR_BASE[p.position] ?? 0.3) + (p.stats.pts - 15) * 0.008));
}

function traitFoulProneness(p: StrengthInput): number {
  if (typeof p.foulProneness === 'number' && Number.isFinite(p.foulProneness)) return p.foulProneness;
  return Math.max(1, Math.min(100, Math.round(42 + (p.stats.stl + p.stats.blk) * 7 - (p.overall - 80) * 0.3)));
}

export const BENCH_WEIGHT = 0.35;
export const SIXTH_WEIGHT = 0.65;
export const SIXTH_TEAM_BOOST = 1.015;

/** Custom-minutes defaults (mirrors server simulationEngine.ts). */
export const DEFAULT_STARTER_MINUTES = 34;
export const DEFAULT_SIXTH_MINUTES = 22;
export const DEFAULT_BENCH_MINUTES = 12;
export const TEAM_MINUTES_REGULATION = 240;
const OVERUSE_THRESHOLD = 32;
const OVERUSE_PER_MIN = 0.008;

/** Foul proneness 1-100 (mirrors server playerTraits.ts). */
export function foulPronenessOf(p: StrengthInput): number {
  return traitFoulProneness(p);
}

export function foulRiskLabel(p: StrengthInput): 'Low' | 'Medium' | 'High' {
  const v = traitFoulProneness(p);
  return v < 40 ? 'Low' : v > 65 ? 'High' : 'Medium';
}

/** Role-based default plan from lineup slots (sixth-aware, sums to 240). */
export function buildDefaultMinutes(
  slots: Array<{ player: { id: string } | null; role?: string; isSixthMan?: boolean }>,
): MinutesMap {
  const map: MinutesMap = {};
  const filled = slots.filter(s => s.player);
  if (filled.length === 0) return map;
  if (filled.length <= 5) {
    const each = TEAM_MINUTES_REGULATION / filled.length;
    filled.forEach(s => { map[s.player!.id] = each; });
    return map;
  }
  const sixthId = slots.find(s => s.isSixthMan && s.player)?.player?.id ?? null;
  slots.forEach(s => {
    if (!s.player) return;
    if ((s.role ?? 'starter') !== 'bench') map[s.player.id] = DEFAULT_STARTER_MINUTES;
    else if (sixthId && s.player.id === sixthId) map[s.player.id] = DEFAULT_SIXTH_MINUTES;
    else map[s.player.id] = sixthId ? DEFAULT_BENCH_MINUTES : 14;
  });
  return map;
}

export function minutesTotal(minutes: MinutesMap | null | undefined): number {
  if (!minutes) return 0;
  return Object.values(minutes).reduce((t, v) => t + (Number.isFinite(v) ? v : 0), 0);
}

/** Role-free default plan for ordered rotations (first 5 = starters). */
export function defaultMinutesForOrdered(ids: string[]): MinutesMap {
  const map: MinutesMap = {};
  if (ids.length === 0) return map;
  if (ids.length <= 5) {
    const each = TEAM_MINUTES_REGULATION / ids.length;
    ids.forEach(id => { map[id] = each; });
    return map;
  }
  ids.forEach((id, i) => { map[id] = i < 5 ? DEFAULT_STARTER_MINUTES : 14; });
  return map;
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

function rotationDivisor(players: StrengthInput[], sixthManId: string | null | undefined): number {
  if (players.length <= 5) return Math.max(1, players.length);
  let div = 0;
  players.forEach((p, i) => {
    div += rotationWeight(i, (p as { id?: string }).id ?? String(i), sixthManId, players.length);
  });
  return div > 0 ? div : 5;
}

export function getBaseTeamImpact(players: StrengthInput[], sixthManId?: string | null, options?: OptionRanks | null, minutes?: MinutesMap | null): number {
  // Minutes-share weighting mirrors the server: a custom plan replaces the
  // fixed starter/sixth/bench weights (plan is normalized to 240 here too).
  let effMin: MinutesMap | null = null;
  if (minutes) {
    const ids = players.map((p, i) => (p as { id?: string }).id ?? String(i));
    const raw: MinutesMap = {};
    ids.forEach((id, i) => {
      const v = (minutes as MinutesMap)[id];
      raw[id] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(48, v)) : 0;
      void i;
    });
    const sum = Object.values(raw).reduce((t, v) => t + v, 0);
    effMin = {};
    ids.forEach(id => {
      effMin![id] = sum > 0 ? (raw[id] ?? 0) / sum * TEAM_MINUTES_REGULATION : TEAM_MINUTES_REGULATION / Math.max(1, ids.length);
    });
  }
  const weightOf = (key: string, i: number): number =>
    effMin ? (effMin[key] ?? 0) / 48 : rotationWeight(i, key, sixthManId, players.length);
  const impacts: Array<{ impact: number; usage: number; rank?: 1 | 2 | 3 }> = [];
  const primaries = new Set<string>();
  const assigned = new Array<string | undefined>(players.length).fill(undefined);
  const taken = new Set<string>();
  players.forEach((p, i) => {
    if (!taken.has(p.position)) {
      assigned[i] = p.position;
      taken.add(p.position);
    }
  });
  players.forEach((p, i) => {
    if (assigned[i]) return;
    const alt = (p.secondaryPositions ?? []).find((s) => !taken.has(s));
    if (alt) {
      assigned[i] = alt;
      taken.add(alt);
    }
  });
  players.forEach((p, i) => {
    if (assigned[i]) return;
    const free = (['PG', 'SG', 'SF', 'PF', 'C'] as const).find((s) => !taken.has(s));
    if (free) {
      assigned[i] = free;
      taken.add(free);
    }
  });
  players.forEach((p, i) => {
    const w = IMPACT_WEIGHTS[p.position] ?? IMPACT_WEIGHTS.C!;
    const baseline = POSITION_HEIGHT_BASELINE[p.position] ?? 79;
    const h = Number.isFinite(p.heightIn) ? (p.heightIn as number) : baseline;
    const clamp = (v: number) => Math.max(HEIGHT_FACTOR_MIN, Math.min(HEIGHT_FACTOR_MAX, v));
    const rebF = clamp(1 + HEIGHT_REB_PER_INCH * (h - baseline));
    const blkF = clamp(1 + HEIGHT_BLK_PER_INCH * (h - baseline));
    const norm = (raw: number) => raw * (REFERENCE_PACE / (ERA_PACE[p.decade ?? ''] ?? ERA_PACE['2020s']!));
    const curve = Math.pow(p.overall / 100, OVERALL_CURVE_EXPONENT);
    const eff = traitEfficiency(p);
    const proneness = traitFoulProneness(p);
    const discMod = proneness < 40 ? 1.02 : proneness > 65 ? 1.05 : 1;
    const rank = optionRankOf((p as { id?: string }).id ?? String(i), options);
    const pts = norm(p.stats.pts) * w.pts * STAT_SHARE.pts * curve * eff * (rank ? (OPTION_PTS_BOOST[rank] ?? 1) : 1);
    const defense =
      (norm(p.stats.stl) * w.stl * STAT_SHARE.stl + norm(p.stats.blk) * w.blk * STAT_SHARE.blk * blkF) * curve * eff * discMod;
    const rest =
      (norm(p.stats.reb) * w.reb * STAT_SHARE.reb * rebF + norm(p.stats.ast) * w.ast * STAT_SHARE.ast) * curve * eff;
    let impact = pts + defense + rest;
    const slot = assigned[i];
    if (slot && slot !== p.position) impact *= 0.95;
    const key = (p as { id?: string }).id ?? String(i);
    const rw = weightOf(key, i);
    impact *= rw;
    if (effMin) {
      const m = effMin[key] ?? 0;
      if (m > OVERUSE_THRESHOLD) impact *= 1 - (m - OVERUSE_THRESHOLD) * OVERUSE_PER_MIN;
    }
    impacts.push({ impact, usage: traitUsage(p), rank });
    if (rw > 0.02) primaries.add(p.position);
  });
  if (impacts.length === 0) return 0;
  impacts.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.impact - a.impact);
  let total = 0;
  for (let i = 0; i < impacts.length; i++) {
    total += impacts[i]!.impact * (STAR_USAGE_BONUS[i] ?? 1);
  }
  if (players.length > 5) {
    const div = effMin
      ? players.reduce((t, p, i) => t + (p ? weightOf((p as { id?: string }).id ?? String(i), i) : 0), 0)
      : rotationDivisor(players, sixthManId);
    total = total / (div > 0 ? div : 5) * 5;
  }
  const mouths = impacts.filter((it) => it.usage > 30).length;
  if (mouths > 1) total *= 1.0 - 0.035 * (mouths - 1);
  const hasGuard = primaries.has('PG') || primaries.has('SG');
  const hasWing = primaries.has('SG') || primaries.has('SF') || primaries.has('PF');
  const hasBig = primaries.has('PF') || primaries.has('C');
  if (!(hasGuard && hasWing && hasBig)) total *= 0.94;
  const present3PAR = impacts.length > 0 ? players.reduce((t, p) => t + traitThreePar(p), 0) / players.length : 0;
  const era3PAR =
    impacts.length > 0 ? players.reduce((t, p) => t + (ERA_3PAR[p.decade ?? ''] ?? 0.2), 0) / players.length : 0.2;
  const excess = present3PAR - era3PAR;
  if (excess > 0) total *= 1 + Math.min(0.04, 0.01 + excess * 0.15);
  if (players.length > 5 && sixthManId && players.some((p, i) => i >= 5 && (p as { id?: string }).id === sixthManId)) {
    if (!effMin || (effMin[sixthManId] ?? 0) > 0) {
      total *= SIXTH_TEAM_BOOST;
    }
  }
  const counted = impacts.length;
  const fullSize = players.length > 5 ? 10 : 5;
  return total * (counted / fullSize);
}

export function calculateTeamStrength(players: StrengthInput[], sixthManId?: string | null, options?: OptionRanks | null, minutes?: MinutesMap | null): number {
  if (players.length === 0) return 0;
  const base = getBaseTeamImpact(players, sixthManId, options, minutes);
  return Math.max(0, Math.min(100, Math.round(50 + (base - LEAGUE_AVG_IMPACT) * IMPACT_TO_STRENGTH)));
}

export function getWinProjection(teamStrength: number): number {
  // Logistic win curve mirroring server calculateNonLinearWinCurve:
  // 50 -> 41W, ~60 -> 61W, ~40 -> 21W.
  const clamped = Math.max(0, Math.min(100, teamStrength));
  const winPct = 1 / (1 + Math.pow(10, -(clamped - 50) / WIN_CURVE_DIVISOR));

  return Math.round(winPct * 82);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function debounce<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function generateId(): string {
  const gCrypto = globalThis.crypto as Crypto | undefined;
  if (gCrypto && 'randomUUID' in gCrypto && typeof gCrypto.randomUUID === 'function') {
    return gCrypto.randomUUID();
  }
  if (gCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    gCrypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function isFullLineup(slots: Array<{ player: Player | null }>): boolean {
  return (slots.length === 5 || slots.length === 10) && slots.every(s => s.player !== null);
}

/** Empty slots a player could fill right now. */
export function getEligibleEmptySlots(
  player: Pick<Player, 'position' | 'secondaryPositions'>,
  slots: Array<{ position: Position; player: Player | null }>
): number[] {
  const out: number[] = [];
  slots.forEach((s, i) => {
    if (!s.player && canPlayPosition(player, s.position)) out.push(i);
  });
  return out;
}

/** Slots (empty or not) a player could ever cover — for badges. */
export function getFittingSlots(
  player: Pick<Player, 'position' | 'secondaryPositions'>,
  slots: Array<{ position: Position }>
): Position[] {
  return slots.map(s => s.position).filter(pos => canPlayPosition(player, pos));
}

const FRANCHISE_NAME_BY_ID = new Map<string, string>(
  FRANCHISES.map(f => [f.id.toLowerCase(), f.name]),
);

/**
 * Display name for a team value. Player cards store the franchise id
 * ("knicks"), opponent rows store the full schedule name
 * ("New York Knicks" / "1990s Chicago Bulls"). Map ids to their full
 * name and capitalize anything else so the UI never shows raw lowercase.
 */
export function formatTeamName(team: string | undefined | null): string {
  if (!team) return '—';
  const trimmed = team.trim();
  if (!trimmed) return '—';
  const full = FRANCHISE_NAME_BY_ID.get(trimmed.toLowerCase());
  if (full) return full;
  return trimmed
    .split(/[\s_-]+/)
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
