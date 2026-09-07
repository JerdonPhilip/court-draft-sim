import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, X, Trophy, TrendingUp, TrendingDown, Target, Calendar, BarChart2, Users, Search, ListOrdered } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { otLabel, formatTeamName } from '../../utils/helpers';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import type { SimulationResult, PlayerStats, GameResult, PlayerGamePerformance, SimulatedPlayerStats } from '../../types/game';

interface SimulationDashboardProps {
  result: SimulationResult;
  onNewDraft: () => void;
  onVSMode: () => void;
}

const STAT_LABELS: Record<keyof PlayerStats, string> = {
  pts: 'POINTS',
  reb: 'REBOUNDS',
  ast: 'ASSISTS',
  stl: 'STEALS',
  blk: 'BLOCKS',
};

const STAT_COLORS: Record<keyof PlayerStats, string> = {
  pts: '#00d4aa',
  reb: '#ffd700',
  ast: '#007aff',
  stl: '#34c759',
  blk: '#af52de',
};

type SeasonView = 'overview' | 'games' | 'standings' | 'players' | 'league';

export function SimulationDashboard({ result, onNewDraft, onVSMode }: SimulationDashboardProps) {
  const [view, setView] = useState<SeasonView>('overview');
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);

  const totalGames = result.games.length || 1;
  const record = `${result.wins}-${result.losses}`;
  const winPct = (result.wins / totalGames * 100).toFixed(1);
  const isUndefeated = result.losses === 0 && result.wins > 0;
  const isChampionship = result.wins / totalGames >= 0.79;

  const streak = useMemo(() => {
    if (result.games.length === 0) return { count: 0, type: 'W' as const };
    let currentStreak = 0;
    let streakType = result.games[result.games.length - 1]!.result;
    for (let i = result.games.length - 1; i >= 0; i--) {
      if (result.games[i]!.result === streakType) currentStreak++;
      else break;
    }
    return { count: currentStreak, type: streakType };
  }, [result.games]);

  // Team per-game averages derived from final scores (authoritative), not by
  // summing per-player averages with mismatched minutes.
  const teamAvgPts = result.teamStats.avgPts;

  return (
    <div className="min-h-screen bg-broadcast-dark">
      <div className="sticky top-0 z-40 bg-broadcast-dark/95 backdrop-blur border-b border-broadcast-border/50">
        <div className="max-w-7xl mx-auto px-4 py-2.5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <motion.button
                onClick={onNewDraft}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-lg bg-broadcast-card border border-broadcast-border hover:border-broadcast-accent/50 transition-colors"
                aria-label="Back to draft"
              >
                <ChevronRight className="w-5 h-5 text-broadcast-text-secondary rotate-180" aria-hidden="true" />
              </motion.button>
              <div>
                <h1 className="font-display text-2xl font-bold gradient-text">SEASON COMPLETE</h1>
                <p className="text-xs text-broadcast-text-secondary">{record} • {winPct}% WIN PCT • {teamAvgPts.toFixed(1)} PPG</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full text-sm font-bold bg-broadcast-card border border-broadcast-border text-broadcast-text-secondary">
                {result.era ? `${result.era.label.toUpperCase()} LEAGUE` : 'MIXED LEAGUE'}
              </span>
              <span className={cn(
                'px-3 py-1 rounded-full text-sm font-bold',
                isUndefeated ? 'bg-broadcast-gold/20 text-broadcast-gold border border-broadcast-gold/30' :
                isChampionship ? 'bg-broadcast-accent/20 text-broadcast-accent border border-broadcast-accent/30' :
                result.wins / totalGames >= 0.61 ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                'bg-broadcast-border text-broadcast-text-secondary'
              )}>
                {isUndefeated ? 'PERFECT SEASON' : isChampionship ? 'CHAMPIONSHIP CALIBER' : result.wins / totalGames >= 0.61 ? 'PLAYOFF TEAM' : 'LOTTERY BOUND'}
              </span>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2" role="tablist" aria-label="Season views">
            {(['overview', 'games', 'standings', 'players', 'league'] as const).map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={view === tab}
                onClick={() => setView(tab)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  view === tab
                    ? 'bg-broadcast-accent text-broadcast-dark shadow-glow-accent'
                    : 'bg-broadcast-card border border-broadcast-border text-broadcast-text-secondary hover:text-white hover:border-broadcast-accent/50'
                )}
              >
                {tab === 'overview' && <><BarChart2 className="w-4 h-4 inline mr-1" aria-hidden="true" /> OVERVIEW</>}
                {tab === 'games' && <><Calendar className="w-4 h-4 inline mr-1" aria-hidden="true" /> GAMES</>}
                {tab === 'standings' && <><ListOrdered className="w-4 h-4 inline mr-1" aria-hidden="true" /> STANDINGS</>}
                {tab === 'players' && <><Target className="w-4 h-4 inline mr-1" aria-hidden="true" /> MY TEAM</>}
                {tab === 'league' && <><Users className="w-4 h-4 inline mr-1" aria-hidden="true" /> LEAGUE STATS</>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-4 pb-8">
        <AnimatePresence mode="wait">
          {view === 'overview' && <OverviewView key="ov" result={result} streak={streak} isUndefeated={isUndefeated} isChampionship={isChampionship} totalGames={totalGames} />}
          {view === 'games' && <GamesView key="gm" result={result} onSelectGame={setSelectedGame} />}
          {view === 'standings' && <StandingsView key="st" result={result} />}
          {view === 'players' && <PlayersView key="pl" result={result} />}
          {view === 'league' && <LeagueView key="lg" result={result} />}
        </AnimatePresence>

        {selectedGame && (
          <GameBoxScoreModal game={selectedGame} result={result} onClose={() => setSelectedGame(null)} />
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <motion.button
            onClick={onVSMode}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn-gold px-6 py-2.5 text-base gap-2"
          >
            <Trophy className="w-5 h-5" aria-hidden="true" />
            VS MODE: CHALLENGE A LEGEND
          </motion.button>
          <motion.button
            onClick={onNewDraft}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn-secondary px-6 py-2.5 text-base"
          >
            NEW DRAFT
          </motion.button>
        </div>
      </main>
    </div>
  );
}

function OverviewView({ result, streak, isUndefeated, isChampionship, totalGames }: { result: SimulationResult; streak: { count: number; type: string }; isUndefeated: boolean; isChampionship: boolean; totalGames: number }) {
  const winPct = (result.wins / totalGames * 100).toFixed(1);
  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
      >
        <StatCard
          label="FINAL RECORD"
          value={`${result.wins}-${result.losses}`}
          icon={Trophy}
          iconColor={isUndefeated ? 'text-broadcast-gold' : isChampionship ? 'text-broadcast-accent' : 'text-blue-400'}
          trend={result.wins > result.losses ? 'positive' : result.wins < result.losses ? 'negative' : undefined}
          trendLabel={result.wins === result.losses ? 'AT .500' : undefined}
        />
        <StatCard
          label="WIN %"
          value={`${winPct}%`}
          icon={TrendingUp}
          iconColor="text-broadcast-accent"
        />
        <StatCard
          label="ENDING STREAK"
          value={streak.count > 0 ? `${streak.count} ${streak.type}` : '—'}
          icon={streak.type === 'W' ? TrendingUp : TrendingDown}
          iconColor={streak.type === 'W' ? 'text-green-400' : 'text-red-400'}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card-elevated p-4"
      >
        <h3 className="section-title font-display text-xl mb-3">TEAM STATS</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <TeamMetric label="OFF RTG" value={result.teamStats.offensiveRating.toFixed(1)} color="#00d4aa" />
          <TeamMetric label="DEF RTG" value={result.teamStats.defensiveRating.toFixed(1)} color="#ff3b30" />
          <TeamMetric label="NET RTG" value={result.teamStats.netRating.toFixed(1)} color="#ffd700" />
          <TeamMetric label="PACE" value={result.teamStats.pace.toFixed(1)} color="#007aff" />
        </div>
        <div className="mt-2.5 grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {(Object.keys(STAT_LABELS) as Array<keyof PlayerStats>).map(stat => {
            const key = stat === 'pts' ? 'avgPts' : stat === 'reb' ? 'avgReb' : stat === 'ast' ? 'avgAst' : stat === 'stl' ? 'avgStl' : 'avgBlk';
            const value = (result.teamStats as unknown as Record<string, number>)[key] ?? 0;
            return <TeamMetric key={stat} label={STAT_LABELS[stat]} value={Number(value).toFixed(1)} color={STAT_COLORS[stat]} />;
          })}
        </div>
      </motion.div>

      {isUndefeated && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="relative p-8 bg-gradient-to-br from-broadcast-gold/10 to-broadcast-accent/10 border-2 border-broadcast-gold/50 rounded-2xl text-center overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-broadcast-gold/5 to-transparent animate-shimmer" />
          <div className="relative z-10">
            <div className="text-6xl font-display font-bold gradient-text mb-4">{result.wins} - 0</div>
            <p className="text-broadcast-text-secondary text-lg mb-4">PERFECT SEASON ACHIEVED</p>
            <p className="text-broadcast-text-muted">You&apos;ve joined the immortals. The only team to ever go undefeated.</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function GamesView({ result, onSelectGame }: { result: SimulationResult; onSelectGame: (game: GameResult) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-broadcast-text-muted px-1">
        82-game schedule is shuffled every season — opponents and home/away are drawn fresh, so no team is ever locked to game #82.
      </p>
      {result.games.slice().reverse().map((game: GameResult) => (
        <motion.button
          key={game.gameNumber}
          type="button"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card px-4 py-2.5 hover:shadow-broadcast transition-shadow cursor-pointer w-full text-left"
          onClick={() => onSelectGame(game)}
          aria-label={`Game ${game.gameNumber} vs ${game.opponent}: ${game.result}, ${game.score.us} to ${game.score.them}${otLabel(game.otPeriods) ? ` in ${otLabel(game.otPeriods)}` : ''}`}
        >
          <div className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-right text-broadcast-text-muted font-mono text-sm">
              #{game.gameNumber}
            </span>
            <span
              className="shrink-0 px-2 py-0.5 rounded-md text-sm font-bold"
              style={{
                backgroundColor: game.result === 'W' ? 'rgba(0, 212, 170, 0.2)' : 'rgba(255, 59, 48, 0.2)',
                color: game.result === 'W' ? '#00d4aa' : '#ff3b30',
                border: game.result === 'W' ? '1px solid rgba(0, 212, 170, 0.3)' : '1px solid rgba(255, 59, 48, 0.3)'
              }}
            >
              {game.result}
            </span>
            <span className="shrink-0 font-mono font-bold text-lg">{game.score.us}-{game.score.them}</span>
            {otLabel(game.otPeriods) && (
              <span className="shrink-0 rounded bg-broadcast-gold/20 px-1.5 py-px text-xs font-bold text-broadcast-gold">
                {otLabel(game.otPeriods)}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-base text-broadcast-text-secondary">
              <span className="text-broadcast-text-muted">vs </span>
              <span className="font-medium text-white">{game.opponent}</span>
            </span>
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                game.isHome
                  ? 'bg-broadcast-accent/20 text-broadcast-accent border border-broadcast-accent/30'
                  : 'bg-broadcast-blue/15 text-broadcast-blue border border-broadcast-blue/30'
              }`}
            >
              {game.isHome ? 'HOME' : 'AWAY'}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-broadcast-text-muted" aria-hidden="true" />
          </div>
        </motion.button>
      ))}
    </div>
  );
}

function PlayersView({ result }: { result: SimulationResult }) {
  return (
    <div className="space-y-4">
      {result.playerStats.map((player, index: number) => (
        <motion.div
          key={player.playerId}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(index * 0.05, 0.3) }}
          className="card p-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-broadcast-accent/20 flex items-center justify-center font-bold text-broadcast-accent">
              #{index + 1}
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-white">
                {player.playerName}
                {player.position && <span className="ml-2 text-xs font-bold text-broadcast-text-secondary">{player.position}{typeof player.overall === 'number' ? ` • ${player.overall} OVR` : ''}</span>}
              </h4>
              <div className="text-sm text-broadcast-text-secondary">{player.gamesPlayed} GP{typeof player.minutesPerGame === 'number' ? ` • ${player.minutesPerGame.toFixed(1)} MPG` : ''} • {player.averages.pts} PPG • {player.averages.reb} RPG • {player.averages.ast} APG</div>
            </div>
            <div className="text-right">
              <div className="font-bold font-display text-broadcast-gold">{player.averages.pts.toFixed(1)}</div>
              <div className="text-xs text-broadcast-text-muted">PPG</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-4">
            {(Object.keys(STAT_LABELS) as Array<keyof PlayerStats>).map(stat => (
              <div key={stat} className="text-center">
                <div className="font-bold font-mono text-lg" style={{ color: STAT_COLORS[stat] }}>
                  {player.averages[stat].toFixed(1)}
                </div>
                <div className="text-[10px] text-broadcast-text-muted uppercase">{STAT_LABELS[stat]}</div>
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// League stats (2K-style): every player in the simulated league, including
// the user's drafted 5, with sortable / searchable per-game averages.
// ---------------------------------------------------------------------------

interface LeagueRow {
  playerId: string;
  playerName: string;
  team: string;
  isUser: boolean;
  position?: string;
  overall?: number;
  gp: number;
  mpg: number;
  averages: PlayerStats;
  totals: PlayerStats;
}

function buildLeagueRows(result: SimulationResult): LeagueRow[] {
  const rows: LeagueRow[] = [];
  for (const p of result.playerStats) {
    rows.push({
      playerId: p.playerId,
      playerName: p.playerName,
      team: p.team ?? 'Your Team',
      isUser: true,
      position: p.position,
      overall: p.overall,
      gp: p.gamesPlayed,
      mpg: p.minutesPerGame ?? 0,
      averages: { ...p.averages },
      totals: { ...p.totals },
    });
  }

  if (result.opponentPlayerStats?.length) {
    for (const p of result.opponentPlayerStats) {
      rows.push({
        playerId: p.playerId,
        playerName: p.playerName,
        team: p.team ?? 'Opponent',
        isUser: false,
        position: p.position,
        overall: p.overall,
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
      const existing = agg.get(perf.playerId);
      if (!existing) {
        agg.set(perf.playerId, {
          playerId: perf.playerId,
          playerName: perf.playerName,
          // The schedule name (e.g. "New York Knicks") is authoritative.
          // Raw card ids ("knicks", "opponent") are only a fallback.
          team: g.opponent,
          isUser: false,
          position: perf.position,
          overall: perf.overall,
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
      playerId: row.playerId,
      playerName: row.playerName,
      team: row.team,
      isUser: false,
      position: row.position,
      overall: row.overall,
      gp,
      mpg: Number((row.minTotal / gp).toFixed(1)),
      averages: {
        pts: Number((row.totals.pts / gp).toFixed(1)),
        reb: Number((row.totals.reb / gp).toFixed(1)),
        ast: Number((row.totals.ast / gp).toFixed(1)),
        stl: Number((row.totals.stl / gp).toFixed(1)),
        blk: Number((row.totals.blk / gp).toFixed(1)),
      },
      totals: { ...row.totals },
    });
  }
  return rows;
}

type LeagueSortKey = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'mpg' | 'gp' | 'name';

function LeagueView({ result }: { result: SimulationResult }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'user' | 'opp'>('all');
  const [sortKey, setSortKey] = useState<LeagueSortKey>('pts');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const rows = useMemo(() => buildLeagueRows(result), [result]);

  const leaders = useMemo(() => {
    const best = (k: keyof PlayerStats) => rows.reduce<LeagueRow | null>((top, r) => (!top || r.averages[k] > top.averages[k] ? r : top), null);
    return {
      pts: best('pts'),
      reb: best('reb'),
      ast: best('ast'),
      stl: best('stl'),
      blk: best('blk'),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter(r => {
      if (filter === 'user' && !r.isUser) return false;
      if (filter === 'opp' && r.isUser) return false;
      if (q && !`${r.playerName} ${r.team} ${formatTeamName(r.team)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    out = out.slice().sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.playerName.localeCompare(b.playerName);
      else if (sortKey === 'mpg') cmp = a.mpg - b.mpg;
      else if (sortKey === 'gp') cmp = a.gp - b.gp;
      else cmp = a.averages[sortKey] - b.averages[sortKey];
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return out;
  }, [rows, query, filter, sortKey, sortDir]);

  const toggleSort = (key: LeagueSortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const hasOpponents = rows.some(r => !r.isUser);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {(['pts', 'reb', 'ast', 'stl', 'blk'] as const).map(k => {
          const lead = leaders[k];
          return (
            <div key={k} className="p-2.5 bg-broadcast-darker rounded-lg text-center">
              <div className="text-[10px] text-broadcast-text-muted uppercase tracking-wider mb-1">{STAT_LABELS[k]} LEADER</div>
              <div className="font-bold text-sm text-white truncate" title={lead?.playerName ?? ''}>{lead ? toCompactName(lead.playerName) : '—'}</div>
              <div className="font-display text-2xl font-bold" style={{ color: STAT_COLORS[k] }}>
                {lead ? lead.averages[k].toFixed(1) : '—'}
              </div>
              {lead && <div className="text-[10px] text-broadcast-text-muted truncate">{lead.isUser ? 'YOUR TEAM' : formatTeamName(lead.team)}</div>}
            </div>
          );
        })}
      </div>

      <div className="card-elevated p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-broadcast-text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search every player in the league…"
            aria-label="Search league players"
            className="w-full bg-broadcast-darker border border-broadcast-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-broadcast-text-muted focus:outline-none focus:border-broadcast-accent/60"
          />
        </div>
        <div className="flex gap-2" role="tablist" aria-label="League filter">
          {([['all', 'ALL'], ['user', 'MY TEAM'], ['opp', 'OPPONENTS']] as const).map(([val, label]) => (
            <button
              key={val}
              role="tab"
              aria-selected={filter === val}
              onClick={() => setFilter(val)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                filter === val
                  ? 'bg-broadcast-accent text-broadcast-dark'
                  : 'bg-broadcast-card border border-broadcast-border text-broadcast-text-secondary hover:text-white'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!hasOpponents && (
        <p className="text-xs text-broadcast-text-muted px-1">
          This save was simulated before opponent box scores were recorded, so only your 5 are listed. Simulate a new season for full league stats.
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <caption className="sr-only">League-wide per-game player stats, including your drafted players</caption>
            <thead>
              <tr className="border-b border-broadcast-border text-broadcast-text-secondary text-xs">
                <th scope="col" className="text-left py-2 pl-3 pr-2">#</th>
                <th scope="col" className="text-left py-2 px-2">
                  <SortHeader label="PLAYER" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} align="left" />
                </th>
                <th scope="col" className="text-left py-2 px-2">TEAM</th>
                <th scope="col" className="text-center py-2 px-2"><SortHeader label="GP" active={sortKey === 'gp'} dir={sortDir} onClick={() => toggleSort('gp')} /></th>
                <th scope="col" className="text-center py-2 px-2"><SortHeader label="MPG" active={sortKey === 'mpg'} dir={sortDir} onClick={() => toggleSort('mpg')} /></th>
                {(['pts', 'reb', 'ast', 'stl', 'blk'] as const).map(k => (
                  <th key={k} scope="col" className="text-center py-2 px-2">
                    <SortHeader label={k.toUpperCase()} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} color={STAT_COLORS[k]} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.playerId} className={cn('border-b border-broadcast-border/50', r.isUser ? 'bg-broadcast-accent/5 hover:bg-broadcast-accent/10' : 'hover:bg-broadcast-border/30')}>
                  <td className="py-2 pl-3 pr-2 text-broadcast-text-muted font-mono">{i + 1}</td>
                  <td className="py-2 px-2 font-medium text-white whitespace-nowrap">
                    {r.isUser && <span className="mr-1.5 inline-block rounded bg-broadcast-accent/20 border border-broadcast-accent/30 px-1 py-px text-[10px] font-bold text-broadcast-accent align-middle">YOU</span>}
                    <span title={r.playerName}>{toCompactName(r.playerName)}</span>
                    {r.position && <span className="ml-1.5 text-[11px] text-broadcast-text-muted">{r.position}{typeof r.overall === 'number' ? ` ${r.overall}` : ''}</span>}
                  </td>
                  <td className="py-2 px-2 text-broadcast-text-secondary whitespace-nowrap max-w-[180px] truncate" title={r.isUser ? 'YOUR TEAM' : formatTeamName(r.team)}>{r.isUser ? 'YOUR TEAM' : formatTeamName(r.team)}</td>
                  <td className="py-2 px-2 text-center text-broadcast-text-secondary">{r.gp}</td>
                  <td className="py-2 px-2 text-center text-broadcast-text-secondary">{r.mpg.toFixed(1)}</td>
                  <td className="py-2 px-2 text-center font-bold" style={{ color: STAT_COLORS.pts }}>{r.averages.pts.toFixed(1)}</td>
                  <td className="py-2 px-2 text-center font-bold" style={{ color: STAT_COLORS.reb }}>{r.averages.reb.toFixed(1)}</td>
                  <td className="py-2 px-2 text-center font-bold" style={{ color: STAT_COLORS.ast }}>{r.averages.ast.toFixed(1)}</td>
                  <td className="py-2 px-2 text-center font-bold" style={{ color: STAT_COLORS.stl }}>{r.averages.stl.toFixed(1)}</td>
                  <td className="py-2 px-2 text-center font-bold" style={{ color: STAT_COLORS.blk }}>{r.averages.blk.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-broadcast-text-muted py-8 text-sm">No players match “{query}”.</p>
          )}
        </div>
        <p className="px-3 py-2 text-[11px] text-broadcast-text-muted border-t border-broadcast-border/50">
          {filtered.length} of {rows.length} players • your drafted 5 are tagged YOU • all players reflect their complete simulated season.
        </p>
      </div>
    </div>
  );
}

function SortHeader({ label, active, dir, onClick, align, color }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; align?: 'left' | 'center'; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sort by ${label} ${active && dir === 'desc' ? 'ascending' : 'descending'}`}
      className={cn('inline-flex items-center gap-1 font-bold hover:text-white', align === 'left' ? '' : 'justify-center', active ? 'text-white' : '')}
      style={color && active ? { color } : undefined}
    >
      {label}
      <span className={cn('text-[10px]', active ? 'opacity-100' : 'opacity-40')} aria-hidden="true">{active ? (dir === 'desc' ? '▼' : '▲') : '↕'}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Standings: full league table with W/L for every team, not just the user.
// Opponent records come from the sim (games vs you + simulated games
// against each other, everyone filled to 82). Absent on old saves.
// ---------------------------------------------------------------------------

function StandingsView({ result }: { result: SimulationResult }) {
  const standings = result.standings ?? [];
  const userRank = standings.findIndex(s => s.isUser) + 1;

  if (standings.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-white font-semibold">No standings recorded for this save.</p>
        <p className="text-sm text-broadcast-text-secondary mt-1">Simulate a new season to get the full league table with W/L for every team.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-broadcast-text-muted px-1">
        {standings.length} teams • 82 games each • every team&apos;s games vs you count, the rest are simulated against each other
        {userRank > 0 && <> • your team is ranked <span className="font-bold text-broadcast-accent">#{userRank}</span></>}.
      </p>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <caption className="sr-only">League standings with wins and losses for every team</caption>
            <thead>
              <tr className="border-b border-broadcast-border text-broadcast-text-secondary text-xs">
                <th scope="col" className="text-left py-2 pl-3 pr-2">#</th>
                <th scope="col" className="text-left py-2 px-2">TEAM</th>
                <th scope="col" className="text-center py-2 px-2">W</th>
                <th scope="col" className="text-center py-2 px-2">L</th>
                <th scope="col" className="text-center py-2 px-2">PCT</th>
                <th scope="col" className="text-center py-2 px-2">GB</th>
                <th scope="col" className="text-center py-2 px-2">PF</th>
                <th scope="col" className="text-center py-2 px-2">PA</th>
                <th scope="col" className="text-center py-2 px-2">DIFF</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.team} className={cn('border-b border-broadcast-border/50', s.isUser ? 'bg-broadcast-accent/10 hover:bg-broadcast-accent/15' : 'hover:bg-broadcast-border/30')}>
                  <td className="py-2 pl-3 pr-2 text-broadcast-text-muted font-mono">{i + 1}</td>
                  <td className="py-2 px-2 font-medium text-white whitespace-nowrap">
                    {s.isUser && <span className="mr-1.5 inline-block rounded bg-broadcast-accent/20 border border-broadcast-accent/30 px-1 py-px text-[10px] font-bold text-broadcast-accent align-middle">YOU</span>}
                    <span title={s.isUser ? 'Your Team' : formatTeamName(s.team)}>{s.isUser ? 'YOUR TEAM' : formatTeamName(s.team)}</span>
                  </td>
                  <td className="py-2 px-2 text-center font-bold text-broadcast-accent">{s.wins}</td>
                  <td className="py-2 px-2 text-center font-bold text-broadcast-red">{s.losses}</td>
                  <td className="py-2 px-2 text-center text-broadcast-text-secondary">{s.winPct.toFixed(3)}</td>
                  <td className="py-2 px-2 text-center text-broadcast-text-secondary">{s.gamesBehind === 0 ? '—' : s.gamesBehind.toFixed(1)}</td>
                  <td className="py-2 px-2 text-center text-broadcast-text-secondary">{s.pointsFor}</td>
                  <td className="py-2 px-2 text-center text-broadcast-text-secondary">{s.pointsAgainst}</td>
                  <td className={cn('py-2 px-2 text-center font-mono font-bold', s.pointDiff >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {s.pointDiff >= 0 ? `+${s.pointDiff}` : s.pointDiff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Box score with hover inspector: hover / focus / tap any player name to see
// their season averages + card ratings (works for opponents AND your picks).
// ---------------------------------------------------------------------------

interface HoverState {
  perf: PlayerGamePerformance;
  isUser: boolean;
  teamLabel: string;
  season: SimulatedPlayerStats | { averages: PlayerStats; gamesPlayed: number; minutesPerGame?: number; highGames?: SimulatedPlayerStats['highGames'] } | null;
  x: number;
  y: number;
}

function GameBoxScoreModal({ game, result, onClose }: { game: GameResult; result: SimulationResult; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useLockBodyScroll(true);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [hover, setHover] = useState<HoverState | null>(null);

  const perfs: PlayerGamePerformance[] = game.playerPerformances ?? [];
  const oppPerfs: PlayerGamePerformance[] = game.opponentPerformances ?? [];

  const userSeasonById = useMemo(() => {
    const m = new Map<string, SimulatedPlayerStats>();
    for (const s of result.playerStats) m.set(s.playerId, s);
    return m;
  }, [result.playerStats]);

  const oppSeasonById = useMemo(() => {
    const totals = new Map<string, { name: string; team: string; gp: number; min: number; pts: number; reb: number; ast: number; stl: number; blk: number }>();
    for (const g of result.games) {
      for (const p of g.opponentPerformances ?? []) {
        const cur = totals.get(p.playerId) ?? { name: p.playerName, team: p.team ?? g.opponent, gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
        cur.gp += 1;
        cur.min += p.minutes ?? 0;
        cur.pts += p.stats.pts;
        cur.reb += p.stats.reb;
        cur.ast += p.stats.ast;
        cur.stl += p.stats.stl;
        cur.blk += p.stats.blk;
        totals.set(p.playerId, cur);
      }
    }
    const m = new Map<string, { averages: PlayerStats; gamesPlayed: number; minutesPerGame?: number }>();
    for (const [id, t] of totals) {
      const gp = Math.max(1, t.gp);
      m.set(id, {
        gamesPlayed: t.gp,
        minutesPerGame: Number((t.min / gp).toFixed(1)),
        averages: {
          pts: Number((t.pts / gp).toFixed(1)),
          reb: Number((t.reb / gp).toFixed(1)),
          ast: Number((t.ast / gp).toFixed(1)),
          stl: Number((t.stl / gp).toFixed(1)),
          blk: Number((t.blk / gp).toFixed(1)),
        },
      });
    }
    return m;
  }, [result.games]);

  const showHover = (
    perf: PlayerGamePerformance,
    isUser: boolean,
    teamLabel: string,
    e: React.SyntheticEvent<HTMLElement>,
  ) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const width = 288;
    const height = 300;
    let x = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
    let y = rect.bottom + 8;
    if (y + height > window.innerHeight - 8) {
      y = Math.max(8, rect.top - height - 8);
    }
    const season = isUser ? (userSeasonById.get(perf.playerId) ?? null) : (oppSeasonById.get(perf.playerId) ?? null);
    setHover({ perf, isUser, teamLabel, season, x, y });
  };

  const clearHover = () => setHover(null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-broadcast-dark/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-7xl max-h-[90vh] overflow-y-auto bg-broadcast-card border border-broadcast-border rounded-2xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Box score for game ${game.gameNumber}`}
      >
        <div className="p-4 border-b border-broadcast-border flex items-center justify-between sticky top-0 bg-broadcast-card/95 backdrop-blur z-10">
          <h3 className="font-display text-xl font-bold">BOX SCORE - GAME #{game.gameNumber}</h3>
          <button ref={closeRef} onClick={onClose} className="p-2 rounded-lg hover:bg-broadcast-border transition-colors" aria-label="Close box score">
            <X className="w-5 h-5 text-broadcast-text-secondary" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-center">
              <div className="font-display text-3xl font-bold gradient-text">{game.score.us}</div>
              <div className="text-broadcast-text-secondary">YOUR TEAM</div>
            </div>
            <div className="px-4">
              <div className="text-broadcast-text-muted">{otLabel(game.otPeriods) || 'FINAL'}</div>
            </div>
            <div className="text-center">
              <div className="font-display text-3xl font-bold text-broadcast-red">{game.score.them}</div>
              <div className="text-broadcast-text-secondary">{game.opponent}</div>
            </div>
          </div>
          <p className="text-center text-[11px] text-broadcast-text-muted mb-4">Hover, focus, or tap a player name for season averages + card ratings.</p>

          <div className="grid gap-6 md:grid-cols-2">
            <BoxScoreTable
              title="YOUR TEAM"
              performances={perfs}
              isUser
              teamLabel="YOUR TEAM"
              onHover={showHover}
              onLeave={clearHover}
            />
            <BoxScoreTable
              title={game.opponent.toUpperCase()}
              performances={oppPerfs}
              emptyText="No opponent box score recorded for this game."
              teamLabel={game.opponent}
              onHover={showHover}
              onLeave={clearHover}
            />
          </div>
        </div>
      </motion.div>

      {hover && <HoverCard hover={hover} onClose={clearHover} />}
    </motion.div>
  );
}

function HoverCard({ hover, onClose }: { hover: HoverState; onClose: () => void }) {
  const { perf, season, teamLabel, isUser } = hover;
  const avg = season?.averages;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[60] w-72 pointer-events-auto rounded-xl border border-broadcast-accent/40 bg-broadcast-darker/95 backdrop-blur p-3 shadow-2xl"
      style={{ left: hover.x, top: hover.y }}
      onMouseLeave={onClose}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-white text-sm truncate">{perf.playerName}</div>
          <div className="text-[11px] text-broadcast-text-secondary truncate">
            {teamLabel}{perf.position ? ` • ${perf.position}` : ''}{typeof perf.overall === 'number' ? ` • ${perf.overall} OVR` : ''}{isUser ? ' • YOUR PICK' : ''}
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-broadcast-border text-broadcast-text-muted" aria-label="Dismiss player details">
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 rounded-lg bg-broadcast-card/60 p-2">
        <div className="text-[10px] font-bold text-broadcast-text-muted uppercase tracking-wider mb-1">This game • {perf.minutes} MIN</div>
        <div className="grid grid-cols-5 gap-1 text-center">
          {(['pts', 'reb', 'ast', 'stl', 'blk'] as const).map(k => (
            <div key={k}>
              <div className="font-bold text-sm" style={{ color: STAT_COLORS[k] }}>{perf.stats[k]}</div>
              <div className="text-[9px] text-broadcast-text-muted uppercase">{k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1.5 rounded-lg bg-broadcast-card/60 p-2">
        <div className="text-[10px] font-bold text-broadcast-text-muted uppercase tracking-wider mb-1">
          Season avg{season ? ` • ${season.gamesPlayed} GP${season.minutesPerGame !== undefined ? ` • ${Number(season.minutesPerGame).toFixed(1)} MPG` : ''}` : ''}
        </div>
        {avg ? (
          <div className="grid grid-cols-5 gap-1 text-center">
            {(['pts', 'reb', 'ast', 'stl', 'blk'] as const).map(k => (
              <div key={k}>
                <div className="font-bold text-sm" style={{ color: STAT_COLORS[k] }}>{avg[k].toFixed(1)}</div>
                <div className="text-[9px] text-broadcast-text-muted uppercase">{k}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-broadcast-text-muted">No season average recorded for this save.</p>
        )}
      </div>

      {perf.baseStats && (
        <div className="mt-1.5 rounded-lg bg-broadcast-card/60 p-2">
          <div className="text-[10px] font-bold text-broadcast-text-muted uppercase tracking-wider mb-1">Card ratings</div>
          <div className="grid grid-cols-5 gap-1 text-center">
            {(['pts', 'reb', 'ast', 'stl', 'blk'] as const).map(k => (
              <div key={k}>
                <div className="font-mono text-xs text-broadcast-text-secondary">{Number(perf.baseStats![k]).toFixed(1)}</div>
                <div className="text-[9px] text-broadcast-text-muted uppercase">{k}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BoxScoreTable({ title, performances, emptyText, isUser, teamLabel, onHover, onLeave }: {
  title: string;
  performances: PlayerGamePerformance[];
  emptyText?: string;
  isUser?: boolean;
  teamLabel?: string;
  onHover?: (perf: PlayerGamePerformance, isUser: boolean, teamLabel: string, e: React.SyntheticEvent<HTMLElement>) => void;
  onLeave?: () => void;
}) {
  return (
    <div className="min-w-0">
      <h5 className="text-sm font-semibold text-broadcast-text-secondary mb-2">{title}</h5>
      <div className="overflow-x-auto">
        <table className="w-full text-xl">
          <caption className="sr-only">{title} player performances</caption>
          <thead>
            <tr className="border-b border-broadcast-border text-broadcast-text-secondary">
              <th scope="col" className="text-left py-2 pl-1 pr-2">PLAYER</th>
              <th scope="col" className="text-center py-2 px-2">MIN</th>
              <th scope="col" className="text-center py-2 px-2" style={{ color: STAT_COLORS.pts }}>PTS</th>
              <th scope="col" className="text-center py-2 px-2" style={{ color: STAT_COLORS.reb }}>REB</th>
              <th scope="col" className="text-center py-2 px-2" style={{ color: STAT_COLORS.ast }}>AST</th>
              <th scope="col" className="text-center py-2 px-2" style={{ color: STAT_COLORS.stl }}>STL</th>
              <th scope="col" className="text-center py-2 px-2" style={{ color: STAT_COLORS.blk }}>BLK</th>
            </tr>
          </thead>
          <tbody>
            {performances.map((perf) => (
              <tr key={perf.playerId} className="border-b border-broadcast-border/50 hover:bg-broadcast-border/50">
                <td className="whitespace-nowrap py-2 pl-1 pr-2 font-medium">
                  <button
                    type="button"
                    title={`${perf.playerName} — hover for season + card stats`}
                    onMouseEnter={e => onHover?.(perf, !!isUser, teamLabel ?? title, e)}
                    onFocus={e => onHover?.(perf, !!isUser, teamLabel ?? title, e)}
                    onMouseLeave={onLeave}
                    onBlur={onLeave}
                    onClick={e => onHover?.(perf, !!isUser, teamLabel ?? title, e)}
                    className="underline decoration-dotted decoration-broadcast-accent/50 underline-offset-4 hover:text-broadcast-accent hover:decoration-broadcast-accent focus:outline-none focus:text-broadcast-accent cursor-help text-left"
                  >
                    {toCompactName(perf.playerName)}
                  </button>
                </td>
                <td className="text-center py-2 px-2 text-broadcast-text-secondary">{perf.minutes}</td>
                <td className="text-center py-2 px-2 font-bold" style={{ color: STAT_COLORS.pts }}>{perf.stats.pts}</td>
                <td className="text-center py-2 px-2 font-bold" style={{ color: STAT_COLORS.reb }}>{perf.stats.reb}</td>
                <td className="text-center py-2 px-2 font-bold" style={{ color: STAT_COLORS.ast }}>{perf.stats.ast}</td>
                <td className="text-center py-2 px-2 font-bold" style={{ color: STAT_COLORS.stl }}>{perf.stats.stl}</td>
                <td className="text-center py-2 px-2 font-bold" style={{ color: STAT_COLORS.blk }}>{perf.stats.blk}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {performances.length === 0 && (
          <p className="text-center text-broadcast-text-muted py-6">{emptyText ?? 'No per-player box score recorded for this game.'}</p>
        )}
      </div>
    </div>
  );
}

/** "Shai Gilgeous-Alexander" -> "S. Gilgeous-Alexander": full identity on one line, no ellipsis. */
function toCompactName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${(parts[0] ?? '').charAt(0)}. ${parts.slice(1).join(' ')}`;
}

function StatCard({ label, value, icon: Icon, iconColor, trend, trendLabel }: { label: string; value: string; icon: React.ElementType; iconColor: string; trend?: 'positive' | 'negative'; trendLabel?: string }) {
  return (
    <div className="card-elevated p-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-broadcast-text-muted uppercase tracking-wider">{label}</span>
        <Icon className={cn('w-5 h-5', iconColor)} aria-hidden="true" />
      </div>
      <div className="font-display text-4xl font-bold text-white">{value}</div>
      {trend && (
        <div className={cn('mt-1 text-xs font-medium', trend === 'positive' ? 'text-green-400' : 'text-red-400')}>
          {trend === 'positive' ? 'Above .500' : 'Below .500'}
        </div>
      )}
      {trendLabel && !trend && (
        <div className="mt-1 text-xs font-medium text-broadcast-text-muted">{trendLabel}</div>
      )}
    </div>
  );
}

function TeamMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center p-2.5 bg-broadcast-darker rounded-lg">
      <div className="text-xs text-broadcast-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="font-display text-3xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
