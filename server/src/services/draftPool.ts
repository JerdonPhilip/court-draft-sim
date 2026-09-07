import { DraftPool, Player } from '../types/game';
import { FRANCHISES, DECADES } from '../data/constants';
import { getRandomPlayersByFranchiseAndDecade, getPlayersByFranchiseAndDecade } from '../data/players';

export function generateDraftPool(): DraftPool {
  const franchise = FRANCHISES[Math.floor(Math.random() * FRANCHISES.length)];
  const decade = DECADES[Math.floor(Math.random() * DECADES.length)];

  const players = getRandomPlayersByFranchiseAndDecade(franchise.id, decade.id, 6);

  return {
    franchise: franchise.id,
    decade: decade.id,
    players,
  };
}

export function generateAllDraftPools(): DraftPool[] {
  const pools: DraftPool[] = [];

  for (const franchise of FRANCHISES) {
    for (const decade of DECADES) {
      const players = getPlayersByFranchiseAndDecade(franchise.id, decade.id);
      if (players.length >= 3) {
        pools.push({
          franchise: franchise.id,
          decade: decade.id,
          players: players.slice(0, 8),
        });
      }
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
  excludeDecade?: string
): { franchise: (typeof FRANCHISES)[0]; decade: (typeof DECADES)[0] } {
  const availableFranchises = excludeFranchise
    ? FRANCHISES.filter(f => f.id !== excludeFranchise)
    : FRANCHISES;
  const availableDecades = excludeDecade
    ? DECADES.filter(d => d.id !== excludeDecade)
    : DECADES;

  const maxAttempts = availableFranchises.length * availableDecades.length;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const franchise = availableFranchises[Math.floor(Math.random() * availableFranchises.length)];
    const decade = availableDecades[Math.floor(Math.random() * availableDecades.length)];
    const players = getPlayersByFranchiseAndDecade(franchise.id, decade.id);
    if (players.length >= 3) {
      return { franchise, decade };
    }
  }

  // Fallback: return any available combo with enough players
  for (const franchise of FRANCHISES) {
    for (const decade of DECADES) {
      const players = getPlayersByFranchiseAndDecade(franchise.id, decade.id);
      if (players.length >= 3) {
        return { franchise, decade };
      }
    }
  }

  return { franchise: FRANCHISES[0], decade: DECADES[0] };
}

export function spinForDraftPool(excludeFranchise?: string, excludeDecade?: string): DraftPool {
  const { franchise, decade } = getAvailableFranchiseAndDecade(excludeFranchise, excludeDecade);

  const players = getRandomPlayersByFranchiseAndDecade(franchise.id, decade.id, 6);

  return {
    franchise: franchise.id,
    decade: decade.id,
    players,
  };
}