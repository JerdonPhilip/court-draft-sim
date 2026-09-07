import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, X, Trophy, TrendingUp, TrendingDown, Target, Calendar, BarChart2 } from 'lucide-react';
import { cn } from '../../utils/helpers';
import type { SimulationResult, PlayerStats, GameResult, PlayerGamePerformance } from '../../types/game';

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

export function SimulationDashboard({ result, onNewDraft, onVSMode }: SimulationDashboardProps) {
  const [view, setView] = useState<'overview' | 'games' | 'players'>('overview');
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
        <div className="max-w-7xl mx-auto px-4 py-4">
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

          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Season views">
            {(['overview', 'games', 'players'] as const).map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={view === tab}
                onClick={() => setView(tab)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  view === tab
                    ? 'bg-broadcast-accent text-broadcast-dark shadow-glow-accent'
                    : 'bg-broadcast-card border border-broadcast-border text-broadcast-text-secondary hover:text-white hover:border-broadcast-accent/50'
                )}
              >
                {tab === 'overview' && <><BarChart2 className="w-4 h-4 inline mr-1" aria-hidden="true" /> OVERVIEW</>}
                {tab === 'games' && <><Calendar className="w-4 h-4 inline mr-1" aria-hidden="true" /> GAMES</>}
                {tab === 'players' && <><Target className="w-4 h-4 inline mr-1" aria-hidden="true" /> PLAYERS</>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 pb-20">
        <AnimatePresence mode="wait">
          {view === 'overview' && <OverviewView key="ov" result={result} streak={streak} isUndefeated={isUndefeated} isChampionship={isChampionship} totalGames={totalGames} />}
          {view === 'games' && <GamesView key="gm" result={result} onSelectGame={setSelectedGame} />}
          {view === 'players' && <PlayersView key="pl" result={result} />}
        </AnimatePresence>

        {selectedGame && (
          <GameBoxScoreModal game={selectedGame} onClose={() => setSelectedGame(null)} />
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <motion.button
            onClick={onVSMode}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn-gold px-8 py-3 text-lg gap-2"
          >
            <Trophy className="w-5 h-5" aria-hidden="true" />
            VS MODE: CHALLENGE A LEGEND
          </motion.button>
          <motion.button
            onClick={onNewDraft}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn-secondary px-8 py-3 text-lg"
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
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
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
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4"
      >
        {(Object.keys(STAT_LABELS) as Array<keyof PlayerStats>).map(stat => {
          const key = stat === 'pts' ? 'avgPts' : stat === 'reb' ? 'avgReb' : stat === 'ast' ? 'avgAst' : stat === 'stl' ? 'avgStl' : 'avgBlk';
          const value = (result.teamStats as unknown as Record<string, number>)[key] ?? 0;
          return (
            <TeamStatCard
              key={stat}
              label={STAT_LABELS[stat]}
              value={Number(value).toFixed(1)}
              color={STAT_COLORS[stat]}
            />
          );
        })}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card-elevated p-6"
      >
        <h3 className="section-title font-display text-lg mb-4">TEAM SEASON STATS</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TeamMetric label="OFF RTG" value={result.teamStats.offensiveRating.toFixed(1)} color="#00d4aa" />
          <TeamMetric label="DEF RTG" value={result.teamStats.defensiveRating.toFixed(1)} color="#ff3b30" />
          <TeamMetric label="NET RTG" value={result.teamStats.netRating.toFixed(1)} color="#ffd700" />
          <TeamMetric label="PACE" value={result.teamStats.pace.toFixed(1)} color="#007aff" />
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <TeamMetric label="AVG PTS" value={result.teamStats.avgPts.toFixed(1)} color="#00d4aa" />
          <TeamMetric label="AVG REB" value={result.teamStats.avgReb.toFixed(1)} color="#ffd700" />
          <TeamMetric label="AVG AST" value={result.teamStats.avgAst.toFixed(1)} color="#007aff" />
          <TeamMetric label="AVG BLK" value={result.teamStats.avgBlk.toFixed(1)} color="#af52de" />
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
  const games = useMemo(() => [...result.games].reverse(), [result.games]);
  return (
    <div className="space-y-3">
      {games.map((game: GameResult) => (
        <motion.button
          key={game.gameNumber}
          type="button"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card p-4 hover:shadow-broadcast transition-shadow cursor-pointer w-full text-left"
          onClick={() => onSelectGame(game)}
          aria-label={`Game ${game.gameNumber} vs ${game.opponent}: ${game.result}, ${game.score.us} to ${game.score.them}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="w-12 text-right text-broadcast-text-muted font-mono">
                GM #{game.gameNumber}
              </span>
              <div className="px-3 py-1 rounded-lg text-sm font-bold"
                style={{
                  backgroundColor: game.result === 'W' ? 'rgba(0, 212, 170, 0.2)' : 'rgba(255, 59, 48, 0.2)',
                  color: game.result === 'W' ? '#00d4aa' : '#ff3b30',
                  border: game.result === 'W' ? '1px solid rgba(0, 212, 170, 0.3)' : '1px solid rgba(255, 59, 48, 0.3)'
                }}
              >
                {game.result}
              </div>
              <div className="text-center">
                <div className="font-mono font-bold text-lg">{game.score.us} - {game.score.them}</div>
                <div className="text-xs text-broadcast-text-muted">{game.isHome ? 'HOME' : 'AWAY'}</div>
              </div>
              <div className="text-right w-24">
                <div className="text-broadcast-text-secondary text-xs">OPPONENT</div>
                <div className="font-medium">{game.opponent}</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-broadcast-text-muted" aria-hidden="true" />
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
              <h4 className="font-semibold text-white">{player.playerName}</h4>
              <div className="text-sm text-broadcast-text-secondary">{player.gamesPlayed} GP • {player.averages.pts} PPG • {player.averages.reb} RPG • {player.averages.ast} APG</div>
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

function GameBoxScoreModal({ game, onClose }: { game: GameResult; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const perfs: PlayerGamePerformance[] = game.playerPerformances ?? [];

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
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-broadcast-card border border-broadcast-border rounded-2xl"
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
          <div className="flex items-center justify-between mb-6">
            <div className="text-center">
              <div className="font-display text-3xl font-bold gradient-text">{game.score.us}</div>
              <div className="text-broadcast-text-secondary">YOUR TEAM</div>
            </div>
            <div className="px-4">
              <div className="text-broadcast-text-muted">FINAL</div>
            </div>
            <div className="text-center">
              <div className="font-display text-3xl font-bold text-broadcast-red">{game.score.them}</div>
              <div className="text-broadcast-text-secondary">{game.opponent}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Player performances for game {game.gameNumber}</caption>
              <thead>
                <tr className="border-b border-broadcast-border text-broadcast-text-secondary">
                  <th scope="col" className="text-left py-2 px-3">PLAYER</th>
                  <th scope="col" className="text-center py-2 px-3">MIN</th>
                  <th scope="col" className="text-center py-2 px-3" style={{ color: STAT_COLORS.pts }}>PTS</th>
                  <th scope="col" className="text-center py-2 px-3" style={{ color: STAT_COLORS.reb }}>REB</th>
                  <th scope="col" className="text-center py-2 px-3" style={{ color: STAT_COLORS.ast }}>AST</th>
                  <th scope="col" className="text-center py-2 px-3" style={{ color: STAT_COLORS.stl }}>STL</th>
                  <th scope="col" className="text-center py-2 px-3" style={{ color: STAT_COLORS.blk }}>BLK</th>
                </tr>
              </thead>
              <tbody>
                {perfs.map((perf) => (
                  <tr key={perf.playerId} className="border-b border-broadcast-border/50 hover:bg-broadcast-border/50">
                    <td className="py-2 px-3 font-medium">{perf.playerName}</td>
                    <td className="text-center py-2 px-3 text-broadcast-text-secondary">{perf.minutes}</td>
                    <td className="text-center py-2 px-3 font-bold" style={{ color: STAT_COLORS.pts }}>{perf.stats.pts}</td>
                    <td className="text-center py-2 px-3 font-bold" style={{ color: STAT_COLORS.reb }}>{perf.stats.reb}</td>
                    <td className="text-center py-2 px-3 font-bold" style={{ color: STAT_COLORS.ast }}>{perf.stats.ast}</td>
                    <td className="text-center py-2 px-3 font-bold" style={{ color: STAT_COLORS.stl }}>{perf.stats.stl}</td>
                    <td className="text-center py-2 px-3 font-bold" style={{ color: STAT_COLORS.blk }}>{perf.stats.blk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {perfs.length === 0 && (
              <p className="text-center text-broadcast-text-muted py-6">No per-player box score recorded for this game.</p>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatCard({ label, value, icon: Icon, iconColor, trend, trendLabel }: { label: string; value: string; icon: React.ElementType; iconColor: string; trend?: 'positive' | 'negative'; trendLabel?: string }) {
  return (
    <div className="card-elevated p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-broadcast-text-muted uppercase tracking-wider">{label}</span>
        <Icon className={cn('w-6 h-6', iconColor)} aria-hidden="true" />
      </div>
      <div className="font-display text-3xl font-bold text-white">{value}</div>
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

function TeamStatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="card p-4 text-center">
      <div className="text-[10px] text-broadcast-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="font-display text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-broadcast-text-muted">PER GAME</div>
    </div>
  );
}

function TeamMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center p-3 bg-broadcast-darker rounded-lg">
      <div className="text-[10px] text-broadcast-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="font-display text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
