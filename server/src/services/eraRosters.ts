import { getPlayersByFranchiseAndDecade } from '../data/players.js';
import { FRANCHISES, DECADES } from '../data/constants.js';
import { getPlayerPositions, Player, Position } from '../types/game.js';
import { getBaseTeamImpact } from './simulationEngine.js';

export interface EraOpponent {
  /** Display name, e.g. "1990s Chicago Bulls". */
  name: string;
  franchise: string;
  franchiseName: string;
  decade: string;
  lineup: Player[];
  avgOverall: number;
  baseImpact: number;
}

export interface EraLeague {
  decade: string;
  label: string;
  era: string;
  range: string;
  teamCount: number;
  avgOverall: number;
  avgImpact: number;
  opponents: EraOpponent[];
}

const SLOTS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** Best-5 lineup (by overall) out of a pool that covers all 5 slots. */
function bestCoveringFive(pool: Player[]): Player[] | null {
  let best: Player[] | null = null;
  let bestScore = -Infinity;
  const n = pool.length;
  // C(n,5) is tiny (max C(8,5)=56); exhaustive search is cheapest to verify.
  const idx = [0, 1, 2, 3, 4];
  const total = (lineup: Player[]) => lineup.reduce((s, p) => s + p.overall, 0);
  const combo = (): Player[] => idx.map(i => pool[i]!);
  for (;;) {
    const five = combo();
    if (coversAll(five)) {
      const score = total(five);
      if (score > bestScore) {
        bestScore = score;
        best = [...five];
      }
    }
    let p = 4;
    while (p >= 0 && idx[p] === n - 5 + p) p--;
    if (p < 0) break;
    idx[p]++;
    for (let q = p + 1; q < 5; q++) idx[q] = idx[q - 1] + 1;
  }
  return best;
}

function coversAll(lineup: Player[]): boolean {
  const match = new Map<Position, number>();
  const assign = (playerIdx: number, seen: Set<Position>): boolean => {
    for (const slot of getPlayerPositions(lineup[playerIdx]!)) {
      if (seen.has(slot)) continue;
      seen.add(slot);
      const occupant = match.get(slot);
      if (occupant === undefined || assign(occupant, seen)) {
        match.set(slot, playerIdx);
        return true;
      }
    }
    return false;
  };
  for (let i = 0; i < lineup.length; i++) {
    if (!assign(i, new Set())) return false;
  }
  return SLOTS.every(s => match.has(s));
}

/**
 * Build one 5-man lineup per franchise present in the decade, strongest
 * available five that still covers every position. Franchises that can't
 * field a legal five are skipped (verified: none currently exist).
 */
export function getEraLeague(decadeId: string): EraLeague | null {
  const decade = DECADES.find(d => d.id === decadeId);
  if (!decade) return null;

  const opponents: EraOpponent[] = [];
  for (const franchise of FRANCHISES) {
    const pool = getPlayersByFranchiseAndDecade(franchise.id, decadeId);
    if (pool.length < 5) continue;
    const lineup = bestCoveringFive(pool);
    if (!lineup) continue;
    opponents.push({
      name: `${decade.label} ${franchise.name}`,
      franchise: franchise.id,
      franchiseName: franchise.name,
      decade: decadeId,
      lineup,
      avgOverall: lineup.reduce((s, p) => s + p.overall, 0) / lineup.length,
      baseImpact: getBaseTeamImpact(lineup),
    });
  }

  if (opponents.length === 0) return null;

  // Strongest first so schedule rotation meets contenders regularly.
  opponents.sort((a, b) => b.baseImpact - a.baseImpact);

  return {
    decade: decadeId,
    label: decade.label,
    era: decade.era,
    range: decade.range,
    teamCount: opponents.length,
    avgOverall: opponents.reduce((s, o) => s + o.avgOverall, 0) / opponents.length,
    avgImpact: opponents.reduce((s, o) => s + o.baseImpact, 0) / opponents.length,
    opponents,
  };
}

export function getAllEraLeagues(): Array<Omit<EraLeague, 'opponents'>> {
  const leagues: Array<Omit<EraLeague, 'opponents'>> = [];
  for (const decade of DECADES) {
    const league = getEraLeague(decade.id);
    if (!league) continue;
    const { opponents: _drop, ...summary } = league;
    leagues.push(summary);
  }
  return leagues;
}
