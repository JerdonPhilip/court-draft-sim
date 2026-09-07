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
  stats: { pts: number; reb: number; ast: number; stl: number; blk: number };
}

// Mirrors server getTeamStrength: versatility-aware coverage + weakest-link balance (0..10).
export function calculateTeamStrength(players: StrengthInput[]): number {
  if (players.length === 0) return 0;

  const n = players.length;
  const avgOverall = players.reduce((sum, p) => sum + p.overall, 0) / n;

  const positionCoverage = maxPositionCoverage(players);
  const coverageBonus = positionCoverage === 5 ? 5 : positionCoverage * 0.75;

  const totals = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
  for (const player of players) {
    totals.pts += player.stats.pts;
    totals.reb += player.stats.reb;
    totals.ast += player.stats.ast;
    totals.stl += player.stats.stl;
    totals.blk += player.stats.blk;
  }

  const avgPts = totals.pts / n;
  const avgReb = totals.reb / n;
  const avgAst = totals.ast / n;
  const avgStl = totals.stl / n;
  const avgBlk = totals.blk / n;

  const ptsScore = Math.min(1, avgPts / 18);
  const rebScore = Math.min(1, avgReb / 8);
  const astScore = Math.min(1, avgAst / 5.5);
  const stlScore = Math.min(1, avgStl / 1.2);
  const blkScore = Math.min(1, avgBlk / 1.1);

  const weakest = Math.min(ptsScore, rebScore, astScore, stlScore, blkScore);
  const average = (ptsScore + rebScore + astScore + stlScore + blkScore) / 5;
  const statBalance = weakest * 7 + average * 3;

  return Math.min(100, Math.round(avgOverall + coverageBonus + statBalance));
}

export function getWinProjection(teamStrength: number): number {
  // Mirrors server calculateNonLinearWinCurve: 50 -> 41, 100 -> ~82.
  const clamped = Math.max(0, Math.min(100, teamStrength));
  const x = (clamped - 50) / 50;

  let winPct: number;
  if (x <= 0) {
    winPct = 0.5 + x * 0.48;
  } else {
    winPct = 0.5 + x * 0.55 - x * x * 0.05;
  }

  winPct = Math.max(0.02, Math.min(0.995, winPct));

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

function maxPositionCoverage(players: Array<{ position: string; secondaryPositions?: Position[] }>): number {
  const matchToPlayer = new Map<string, number>();
  const positionsOf = (p: { position: string; secondaryPositions?: Position[] }): string[] => {
    const seen = new Set<string>([p.position]);
    for (const s of p.secondaryPositions ?? []) seen.add(s);
    return [...seen];
  };
  const tryAssign = (idx: number, seen: Set<string>): boolean => {
    for (const slot of positionsOf(players[idx]!)) {
      if (seen.has(slot)) continue;
      seen.add(slot);
      const occupant = matchToPlayer.get(slot);
      if (occupant === undefined || tryAssign(occupant, seen)) {
        matchToPlayer.set(slot, idx);
        return true;
      }
    }
    return false;
  };
  let covered = 0;
  for (let i = 0; i < players.length; i++) {
    if (tryAssign(i, new Set())) covered++;
  }
  return covered;
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
