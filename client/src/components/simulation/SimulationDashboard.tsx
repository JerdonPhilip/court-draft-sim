'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Trophy, TrendingUp, TrendingDown, Target, Award, Calendar, BarChart2 } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { SimulationResult, PlayerStats, GameResult as GameResultType } from '../../types/game';

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

interface LocalGameResult extends GameResultType {
  isHome: boolean;
}

export function SimulationDashboard({ result, onNewDraft, onVSMode }: SimulationDashboardProps) {
  const [view, setView] = useState<'overview' | 'games' | 'players' | 'boxscore'>('overview');
  const [selectedGame, setSelectedGame] = useState<LocalGameResult | null>(null);

  const handleSelectGame = (game: GameResultType) => {
    setSelectedGame({ ...game, isHome: game.isHome ?? false } as LocalGameResult);
  };

  const record = `${result.wins}-${result.losses}`;
  const winPct = (result.wins / 82 * 100).toFixed(1);
  const isUndefeated = result.losses === 0;
  const isChampionship = result.wins >= 65;

  const streak = useMemo(() => {
    let currentStreak = 0;
    let streakType: 'W' | 'L' = 'W';
    for (let i = result.games.length - 1; i >= 0; i--) {
      if (i === result.games.length - 1) {
        streakType = result.games[i].result;
        currentStreak = 1;
      } else if (result.games[i].result === streakType) {
        currentStreak++;
      } else {
        break;
      }
    }
    return { count: currentStreak, type: streakType };
  }, [result.games]);

  const avgStats = useMemo(() => {
    const totals = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
    for (const player of result.playerStats) {
      totals.pts += player.averages.pts;
      totals.reb += player.averages.reb;
      totals.ast += player.averages.ast;
      totals.stl += player.averages.stl;
      totals.blk += player.averages.blk;
    }
    return totals;
  }, [result.playerStats]);

  return (
    <div className="min-h-screen bg-broadcast-dark">
      <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-broadcast-dark/95 to-transparent pb-4">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <motion.button
                onClick={onNewDraft}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-lg bg-broadcast-card border border-broadcast-border hover:border-broadcast-accent/50 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-broadcast-text-secondary" />
              </motion.button>
              <div>
                <h1 className="font-display text-2xl font-bold gradient-text">SEASON COMPLETE</h1>
                <p className="text-xs text-broadcast-text-secondary">{record} • {winPct}% WIN PCT</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                'px-3 py-1 rounded-full text-sm font-bold',
                isUndefeated ? 'bg-broadcast-gold/20 text-broadcast-gold border border-broadcast-gold/30' :
                isChampionship ? 'bg-broadcast-accent/20 text-broadcast-accent border border-broadcast-accent/30' :
                result.wins >= 50 ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                'bg-broadcast-border text-broadcast-text-secondary'
              )}>
                {isUndefeated && '🏆 '}{isUndefeated ? '82-0 PERFECT' : isChampionship ? 'CHAMPIONSHIP CALIBER' : result.wins >= 50 ? 'PLAYOFF TEAM' : 'LOTTERY BOUND'}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(['overview', 'games', 'players', 'boxscore'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  view === tab
                    ? 'bg-broadcast-accent text-broadcast-dark shadow-glow-accent'
                    : 'bg-broadcast-card border border-broadcast-border text-broadcast-text-secondary hover:text-white hover:border-broadcast-accent/50'
                )}
              >
                {tab === 'overview' && <><BarChart2 className="w-4 h-4 inline mr-1" /> OVERVIEW</>}
                {tab === 'games' && <><Calendar className="w-4 h-4 inline mr-1" /> GAMES</>}
                {tab === 'players' && <><Target className="w-4 h-4 inline mr-1" /> PLAYERS</>}
                {tab === 'boxscore' && <><Award className="w-4 h-4 inline mr-1" /> BOX SCORES</>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 pb-20 pt-20">
        <AnimatePresence mode="wait">
          {view === 'overview' && <OverviewView result={result} avgStats={avgStats} streak={streak} isUndefeated={isUndefeated} isChampionship={isChampionship} />}
          {view === 'games' && <GamesView result={result} onSelectGame={handleSelectGame} />}
          {view === 'players' && <PlayersView result={result} />}
          {view === 'boxscore' && <BoxScoreView result={result} />}
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
            <Trophy className="w-5 h-5" />
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

function OverviewView({ result, avgStats, streak, isUndefeated, isChampionship }: any) {
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
          trend={result.wins >= 50 ? 'positive' : 'negative'}
        />
        <StatCard
          label="WIN %"
          value={`${(result.wins / 82 * 100).toFixed(1)}%`}
          icon={TrendingUp}
          iconColor="text-broadcast-accent"
        />
        <StatCard
          label="CURRENT STREAK"
          value={`${streak.count} ${streak.type === 'W' ? 'W' : 'L'}`}
          icon={streak.type === 'W' ? TrendingUp : TrendingDown}
          iconColor={streak.type === 'W' ? 'text-green-400' : 'text-red-400'}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4"
      >
        {(Object.keys(STAT_LABELS) as Array<keyof PlayerStats>).map(stat => (
          <TeamStatCard
            key={stat}
            label={STAT_LABELS[stat]}
            value={avgStats[stat].toFixed(1)}
            color={STAT_COLORS[stat]}
            icon={<span>{stat.toUpperCase()[0]}</span>}
          />
        ))}
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
            <div className="text-6xl font-display font-bold gradient-text mb-4">82 - 0</div>
            <p className="text-broadcast-text-secondary text-lg mb-4">PERFECT SEASON ACHIEVED</p>
            <p className="text-broadcast-text-muted">You've joined the immortals. The only team to ever go undefeated.</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function GamesView({ result, onSelectGame }: { result: SimulationResult; onSelectGame: (game: GameResultType) => void }) {
  return (
    <div className="space-y-3">
      {result.games.slice().reverse().map((game: GameResultType, index: number) => (
        <motion.div
          key={game.gameNumber}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.01 }}
          className="card p-4 hover:shadow-broadcast transition-shadow cursor-pointer"
          onClick={() => onSelectGame(game)}
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
                {game.result === 'W' ? 'W' : 'L'}
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
            <ChevronRight className="w-5 h-5 text-broadcast-text-muted" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

interface SimulatedPlayerStats {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  averages: PlayerStats;
  totals: PlayerStats;
}

function PlayersView({ result }: { result: SimulationResult }) {
  return (
    <div className="space-y-4">
      {result.playerStats.map((player: SimulatedPlayerStats, index: number) => (
        <motion.div
          key={player.playerId}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
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

function BoxScoreView({ result }: any) {
  return (
    <div className="space-y-4">
      <p className="text-broadcast-text-secondary text-center py-8">
        Click on any game in the GAMES tab to view detailed box scores
      </p>
    </div>
  );
}

function GameBoxScoreModal({ game, onClose }: any) {
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
      >
        <div className="p-4 border-b border-broadcast-border flex items-center justify-between sticky top-0 bg-broadcast-card/95 backdrop-blur z-10">
          <h3 className="font-display text-xl font-bold">BOX SCORE - GAME #{game.gameNumber}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-broadcast-border transition-colors">
            <ChevronRight className="w-5 h-5 text-broadcast-text-secondary rotate-90" />
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
              <thead>
                <tr className="border-b border-broadcast-border text-broadcast-text-secondary">
                  <th className="text-left py-2 px-3">PLAYER</th>
                  <th className="text-center py-2 px-3">MIN</th>
                  <th className="text-center py-2 px-3" style={{ color: STAT_COLORS.pts }}>PTS</th>
                  <th className="text-center py-2 px-3" style={{ color: STAT_COLORS.reb }}>REB</th>
                  <th className="text-center py-2 px-3" style={{ color: STAT_COLORS.ast }}>AST</th>
                  <th className="text-center py-2 px-3" style={{ color: STAT_COLORS.stl }}>STL</th>
                  <th className="text-center py-2 px-3" style={{ color: STAT_COLORS.blk }}>BLK</th>
                </tr>
              </thead>
              <tbody>
                {game.playerPerformances.map((perf: any, i: number) => (
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
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatCard({ label, value, icon: Icon, iconColor, trend }: any) {
  return (
    <div className="card-elevated p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-broadcast-text-muted uppercase tracking-wider">{label}</span>
        <Icon className={cn('w-6 h-6', iconColor)} />
      </div>
      <div className="font-display text-3xl font-bold text-white">{value}</div>
      {trend && (
        <div className={cn('mt-1 text-xs font-medium', trend === 'positive' ? 'text-green-400' : 'text-red-400')}>
          {trend === 'positive' ? '↑' : '↓'} ABOVE .500
        </div>
      )}
    </div>
  );
}

function TeamStatCard({ label, value, color, icon }: any) {
  return (
    <div className="card p-4 text-center">
      <div className="text-[10px] text-broadcast-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="font-display text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-broadcast-text-muted">PER GAME</div>
    </div>
  );
}

function TeamMetric({ label, value, color }: any) {
  return (
    <div className="text-center p-3 bg-broadcast-darker rounded-lg">
      <div className="text-[10px] text-broadcast-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="font-display text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}