import { Player, Position } from '../types/game.js';
import { secureRandom } from './random.js';

/** Display schedule names for the synthetic mixed modern league. */
export const OPPONENT_NAMES = [
  'Chicago Bulls', 'Boston Celtics', 'LA Lakers', 'Miami Heat', 'Dallas Mavericks',
  'Phoenix Suns', 'Denver Nuggets', 'Milwaukee Bucks', 'Philadelphia 76ers', 'New York Knicks',
  'Golden State Warriors', 'San Antonio Spurs', 'Houston Rockets', 'OKC Thunder', 'Utah Jazz',
  'Portland Trail Blazers', 'Sacramento Kings', 'Atlanta Hawks', 'Toronto Raptors', 'Detroit Pistons',
  'Cleveland Cavaliers', 'Indiana Pacers', 'Orlando Magic', 'Brooklyn Nets', 'LA Clippers',
  'Memphis Grizzlies', 'New Orleans Pelicans', 'Minnesota Timberwolves', 'Charlotte Hornets', 'Washington Wizards',
];

function randomStat(min: number, max: number): number {
  return min + secureRandom() * (max - min);
}

/** Exported for calibration scripts (recompute LEAGUE_AVG_IMPACT if the model changes). */
export function generateOpponentPools(): { pools: Player[][]; names: string[] } {
  const pools: Player[][] = [];

  // 30 distinct 10-man opponents (300 unique players, starters + bench).
  // A top-heavy league like the real NBA: 24 regular starter-quality
  // pools plus 6 contender pools that can actually beat elite user teams,
  // so 82-0 stays possible but never automatic.
  // Mean base impact ~= LEAGUE_AVG_IMPACT (services/constants.ts), measured
  // empirically over generated pools (10-man impacts normalize to the 5-man
  // scale, so the reference still holds). Keep them in sync if these ranges change.
  // Heights sit near positional averages so size is neutral for the league.
  const HEIGHT_RANGE: Record<Position, [number, number]> = {
    PG: [71, 75],
    SG: [74, 78],
    SF: [77, 81],
    PF: [79, 83],
    C: [81, 87],
  };
  const makePlayer = (i: number, j: number, pos: Position, overall: number, span: number, floor: number, contender: boolean): Player => {
    const star = (overall - floor) / span; // 0..1
    return {
      id: `opp-${i}-${j}`,
      name: `${OPPONENT_NAMES[i]} Player ${j + 1}`,
      position: pos,
      heightIn: Math.round(randomStat(HEIGHT_RANGE[pos][0], HEIGHT_RANGE[pos][1])),
      // Display schedule name (not a generic tag) so standings, bracket,
      // awards and playoff rosters can join on team.
      team: OPPONENT_NAMES[i]!,
      decade: '2020s',
      era: 'Current',
      stats: contender
        ? {
            pts: randomStat(18 + star * 6, 22 + star * 6),
            reb: randomStat(5 + star * 2, 8 + star * 3),
            ast: randomStat(4 + star * 2, 6 + star * 3),
            stl: randomStat(0.8, 1.2 + star * 0.8),
            blk: randomStat(0.4, 0.8 + star * 0.8),
            pf: 0, // cards carry no fouls; per-game fouls generate live
          }
        : {
            pts: randomStat(12 + star * 6, 16 + star * 6),
            reb: randomStat(4 + star * 2, 7 + star * 3),
            ast: randomStat(3 + star * 2, 5 + star * 3),
            stl: randomStat(0.6, 1.0 + star * 0.8),
            blk: randomStat(0.3, 0.6 + star * 0.8),
            pf: 0,
          },
      overall,
      archetype: contender ? 'Star' : 'Role Player',
    };
  };
  for (let i = 0; i < 30; i++) {
    const pool: Player[] = [];
    const contender = i % 5 === 4;
    // Starters (first 5): same quality as before.
    for (let j = 0; j < 5; j++) {
      const pos = (['PG', 'SG', 'SF', 'PF', 'C'] as Position[])[j]!;
      const overall = Math.round(contender ? randomStat(88, 96) : randomStat(74, 88));
      const span = contender ? 8 : 14;
      const floor = contender ? 88 : 74;
      pool.push(makePlayer(i, j, pos, overall, span, floor, contender));
    }
    // Bench (last 5): a clear step below the starters.
    for (let j = 5; j < 10; j++) {
      const pos = (['PG', 'SG', 'SF', 'PF', 'C'] as Position[])[j - 5]!;
      const overall = Math.round(contender ? randomStat(80, 88) : randomStat(68, 80));
      const span = contender ? 8 : 12;
      const floor = contender ? 80 : 68;
      const bench = makePlayer(i, j, pos, overall, span, floor, false);
      bench.archetype = 'Bench';
      pool.push(bench);
    }
    pools.push(pool);
  }

  return { pools, names: [...OPPONENT_NAMES] };
}
