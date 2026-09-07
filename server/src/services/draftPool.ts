import { DraftPool, Position } from '../types/game.js';
import { FRANCHISES, DECADES } from '../data/constants.js';
import { getRandomPlayersByFranchiseAndDecade, getPlayersByFranchiseAndDecade } from '../data/players.js';
import { canPlayPosition } from '../types/game.js';
import { randomInt } from 'node:crypto';

export const MIN_POOL_SIZE = 3;

function randomIndex(length: number): number {
  if (length <= 0) return 0;
  return randomInt(length);
}

function isValidCombo(franchiseId: string, decadeId: string): boolean {
  return getPlayersByFranchiseAndDecade(franchiseId, decadeId).length >= MIN_POOL_SIZE;
}

export function generateDraftPool(): DraftPool {
  // Only return combos with enough players.
  const validCombos: Array<{ franchise: string; decade: string }> = [];
  for (const f of FRANCHISES) {
    for (const d of DECADES) {
      if (isValidCombo(f.id, d.id)) validCombos.push({ franchise: f.id, decade: d.id });
    }
  }
  const pick = validCombos.length > 0
    ? validCombos[randomIndex(validCombos.length)]!
    : { franchise: FRANCHISES[0]!.id, decade: DECADES[0]!.id };

  const players = getRandomPlayersByFranchiseAndDecade(pick.franchise, pick.decade, 6);

  return {
    franchise: pick.franchise,
    decade: pick.decade,
    players,
  };
}

export function getDraftPool(franchiseId: string, decadeId: string): DraftPool | null {
  const players = getPlayersByFranchiseAndDecade(franchiseId, decadeId);
  if (players.length < MIN_POOL_SIZE) return null;
  return {
    franchise: franchiseId,
    decade: decadeId,
    players: [...players].slice(0, 8),
  };
}

export function generateAllDraftPools(): DraftPool[] {
  const pools: DraftPool[] = [];

  for (const franchise of FRANCHISES) {
    for (const decade of DECADES) {
      const pool = getDraftPool(franchise.id, decade.id);
      if (pool) pools.push(pool);
    }
  }

  return pools;
}

export function getFranchiseInfo(franchiseId: string) {
  return FRANCHISES.find(f => f.id === franchiseId);
}

export function getDecadeInfo(decadeId: string) {
  return DECADES.find(d => d.id === decadeId);
}

function getAvailableFranchiseAndDecade(
  excludeFranchise?: string,
  excludeDecade?: string,
  neededPositions?: Position[]
): { franchise: (typeof FRANCHISES)[number]; decade: (typeof DECADES)[number] } {
  const availableFranchises = excludeFranchise
    ? FRANCHISES.filter(f => f.id !== excludeFranchise)
    : [...FRANCHISES];
  const availableDecades = excludeDecade
    ? DECADES.filter(d => d.id !== excludeDecade)
    : [...DECADES];

  const poolCoversNeed = (franchiseId: string, decadeId: string): boolean => {
    if (!isValidCombo(franchiseId, decadeId)) return false;
    if (!neededPositions || neededPositions.length === 0) return true;
    const players = getPlayersByFranchiseAndDecade(franchiseId, decadeId);
    return neededPositions.some(need => players.some(p => canPlayPosition(p, need)));
  };

  const candidates: Array<{ franchise: (typeof FRANCHISES)[number]; decade: (typeof DECADES)[number] }> = [];
  for (const franchise of availableFranchises) {
    for (const decade of availableDecades) {
      if (poolCoversNeed(franchise.id, decade.id)) {
        candidates.push({ franchise, decade });
      }
    }
  }

  if (candidates.length > 0) {
    return candidates[randomIndex(candidates.length)]!;
  }

  // Needed positions couldn't be satisfied within exclusions: retry ignoring
  // exclusions before falling back to anything valid (never dead-end the draft).
  if (neededPositions && neededPositions.length > 0 && (excludeFranchise || excludeDecade)) {
    return getAvailableFranchiseAndDecade(undefined, undefined, neededPositions);
  }

  // Fallback honoring nothing but validity: any combo with enough players.
  for (const franchise of FRANCHISES) {
    for (const decade of DECADES) {
      if (isValidCombo(franchise.id, decade.id)) {
        return { franchise, decade };
      }
    }
  }

  return { franchise: FRANCHISES[0]!, decade: DECADES[0]! };
}

export function spinForDraftPool(excludeFranchise?: string, excludeDecade?: string, neededPositions?: Position[]): DraftPool {
  const { franchise, decade } = getAvailableFranchiseAndDecade(excludeFranchise, excludeDecade, neededPositions);

  const players = getRandomPlayersByFranchiseAndDecade(franchise.id, decade.id, 6);

  // Best-effort: if the random 6 still miss every needed slot (small pools),
  // swap one card for an eligible player so the spin is never unusable.
  if (neededPositions && neededPositions.length > 0 && players.length > 0) {
    const covers = players.some(p => neededPositions.some(need => canPlayPosition(p, need)));
    if (!covers) {
      const eligible = getPlayersByFranchiseAndDecade(franchise.id, decade.id)
        .filter(p => neededPositions.some(need => canPlayPosition(p, need)));
      if (eligible.length > 0 && players.length > 0) {
        players[players.length - 1] = eligible[randomIndex(eligible.length)]!;
      }
    }
  }

  return {
    franchise: franchise.id,
    decade: decade.id,
    players,
  };
}
