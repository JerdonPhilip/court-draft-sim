import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number, decimals: number = 1): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(decimals) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(decimals) + 'K';
  }
  return num.toFixed(decimals);
}

export function getPositionColor(position: string): string {
  const colors: Record<string, string> = {
    PG: '#00d4aa',
    SG: '#ffd700',
    SF: '#ff6b6b',
    PF: '#7c5cff',
    C: '#007aff',
  };
  return colors[position] || '#8fabbf';
}

export function getPositionIcon(position: string): string {
  const icons: Record<string, string> = {
    PG: '🎯',
    SG: '🏀',
    SF: '⚡',
    PF: '💪',
    C: '🛡️',
  };
  return icons[position] || '👤';
}

export function calculateTeamStrength(players: Array<{ overall: number; position: string; stats: Record<string, number> }>): number {
  if (players.length === 0) return 0;

  const avgOverall = players.reduce((sum, p) => sum + p.overall, 0) / players.length;

  const positionCoverage = new Set(players.map(p => p.position)).size;
  const coverageBonus = positionCoverage === 5 ? 5 : positionCoverage * 1.5;

  const totals = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
  for (const player of players) {
    totals.pts += player.stats.pts;
    totals.reb += player.stats.reb;
    totals.ast += player.stats.ast;
    totals.stl += player.stats.stl;
    totals.blk += player.stats.blk;
  }

  const avgPts = totals.pts / 5;
  const avgReb = totals.reb / 5;
  const avgAst = totals.ast / 5;
  const avgStl = totals.stl / 5;
  const avgBlk = totals.blk / 5;

  const ptsScore = Math.min(10, avgPts / 2.5);
  const rebScore = Math.min(8, avgReb / 1.2);
  const astScore = Math.min(8, avgAst / 1.5);
  const stlScore = Math.min(5, avgStl / 0.3);
  const blkScore = Math.min(5, avgBlk / 0.4);

  const statBalance = ptsScore + rebScore + astScore + stlScore + blkScore;

  return Math.min(100, Math.round(avgOverall + coverageBonus + statBalance));
}

export function getWinProjection(teamStrength: number): number {
  const strengthNormalized = (teamStrength - 50) / 50;

  let winPct: number;
  if (strengthNormalized <= 0) {
    winPct = 0.5 + strengthNormalized * 0.4;
  } else {
    winPct = 0.5 + strengthNormalized * 0.3 - Math.pow(strengthNormalized, 2) * 0.15;
  }

  winPct = Math.max(0.05, Math.min(0.98, winPct));

  return Math.round(winPct * 82);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}