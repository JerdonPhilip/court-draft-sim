import { formatTeamName } from '../../utils/helpers';
import { FRANCHISES } from '../../data/constants';
import { getPlayerPositions } from '../../types/game';
import type {
  GameResult,
  Player,
  PlayerStats,
  Position,
  SimulatedPlayerStats,
  SimulationResult,
} from '../../types/game';

export interface LeagueRow {
  /** Stable React key: unique even when user + CPU share a historical playerId (old era saves). */
  rowKey: string;
  playerId: string;
  playerName: string;
  team: string;
  isUser: boolean;
  position?: string;
  overall?: number;
  heightIn?: number;
  gp: number;
  mpg: number;
  averages: PlayerStats;
  totals: PlayerStats;
}

/** "Shai Gilgeous-Alexander" -> "S. Gilgeous-Alexander": full identity on one line, no ellipsis. */
export function toCompactName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return fullName;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  return `${(parts[0] ?? '').charAt(0)}. ${parts.slice(1).join(' ')}`;
}

const PLACEHOLDER_PREFIXES = ['Winner ', 'Semifinal Winner', 'East Champion', 'West Champion', 'Playoff Team', 'BYE', 'TBD'];

export function isPlaceholderTeam(team: string): boolean {
  return PLACEHOLDER_PREFIXES.some((p) => team.startsWith(p));
}

/** True for auto-advance slots when a league has fewer than 15 opponents (e.g. 1960s). */
export function isByeTeam(team: string): boolean {
  return team.startsWith('BYE') || team.startsWith('Playoff Team');
}

const ABBREV_BY_NAME = new Map<string, string>();
const ABBREV_BY_ID = new Map<string, string>();
for (const f of FRANCHISES) {
  ABBREV_BY_NAME.set(f.name.toLowerCase(), f.abbreviation);
  ABBREV_BY_ID.set(f.id.toLowerCase(), f.abbreviation);
}
// Schedule-name aliases that don't match the canonical franchise name.
ABBREV_BY_NAME.set('la lakers', 'LAL');
ABBREV_BY_NAME.set('la clippers', 'LAC');
ABBREV_BY_NAME.set('okc thunder', 'OKC');
ABBREV_BY_NAME.set('oklahoma city thunder', 'OKC');

/** Strip a leading era tag ("1990s Chicago Bulls" -> "Chicago Bulls"). */
export function stripEraPrefix(team: string): string {
  return team.replace(/^\d{4}s?\s+/i, '').trim();
}

/** Normalize for cross-source joins (franchise id vs display name vs era name). */
export function normalizeTeamName(team: string | undefined | null): string {
  if (!team) return '';
  return stripEraPrefix(formatTeamName(team)).toLowerCase();
}

/**
 * 2-4 letter bracket abbreviation: YOU / BOS / PHI / GSW…
 * Placeholders become TBD/BYE so the bracket never shows "P7"/"PT1".
 */
export function teamAbbreviation(team: string | undefined | null): string {
  if (!team) return '—';
  const trimmed = team.trim();
  if (!trimmed) return '—';
  if (/^bye\b/i.test(trimmed) || /^playoff team\b/i.test(trimmed)) return 'BYE';
  if (isPlaceholderTeam(trimmed)) return 'TBD';
  if (/^your team$/i.test(trimmed)) return 'YOU';
  const noEra = stripEraPrefix(trimmed);
  const lower = noEra.toLowerCase();
  const direct = ABBREV_BY_NAME.get(lower) ?? ABBREV_BY_ID.get(lower);
  if (direct) return direct;
  // "knicks" etc. may arrive as a bare franchise id inside formatTeamName output.
  const formatted = formatTeamName(trimmed);
  const fLower = stripEraPrefix(formatted).toLowerCase();
  const viaFormat = ABBREV_BY_NAME.get(fLower) ?? ABBREV_BY_ID.get(fLower);
  if (viaFormat) return viaFormat;
  const words = stripEraPrefix(formatted).split(/\s+/).filter(Boolean);
  const alpha = words.filter((w) => /[A-Za-z]/.test(w[0]!));
  if (alpha.length >= 2) {
    // Skip numeric tokens ("76ers") so Philadelphia doesn't become "P7".
    const initials = alpha
      .map((w) => w[0]!.toUpperCase())
      .join('')
      .slice(0, 3);
    if (initials.length >= 2) return initials;
  }
  return stripEraPrefix(formatted).slice(0, 3).toUpperCase();
}

/** Short bracket label — always abbreviated in the playoffs (BOS, PHI, YOU, TBD, BYE). */
export function compactTeamName(team: string): string {
  return teamAbbreviation(team);
}

/** Full display name for tooltips / dialogs (keeps era prefix + proper casing). */
export function fullTeamName(team: string): string {
  if (isPlaceholderTeam(team)) return team;
  if (/^your team$/i.test(team.trim())) return 'Your Team';
  return formatTeamName(stripEraPrefix(team) === team ? team : stripEraPrefix(team)) === '—'
    ? team
    : formatTeamName(team);
}

/** Per-conference seed label: "#3 E" / "#1 W", "—" for placeholders/BYE. */
export function getSeedLabel(teamName: string, eastTeams: string[], westTeams: string[]): string {
  if (isPlaceholderTeam(teamName) || isByeTeam(teamName)) return '—';
  const eastIdx = eastTeams.indexOf(teamName);
  if (eastIdx >= 0) return `#${eastIdx + 1} E`;
  const westIdx = westTeams.indexOf(teamName);
  if (westIdx >= 0) return `#${westIdx + 1} W`;
  return '—';
}

export function buildLeagueRows(result: SimulationResult): LeagueRow[] {
  const rows: LeagueRow[] = [];
  for (const p of result.playerStats) {
    const team = p.team ?? 'Your Team';
    rows.push({
      rowKey: `u:${p.playerId}:${team}`,
      playerId: p.playerId,
      playerName: p.playerName,
      team,
      isUser: true,
      position: p.position,
      overall: p.overall,
      heightIn: (p as { heightIn?: number }).heightIn,
      gp: p.gamesPlayed,
      mpg: p.minutesPerGame ?? 0,
      averages: { ...p.averages },
      totals: { ...p.totals },
    });
  }

  if (result.opponentPlayerStats?.length) {
    for (const p of result.opponentPlayerStats) {
      const team = p.team ?? 'Opponent';
      rows.push({
        rowKey: `o:${p.playerId}:${team}`,
        playerId: p.playerId,
        playerName: p.playerName,
        team,
        isUser: false,
        position: p.position,
        overall: p.overall,
        heightIn: (p as { heightIn?: number }).heightIn,
        gp: p.gamesPlayed,
        mpg: p.minutesPerGame ?? 0,
        averages: { ...p.averages },
        totals: { ...p.totals },
      });
    }
    return rows;
  }

  const agg = new Map<string, LeagueRow & { minTotal: number }>();
  for (const g of result.games) {
    for (const perf of g.opponentPerformances ?? []) {
      // Key by team+id so two eras sharing a historical id can't collapse into one row.
      const key = `${g.opponent}::${perf.playerId}`;
      const existing = agg.get(key);
      if (!existing) {
        agg.set(key, {
          rowKey: `o:${key}`,
          playerId: perf.playerId,
          playerName: perf.playerName,
          team: g.opponent,
          isUser: false,
          position: perf.position,
          overall: perf.overall,
          heightIn: (perf as { heightIn?: number }).heightIn,
          gp: 1,
          mpg: 0,
          averages: { ...perf.stats },
          totals: { ...perf.stats },
          minTotal: perf.minutes ?? 0,
        });
      } else {
        existing.gp += 1;
        existing.totals.pts += perf.stats.pts;
        existing.totals.reb += perf.stats.reb;
        existing.totals.ast += perf.stats.ast;
        existing.totals.stl += perf.stats.stl;
        existing.totals.blk += perf.stats.blk;
        existing.minTotal += perf.minutes ?? 0;
        if (!existing.position && perf.position) existing.position = perf.position;
        if (existing.overall === undefined && perf.overall !== undefined) existing.overall = perf.overall;
        if (!existing.team) existing.team = g.opponent;
      }
    }
  }
  for (const row of agg.values()) {
    const gp = Math.max(1, row.gp);
    rows.push({
      rowKey: row.rowKey,
      playerId: row.playerId,
      playerName: row.playerName,
      team: row.team,
      isUser: false,
      position: row.position,
      overall: row.overall,
      heightIn: row.heightIn,
      gp,
      mpg: Number((row.minTotal / gp).toFixed(1)),
      averages: {
        pts: Number((row.totals.pts / gp).toFixed(1)),
        reb: Number((row.totals.reb / gp).toFixed(1)),
        ast: Number((row.totals.ast / gp).toFixed(1)),
        stl: Number((row.totals.stl / gp).toFixed(1)),
        blk: Number((row.totals.blk / gp).toFixed(1)),
        // Old saves predate foul tracking — treat missing as 0.
        pf: Number(((row.totals.pf ?? 0) / gp).toFixed(1)),
      },
      totals: { ...row.totals },
    });
  }
  return rows;
}

/** Season-average lookup by playerId, built once from league rows (replaces duplicate game-loop aggregation). */
export function buildSeasonAverageById(rows: LeagueRow[]) {
  const m = new Map<string, { averages: PlayerStats; gamesPlayed: number; minutesPerGame?: number }>();
  for (const r of rows) {
    // Team-scoped key always exact (survives user/CPU id collisions on old era saves).
    m.set(`${r.isUser ? 'U' : 'O'}:${r.playerId}:${normalizeTeamName(r.team)}`, {
      averages: r.averages,
      gamesPlayed: r.gp,
      minutesPerGame: r.mpg,
    });
    // Plain-id fallback: first (user) row wins so a CPU clone can't shadow your pick.
    if (!m.has(r.playerId)) {
      m.set(r.playerId, { averages: r.averages, gamesPlayed: r.gp, minutesPerGame: r.mpg });
    }
  }
  return m;
}

/** Prefer the team-scoped season average, fall back to the plain id (old saves). */
export function seasonAverageFor(
  byId: Map<string, { averages: PlayerStats; gamesPlayed: number; minutesPerGame?: number }>,
  playerId: string,
  team?: string,
  isUser?: boolean,
): { averages: PlayerStats; gamesPlayed: number; minutesPerGame?: number } | undefined {
  if (team !== undefined && isUser !== undefined) {
    const scoped = byId.get(`${isUser ? 'U' : 'O'}:${playerId}:${normalizeTeamName(team)}`);
    if (scoped) return scoped;
  }
  return byId.get(playerId);
}

export function awardScore(player: LeagueRow, defensive = false): number {
  if (defensive) {
    return player.averages.stl * 2 + player.averages.blk * 2 + player.averages.reb * 0.35 + (player.overall ?? 75) * 0.05;
  }
  return (
    player.averages.pts +
    player.averages.reb * 0.7 +
    player.averages.ast * 0.7 +
    player.averages.stl * 1.2 +
    player.averages.blk * 1.2 +
    (player.overall ?? 75) * 0.15
  );
}

export function selectTeam(rows: LeagueRow[], defensive = false): LeagueRow[] {
  const selected: LeagueRow[] = [];
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
  const sorted = rows.slice().sort((a, b) => awardScore(b, defensive) - awardScore(a, defensive));
  const taken = (row: LeagueRow) => selected.some((p) => p.rowKey === row.rowKey || p.playerId === row.playerId);
  for (const position of positions) {
    const player = sorted.find((row) => row.position === position && !taken(row));
    if (player) selected.push(player);
  }
  for (const player of sorted) {
    if (selected.length >= 5) break;
    if (!taken(player)) selected.push(player);
  }
  return selected;
}

export function getClutchPlayer(result: SimulationResult, rows: LeagueRow[]): LeagueRow | null {
  const fallback = rows.slice().sort((a, b) => awardScore(b) - awardScore(a))[0] ?? null;
  const closeGames = result.games.filter((game) => Math.abs(game.score.us - game.score.them) <= 5);
  if (closeGames.length === 0) return fallback;

  // Key by team+id: a CPU clone sharing a historical id must not merge with your pick.
  // Track the rowKey so the winner maps back to the correct LeagueRow.
  const totals = new Map<string, { points: number; games: number; rowKey: string; team: string; isUser: boolean }>();
  const keyOf = (team: string, isUser: boolean, id: string) => `${isUser ? 'U' : 'O'}:${id}:${normalizeTeamName(team)}`;
  const userTeamLabel = 'Your Team';
  for (const game of closeGames) {
    for (const performance of game.playerPerformances) {
      const key = keyOf(userTeamLabel, true, performance.playerId);
      const current = totals.get(key) ?? { points: 0, games: 0, rowKey: '', team: userTeamLabel, isUser: true };
      current.points += performance.stats.pts;
      current.games += 1;
      totals.set(key, current);
    }
    for (const performance of game.opponentPerformances ?? []) {
      const key = keyOf(game.opponent, false, performance.playerId);
      const current = totals.get(key) ?? { points: 0, games: 0, rowKey: '', team: game.opponent, isUser: false };
      current.points += performance.stats.pts;
      current.games += 1;
      totals.set(key, current);
    }
  }
  // Minimum-sample guard: a CPU playing 2-3x vs you can't win Clutch off one hot night.
  // Require >=3 close games and >=25% of all close games; your 82-game core always qualifies.
  const minGames = Math.max(3, Math.ceil(closeGames.length * 0.25));
  const byKey = new Map(rows.map((r) => [`${r.isUser ? 'U' : 'O'}:${r.playerId}:${normalizeTeamName(r.team)}`, r]));
  // Backfill rowKeys for hover-independent mapping (older rows built before rowKey existed).
  for (const [key, entry] of totals) {
    const row = byKey.get(key);
    if (row) entry.rowKey = row.rowKey;
  }
  const qualified = rows.filter((row) => {
    const t = totals.get(`${row.isUser ? 'U' : 'O'}:${row.playerId}:${normalizeTeamName(row.team)}`);
    return t !== undefined && t.games >= minGames;
  });
  const pool = qualified.length > 0 ? qualified : rows.filter((row) => totals.has(`${row.isUser ? 'U' : 'O'}:${row.playerId}:${normalizeTeamName(row.team)}`));
  return (
    pool
      .sort((a, b) => {
        const aStats = totals.get(`${a.isUser ? 'U' : 'O'}:${a.playerId}:${normalizeTeamName(a.team)}`)!;
        const bStats = totals.get(`${b.isUser ? 'U' : 'O'}:${b.playerId}:${normalizeTeamName(b.team)}`)!;
        return bStats.points / bStats.games - aStats.points / aStats.games || awardScore(b) - awardScore(a);
      })[0] ?? fallback
  );
}

// ---------------------------------------------------------------------------
// Playoff bracket helpers
// ---------------------------------------------------------------------------

export interface BracketMatchup {
  home: string;
  away: string;
}

const SEED_PAIRINGS = [
  [0, 7],
  [3, 4],
  [1, 6],
  [2, 5],
] as const;

export function makeFirstRound(conference: string[]): BracketMatchup[] {
  const padded = Array.from({ length: 8 }, (_, i) => conference[i] ?? 'BYE');
  return SEED_PAIRINGS.map(([homeSeed, awaySeed]) => ({
    home: padded[homeSeed]!,
    away: padded[awaySeed]!,
  }));
}

/** Every series key in bracket order (R1 → semifinals → conference finals → Finals). */
export function allPlayoffSeriesKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 4; i++) keys.push(`EAST-${i}`, `WEST-${i}`);
  for (const c of ['EAST', 'WEST'] as const) for (let i = 0; i < 2; i++) keys.push(`${c}-semifinal-${i}`);
  keys.push('EAST-conference-final-0', 'WEST-conference-final-0', 'CHAMPIONSHIP');
  return keys;
}

/** Round index for pacing/gating: 0 = first round … 3 = Finals. */
export function playoffSeriesRound(seriesKey: string): number {
  if (seriesKey === 'CHAMPIONSHIP') return 3;
  if (seriesKey.includes('conference-final')) return 2;
  if (seriesKey.includes('semifinal')) return 1;
  return 0;
}

/** Resolve the two participants of any series from decided winners (placeholders while TBD). */
export function getPlayoffParticipants(
  eastFirstRound: BracketMatchup[],
  westFirstRound: BracketMatchup[],
  winners: Record<string, string>,
  seriesKey: string,
): { home: string; away: string } | null {
  if (seriesKey.startsWith('EAST-') && !seriesKey.includes('semifinal') && !seriesKey.includes('conference')) {
    const idx = Number(seriesKey.split('-')[1]);
    const s = eastFirstRound[idx];
    return s ? { home: s.home, away: s.away } : null;
  }
  if (seriesKey.startsWith('WEST-') && !seriesKey.includes('semifinal') && !seriesKey.includes('conference')) {
    const idx = Number(seriesKey.split('-')[1]);
    const s = westFirstRound[idx];
    return s ? { home: s.home, away: s.away } : null;
  }
  if (seriesKey.includes('semifinal')) {
    const conf = seriesKey.startsWith('EAST') ? 'EAST' : 'WEST';
    const idx = Number(seriesKey.split('-').pop());
    const home = winners[`${conf}-${idx * 2}`] ?? `Winner ${idx * 2 + 1}`;
    const away = winners[`${conf}-${idx * 2 + 1}`] ?? `Winner ${idx * 2 + 2}`;
    return { home, away };
  }
  if (seriesKey.includes('conference-final')) {
    const conf = seriesKey.startsWith('EAST') ? 'EAST' : 'WEST';
    const home = winners[`${conf}-semifinal-0`] ?? 'Semifinal Winner 1';
    const away = winners[`${conf}-semifinal-1`] ?? 'Semifinal Winner 2';
    return { home, away };
  }
  if (seriesKey === 'CHAMPIONSHIP') {
    return {
      home: winners['EAST-conference-final-0'] ?? 'East Champion',
      away: winners['WEST-conference-final-0'] ?? 'West Champion',
    };
  }
  return null;
}

export function buildPlayoffTeams(standings: SimulationResult['standings'], userFallback = 'Your Team'): {
  userTeamName: string;
  ranked: string[];
  east: string[];
  west: string[];
} {
  const list = standings ?? [];
  const userTeamName = list.find((t) => t.isUser)?.team ?? userFallback;
  const rankedTeams = list
    .slice()
    .sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff)
    .map((t) => t.team);
  // Balanced conferences: snake the ranked list (1,4,5,8… vs 2,3,6,7…)
  // so neither side hoards the top seeds. Old saves with <16 teams get
  // BYE slots that auto-advance the real team (never a fake champion).
  const ranked = Array.from({ length: 16 }, (_, i) => rankedTeams[i] ?? 'BYE');
  const east: string[] = [];
  const west: string[] = [];
  ranked.forEach((team, i) => {
    const pair = Math.floor(i / 2) % 2 === 0;
    if (i % 2 === 0) (pair ? east : west).push(team);
    else (pair ? west : east).push(team);
  });
  return { userTeamName, ranked, east, west };
}

function teamStrengthLookup(result: SimulationResult): Map<string, { winPct: number; pointDiff: number }> {
  const m = new Map<string, { winPct: number; pointDiff: number }>();
  for (const s of result.standings ?? []) {
    m.set(s.team, { winPct: s.winPct, pointDiff: s.pointDiff });
  }
  return m;
}

/**
 * Strength-based best-of-7 virtualization for non-user series.
 * Uses regular-season win% + point differential with alternating 2-2-1-1-1
 * home court (games 1,2,5,7 host the listed-home/higher seed) and real
 * randomness so resets can produce different brackets. BYE/placeholder
 * matchups auto-advance the real team with no fake games.
 */
export async function simulatePlayoffSeriesWinner(
  result: SimulationResult,
  homeName: string,
  awayName: string,
  onGameStart?: (game: number) => void,
  shouldAbort?: () => boolean,
  gameDelayMs = 250,
): Promise<string> {
  if (isByeTeam(homeName) && isByeTeam(awayName)) return homeName;
  if (isByeTeam(homeName)) return awayName;
  if (isByeTeam(awayName)) return homeName;
  if (isPlaceholderTeam(homeName) && isPlaceholderTeam(awayName)) return homeName;
  if (isPlaceholderTeam(homeName)) return awayName;
  if (isPlaceholderTeam(awayName)) return homeName;

  const lookup = teamStrengthLookup(result);
  const home = lookup.get(homeName);
  const away = lookup.get(awayName);
  // Base 50/50 from win% gap + per-game point-diff gap; home edge applied per game below.
  const winPctGap = (home?.winPct ?? 0.5) - (away?.winPct ?? 0.5);
  const diffGap = ((home?.pointDiff ?? 0) - (away?.pointDiff ?? 0)) / 82;
  const baseProb = Math.min(0.74, Math.max(0.26, 0.5 + winPctGap * 0.9 + diffGap * 0.02));
  const HOME_EDGE = 0.04;
  // Higher seed hosts 1,2,5,7 — the listed-home team keeps a small edge overall.
  const homeHosts = (game: number) => game === 1 || game === 2 || game === 5 || game === 7;

  let homeWins = 0;
  let awayWins = 0;
  for (let game = 1; game <= 7; game++) {
    if (shouldAbort?.()) break;
    onGameStart?.(game);
    // Deliberate beat per game so background series read as live, not instant.
    await new Promise((resolve) => setTimeout(resolve, gameDelayMs));
    if (shouldAbort?.()) break;
    const prob = Math.min(0.78, Math.max(0.22, baseProb + (homeHosts(game) ? HOME_EDGE : -HOME_EDGE)));
    if (Math.random() < prob) homeWins++;
    else awayWins++;
    if (homeWins >= 4 || awayWins >= 4) break;
  }
  if (homeWins === awayWins) return baseProb >= 0.5 ? homeName : awayName;
  return homeWins > awayWins ? homeName : awayName;
}

export const PLAYOFF_POSITIONS: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

const POSITION_HEIGHT_BASELINE: Record<string, number> = {
  PG: 75,
  SG: 77,
  SF: 79,
  PF: 81,
  C: 83,
};

function heightFor(slot: Position, explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  return POSITION_HEIGHT_BASELINE[slot] ?? 79;
}

export function buildUserPlayoffLineup(
  result: SimulationResult,
  userTeamName: string,
): Player[] {
  // Full 10-man rotation (starters first 5, bench last 5) with real positions.
  // Legacy 5-man saves still work (slice caps at available length).
  return result.playerStats.slice(0, 10).map((player, index) => {
    const fallback: Position = PLAYOFF_POSITIONS[index % 5]!;
    const explicitHeight = (player as { heightIn?: number }).heightIn;
    return {
      id: player.playerId,
      name: player.playerName,
      position: player.position ?? fallback,
      secondaryPositions: player.secondaryPositions,
      // Keep the real size edge — baseline only when the save predates height tracking.
      heightIn: heightFor(player.position ?? fallback, explicitHeight),
      team: userTeamName,
      decade: 'modern',
      era: 'modern',
      stats: player.baseStats ?? player.averages,
      overall: player.overall ?? 78,
      archetype: 'Playoff rotation',
    };
  });
}

/** Bipartite coverage check counting versatility (mirrors server validation). */
function playoffFiveCoversAll(lineup: Array<{ position: Position; secondaryPositions?: Position[] }>): boolean {
  const slots: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
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
  return slots.every((s) => match.has(s));
}

interface PlayoffCandidate {
  id: string;
  name: string;
  stats: PlayerStats;
  overall?: number;
  position: Position;
  secondaryPositions?: Position[];
  heightIn?: number;
}

/** Highest-talent covering five (by overall, then scoring). Null when no combo covers. */
function bestCoveringPlayoffFive(candidates: PlayoffCandidate[]): PlayoffCandidate[] | null {
  if (candidates.length < 5) return null;
  const score = (c: PlayoffCandidate) => (c.overall ?? 75) * 2 + c.stats.pts;
  let best: PlayoffCandidate[] | null = null;
  let bestScore = -Infinity;
  const idx = [0, 1, 2, 3, 4];
  const n = candidates.length;
  for (;;) {
    const five = idx.map((i) => candidates[i]!);
    if (playoffFiveCoversAll(five)) {
      const s = five.reduce((t, c) => t + score(c), 0);
      if (s > bestScore) {
        bestScore = s;
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

/** Best covering 10-man rotation (starters + bench) from candidates. */
function bestCoveringPlayoffTen(candidates: PlayoffCandidate[]): PlayoffCandidate[] | null {
  const n = candidates.length;
  if (n < 10) return null;
  const score = (c: PlayoffCandidate) => (c.overall ?? 75) * 2 + c.stats.pts;
  let best: PlayoffCandidate[] | null = null;
  let bestScore = -Infinity;
  const idx = [0, 1, 2, 3, 4];
  for (;;) {
    const starters = idx.map((i) => candidates[i]!);
    if (playoffFiveCoversAll(starters)) {
      const rest = candidates.filter((_, i) => !idx.includes(i));
      const bench = bestCoveringPlayoffFive(rest);
      if (bench) {
        const s = starters.reduce((t, c) => t + score(c), 0) + bench.reduce((t, c) => t + score(c), 0) * 0.4;
        if (s > bestScore) {
          bestScore = s;
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

/**
 * Opponent-specific 10-man rotation (starters + bench): prefer that opponent's
 * own season-long stats, then that opponent's box scores from games vs you,
 * then a generic fallback.
 * Team matching is era/normalization-tolerant ("bulls" == "1990s Chicago Bulls").
 * Never returns the first 10 league-wide players for the wrong team.
 */
export function buildOpponentPlayoffRoster(result: SimulationResult, opponentName: string): Player[] {
  const want = normalizeTeamName(opponentName);
  const byTeam = (result.opponentPlayerStats ?? []).filter((p) => normalizeTeamName(p.team) === want);
  const toCandidate = (p: {
    playerId: string;
    playerName: string;
    averages: PlayerStats;
    baseStats?: PlayerStats;
    overall?: number;
    position?: Position;
    secondaryPositions?: Position[];
    heightIn?: number;
  }): PlayoffCandidate | null => {
    const slotFallback = PLAYOFF_POSITIONS[0]!;
    return {
      id: p.playerId,
      name: p.playerName,
      stats: p.baseStats ?? p.averages,
      overall: p.overall,
      position: p.position ?? slotFallback,
      secondaryPositions: p.secondaryPositions,
      heightIn: p.heightIn,
    };
  };

  let pool: PlayoffCandidate[] = [];
  if (byTeam.length > 0) {
    const candidates = byTeam.map((p) => toCandidate(p)!).filter(Boolean);
    const covering = candidates.length >= 10
      ? bestCoveringPlayoffTen(candidates)
      : bestCoveringPlayoffFive(candidates);
    if (covering) {
      pool = covering;
    } else {
      // Degenerate (old save missing versatility): top talent, slots forced below.
      pool = byTeam
        .slice()
        .sort((a, b) => (b.overall ?? 75) - (a.overall ?? 75) || b.averages.pts - a.averages.pts)
        .slice(0, 10)
        .map((p) => toCandidate(p)!)
        .filter(Boolean);
    }
  } else {
    const game =
      result.games.find((c) => normalizeTeamName(c.opponent) === want && (c.opponentPerformances?.length ?? 0) > 0) ??
      result.games.find((c) => (c.opponentPerformances?.length ?? 0) > 0);
    const perfs = game?.opponentPerformances?.slice(0, 10) ?? [];
    const candidates = perfs.map((perf) =>
      toCandidate({
        playerId: perf.playerId,
        playerName: perf.playerName,
        averages: perf.stats,
        baseStats: perf.baseStats,
        overall: perf.overall,
        position: perf.position,
        secondaryPositions: perf.secondaryPositions,
        heightIn: perf.heightIn,
      })!,
    );
    const covering = candidates.length >= 10
      ? bestCoveringPlayoffTen(candidates)
      : bestCoveringPlayoffFive(candidates);
    pool = covering ?? perfs.map((perf, i) => ({
      id: perf.playerId,
      name: perf.playerName,
      stats: perf.baseStats ?? perf.stats,
      overall: perf.overall,
      position: perf.position ?? PLAYOFF_POSITIONS[i % 5]!,
      secondaryPositions: perf.secondaryPositions,
      heightIn: perf.heightIn,
    }));
  }

  const generic = (result.opponentPlayerStats ?? [])
    .filter((p) => normalizeTeamName(p.team) !== want)
    .slice()
    .sort((a, b) => b.averages.pts - a.averages.pts);
  let genericIdx = 0;
  while (pool.length < 10 && genericIdx < generic.length) {
    const g = generic[genericIdx++]!;
    if (pool.some((p) => p.id === g.playerId)) continue;
    const c = toCandidate(g);
    if (c) pool.push(c);
  }

  // Final guard: versatility data missing (old saves) → force slot positions
  // so the league's coverage validation always passes.
  const starters = pool.slice(0, 5);
  const bench = pool.slice(5, 10);
  const covers = pool.length === 10 && playoffFiveCoversAll(starters) && playoffFiveCoversAll(bench);
  return Array.from({ length: 10 }, (_, index) => {
    const slot = PLAYOFF_POSITIONS[index % 5]!;
    const p = pool[index];
    return {
      id: p?.id ?? `playoff-${opponentName}-${index}`,
      name: p?.name ?? `${opponentName} Player ${index + 1}`,
      position: covers ? (p?.position ?? slot) : slot,
      secondaryPositions: covers ? p?.secondaryPositions : undefined,
      heightIn: heightFor(p?.position ?? slot, p?.heightIn),
      team: opponentName,
      decade: 'modern',
      era: 'modern',
      stats: p?.stats ?? { pts: 10, reb: 5, ast: 3, stl: 1, blk: 1 },
      overall: p?.overall ?? 78,
      archetype: 'Playoff rotation',
    };
  });
}

export function getStreak(games: GameResult[]): { count: number; type: 'W' | 'L' } {
  if (games.length === 0) return { count: 0, type: 'W' };
  const last = games[games.length - 1]!.result;
  let count = 0;
  for (let i = games.length - 1; i >= 0; i--) {
    if (games[i]!.result === last) count++;
    else break;
  }
  return { count, type: last };
}

export function teamAvgForDisplay(playerStats: SimulatedPlayerStats[]): PlayerStats {
  if (playerStats.length === 0) return { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, pf: 0 };
  const sum = (k: keyof PlayerStats) => playerStats.reduce((t, p) => t + p.averages[k], 0);
  const n = playerStats.length;
  return {
    pts: sum('pts') / n,
    reb: sum('reb') / n,
    ast: sum('ast') / n,
    stl: sum('stl') / n,
    blk: sum('blk') / n,
    pf: sum('pf') / n,
  };
}
