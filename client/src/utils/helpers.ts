import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Player, Position } from '../types/game';
import { canPlayPosition, getPlayerPositions } from '../types/game';

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
  stats: { pts: number; reb: number; ast: number; stl: number; blk: number };
}

// --- Strength / projection model (must match server simulationEngine.ts
// + services/constants.ts). Strength is the deterministic base-impact
// differential vs a league-average opponent (LEAGUE_AVG_IMPACT), so the
// draft-screen projection and the sim can never disagree structurally.
const LEAGUE_AVG_IMPACT = 39.4;
const IMPACT_TO_STRENGTH = 1.2;
const WIN_CURVE_DIVISOR = 22;

// Must match server services/constants.ts.
const POSITION_HEIGHT_BASELINE: Record<string, number> = {
  PG: 75,
  SG: 77,
  SF: 79,
  PF: 81,
  C: 83,
};
const HEIGHT_REB_PER_INCH = 0.06;
const HEIGHT_BLK_PER_INCH = 0.08;
const HEIGHT_FACTOR_MIN = 0.85;
const HEIGHT_FACTOR_MAX = 1.15;

/** "Michael Jordan" -> { first: "Michael", last: "Jordan" }. Suffixes stay on the last line ("Robert Horry III"). */
export function splitPlayerName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  const [first = '', ...rest] = parts;
  return { first, last: rest.join(' ') };
}

/**
 * Single-line name sizing: longer last names render slightly smaller so the
 * row never wraps (which would stretch the card and scroll the page).
 * Returns a px size; pair with whitespace-nowrap.
 */
export function fitNameSize(lastName: string, basePx = 20): number {
  const len = lastName.length;
  if (len > 14) return Math.max(13, basePx - 4);
  if (len > 10) return Math.max(14, basePx - 2);
  return basePx;
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
  PG: { pts: 1.0, reb: 0.3, ast: 1.5, stl: 1.3, blk: 0.2 },
  SG: { pts: 1.3, reb: 0.4, ast: 0.8, stl: 1.2, blk: 0.3 },
  SF: { pts: 1.2, reb: 0.8, ast: 0.9, stl: 1.1, blk: 0.6 },
  PF: { pts: 1.1, reb: 1.2, ast: 0.6, stl: 0.8, blk: 1.0 },
  C: { pts: 1.0, reb: 1.5, ast: 0.4, stl: 0.5, blk: 1.5 },
};

const STAT_SHARE = { pts: 0.35, reb: 0.20, ast: 0.20, stl: 0.12, blk: 0.13 };

export function getBaseTeamImpact(players: StrengthInput[]): number {
  let total = 0;
  let counted = 0;
  for (const p of players) {
    const w = IMPACT_WEIGHTS[p.position] ?? IMPACT_WEIGHTS.C!;
    const baseline = POSITION_HEIGHT_BASELINE[p.position] ?? 79;
    const h = Number.isFinite(p.heightIn) ? (p.heightIn as number) : baseline;
    const clamp = (v: number) => Math.max(HEIGHT_FACTOR_MIN, Math.min(HEIGHT_FACTOR_MAX, v));
    const rebF = clamp(1 + HEIGHT_REB_PER_INCH * (h - baseline));
    const blkF = clamp(1 + HEIGHT_BLK_PER_INCH * (h - baseline));
    total += (
      p.stats.pts * w.pts * STAT_SHARE.pts +
      p.stats.reb * w.reb * STAT_SHARE.reb * rebF +
      p.stats.ast * w.ast * STAT_SHARE.ast +
      p.stats.stl * w.stl * STAT_SHARE.stl +
      p.stats.blk * w.blk * STAT_SHARE.blk * blkF
    ) * (p.overall / 100);
    counted++;
  }
  if (counted === 0) return 0;
  return total * (counted / 5);
}

export function calculateTeamStrength(players: StrengthInput[]): number {
  if (players.length === 0) return 0;
  const base = getBaseTeamImpact(players);
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
  return slots.length === 5 && slots.every(s => s.player !== null);
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
