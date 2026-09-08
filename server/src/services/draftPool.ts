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

  const players = getRandomPlayersByFranchiseAndDecade(pick.franchise, pick.decade, 10);

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
    players: [...players],
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

  const players = getRandomPlayersByFranchiseAndDecade(franchise.id, decade.id, 10);

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

function poolCoversNeed(franchiseId: string, decadeId: string, neededPositions?: Position[]): boolean {
  if (!isValidCombo(franchiseId, decadeId)) return false;
  if (!neededPositions || neededPositions.length === 0) return true;
  return getPlayersByFranchiseAndDecade(franchiseId, decadeId)
    .some(p => neededPositions.some(need => canPlayPosition(p, need)));
}

/**
 * Reroll exactly one axis of the current pool, keeping the other fixed.
 * Candidates are restricted to combos that actually exist (MIN_POOL_SIZE),
 * so e.g. keeping 2020s can never land on the SuperSonics, and keeping
 * Seattle can never land on the 2020s. Returns null when there is no
 * alternative (caller should surface an error, not consume the reroll).
 */
export function rerollDraftPool(
  keep: 'franchise' | 'decade',
  franchiseId: string,
  decadeId: string,
  neededPositions?: Position[]
): DraftPool | null {
  if (keep === 'decade') {
    const decade = DECADES.find(d => d.id === decadeId);
    if (!decade) return null;
    // Prefer candidates that also cover an open slot; fall back to any
    // valid combo in the kept decade so the reroll never dead-ends.
    const covering = FRANCHISES.filter(
      f => f.id !== franchiseId && poolCoversNeed(f.id, decadeId, neededPositions)
    );
    const pool = covering.length > 0
      ? covering
      : FRANCHISES.filter(f => f.id !== franchiseId && isValidCombo(f.id, decadeId));
    if (pool.length === 0) return null;
    const franchise = pool[randomIndex(pool.length)]!;
    const players = getRandomPlayersByFranchiseAndDecade(franchise.id, decadeId, 10);
    return { franchise: franchise.id, decade: decadeId, players };
  }

  const franchise = FRANCHISES.find(f => f.id === franchiseId);
  if (!franchise) return null;
  const covering = DECADES.filter(
    d => d.id !== decadeId && poolCoversNeed(franchiseId, d.id, neededPositions)
  );
  const pool = covering.length > 0
    ? covering
    : DECADES.filter(d => d.id !== decadeId && isValidCombo(franchiseId, d.id));
  if (pool.length === 0) return null;
  const decade = pool[randomIndex(pool.length)]!;
  const players = getRandomPlayersByFranchiseAndDecade(franchiseId, decade.id, 10);
  return { franchise: franchiseId, decade: decade.id, players };
}
