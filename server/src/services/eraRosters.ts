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
  if (n < 5) return null;
  // C(n,5) is tiny (max C(10,5)=252); exhaustive search is cheapest to verify.
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

/**
 * Best covering 10-man rotation (starters + bench) out of a pool:
 * tries every C(n,5) starters split and pairs it with the best covering
 * five from the remainder, maximizing starters + 0.4 * bench (mirrors the
 * rotation weighting). Falls back to best-five + next-best-five.
 */
function bestCoveringTen(pool: Player[]): Player[] | null {
  const n = pool.length;
  if (n < 10) return null;
  let best: Player[] | null = null;
  let bestScore = -Infinity;
  const idx = [0, 1, 2, 3, 4];
  for (;;) {
    const starters = idx.map(i => pool[i]!);
    if (coversAll(starters)) {
      const rest = pool.filter((_, i) => !idx.includes(i));
      const bench = bestCoveringFive(rest);
      if (bench) {
        const score = starters.reduce((s, p) => s + p.overall, 0)
          + bench.reduce((s, p) => s + p.overall, 0) * 0.4;
        if (score > bestScore) {
          bestScore = score;
          best = [...starters, ...bench];
        }
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
 * Build one 10-man rotation per franchise present in the decade (starters +
 * bench). Prefers a ten covering every position in both units; falls back to
 * covering starters + next-best bench for imbalanced pools.
 */
export function getEraLeague(decadeId: string): EraLeague | null {
  const decade = DECADES.find(d => d.id === decadeId);
  if (!decade) return null;

  const opponents: EraOpponent[] = [];
  for (const franchise of FRANCHISES) {
    const pool = getPlayersByFranchiseAndDecade(franchise.id, decadeId);
    if (pool.length < 10) continue;
    let best = bestCoveringTen(pool);
    if (!best) {
      // Imbalanced pool (e.g. a single true SF): starters cover, bench is
      // next-best-five. The sim's slot assignment + flex penalties absorb it.
      const starters = bestCoveringFive(pool);
      if (!starters) continue;
      const starterIds = new Set(starters.map(p => p.id));
      const bench = pool
        .filter(p => !starterIds.has(p.id))
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 5);
      if (bench.length < 5) continue;
      best = [...starters, ...bench];
    }
    // Namespace ids + display team: the same historical player can be both
    // your draft pick (original id) and a CPU opponent. Without namespacing,
    // client joins by playerId collapse the two into one row / wrong hover.
    const displayName = `${decade.label} ${franchise.name}`;
    const lineup = best.map((p) => ({
      ...p,
      id: `${p.id}--${decadeId}-${franchise.id}`,
      team: displayName,
    }));
    opponents.push({
      name: displayName,
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { opponents: _drop, ...summary } = league;
    void _drop;
    leagues.push(summary);
  }
  return leagues;
}
