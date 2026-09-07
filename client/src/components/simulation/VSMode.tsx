'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Trophy, Zap, Crown, Star, Target, Calendar, X } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useGameStore } from '../../store/gameStore';
import { HistoricalTeam, VSModeMatchup, VSSeriesResult, VSBoxScore, PlayerGamePerformance } from '../../types/game';
import { calculateTeamStrength, getWinProjection } from '../../utils/helpers';
import { Position } from '../../types/game';

interface VSModeScreenProps {
  onBack: () => void;
}

export function VSModeScreen({ onBack }: VSModeScreenProps) {
  const {
    draftState,
    vsMatchup,
    historicalTeams,
    startVSMode,
    setPhase,
    setVSMatchup,
  } = useGameStore();

  const [selectedTeam, setSelectedTeam] = useState<HistoricalTeam | null>(null);
  const [seriesLength, setSeriesLength] = useState<1 | 7>(7);
  const [isLoading, setIsLoading] = useState(false);

  const lineup = draftState.lineup.slots.map(s => s.player!).filter(Boolean);
  const teamStrength = calculateTeamStrength(lineup as any[]);
  const projectedWins = getWinProjection(teamStrength);

  useEffect(() => {
    if (historicalTeams.length === 0) {
      fetch('/api/simulation/historical-teams')
        .then(res => res.json())
        .then(data => {
          if (data.teams) {
            // We need to set this in the store, but for now we'll use local state
          }
        });
    }
  }, []);

  const handleStartVS = async () => {
    if (!selectedTeam) return;
    setIsLoading(true);
    try {
      await startVSMode(selectedTeam.id, seriesLength);
    } catch (error) {
      console.error('VS Mode failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (vsMatchup) {
    return <VSModeResult matchup={vsMatchup} onBack={() => { setVSMatchup(null); setPhase('results'); }} />;
  }

  return (
    <div className="min-h-screen bg-broadcast-dark">
      <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-broadcast-dark/95 to-transparent pb-4">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.button
                onClick={onBack}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-lg bg-broadcast-card border border-broadcast-border hover:border-broadcast-accent/50 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-broadcast-text-secondary" />
              </motion.button>
              <div>
                <h1 className="font-display text-2xl font-bold gradient-text">VS MODE</h1>
                <p className="text-xs text-broadcast-text-secondary">CHALLENGE AN ALL-TIME GREAT TEAM</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-broadcast-card border border-broadcast-border rounded-lg text-sm font-medium text-broadcast-text-secondary">
                YOUR TEAM: {teamStrength} STR
              </span>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 pb-20 pt-20">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card-elevated p-6">
              <h3 className="section-title font-display text-lg mb-4">SELECT OPPONENT</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {historicalTeams.map(team => (
                  <motion.button
                    key={team.id}
                    onClick={() => setSelectedTeam(team)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      'relative p-4 rounded-xl text-left transition-all',
                      selectedTeam?.id === team.id
                        ? 'border-2 border-broadcast-gold bg-broadcast-gold/5 shadow-glow-gold'
                        : 'border border-broadcast-border hover:border-broadcast-accent/50 bg-broadcast-card'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-broadcast-gold/20 flex items-center justify-center">
                        <Crown className="w-6 h-6 text-broadcast-gold" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-white">{team.name}</h4>
                        <p className="text-sm text-broadcast-text-secondary">{team.season} • {team.record}</p>
                      </div>
                      {selectedTeam?.id === team.id && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-broadcast-gold flex items-center justify-center">
                          <Star className="w-3 h-3 text-broadcast-dark" />
                        </div>
                      )}
                    </div>
                    <p className="mt-3 text-sm text-broadcast-text-muted line-clamp-2">{team.description}</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-broadcast-text-secondary">
                      <span className="px-2 py-0.5 bg-broadcast-border rounded">{team.championships}🏆</span>
                      <span>•</span>
                      <span>Legends: {team.players.slice(0, 3).map(p => p.name).join(', ')}...</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="card-elevated p-6">
              <h3 className="section-title font-display text-lg mb-4">SERIES FORMAT</h3>
              <div className="flex gap-4">
                {([1, 7] as const).map(length => (
                  <button
                    key={length}
                    onClick={() => setSeriesLength(length)}
                    className={cn(
                      'flex-1 py-4 rounded-xl font-medium transition-all',
                      seriesLength === length
                        ? 'bg-broadcast-accent text-broadcast-dark shadow-glow-accent'
                        : 'bg-broadcast-card border border-broadcast-border text-broadcast-text-secondary hover:border-broadcast-accent/50'
                    )}
                  >
                    <div className="text-center">
                      <div className="font-display text-2xl font-bold">{length}</div>
                      <div className="text-sm">{length === 1 ? 'SINGLE GAME' : '7-GAME SERIES'}</div>
                      <div className="text-xs text-broadcast-text-muted mt-1">
                        {length === 1 ? 'Winner takes all' : 'First to 4 wins'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="card-elevated p-6">
              <h3 className="section-title font-display text-lg mb-4">YOUR LINEUP</h3>
              <div className="space-y-2">
                {lineup.map((player, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-broadcast-darker rounded-lg">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
                      style={{ backgroundColor: getPositionColor(player.position) }}>
                      {player.position}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-white">{player.name}</div>
                      <div className="text-xs text-broadcast-text-secondary">{player.team.toUpperCase()} • {player.decade} • {player.overall} OVR</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-broadcast-accent">{player.stats.pts} PPG</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              <div className="card-elevated p-6 text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-broadcast-accent to-broadcast-gold flex items-center justify-center">
                  <Zap className="w-10 h-10 text-broadcast-dark" />
                </div>
                <h3 className="font-display text-xl font-bold mb-2">DYNASTY VS LEGENDS</h3>
                <p className="text-broadcast-text-secondary text-sm mb-4">
                  Pit your drafted lineup against the greatest teams in NBA history. Can you dethrone the 96 Bulls? Outrun the 17 Warriors?
                </p>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="p-3 bg-broadcast-darker rounded-lg">
                    <div className="font-display text-2xl font-bold text-broadcast-accent">{teamStrength}</div>
                    <div className="text-xs text-broadcast-text-muted">TEAM STR</div>
                  </div>
                  <div className="p-3 bg-broadcast-darker rounded-lg">
                    <div className="font-display text-2xl font-bold text-broadcast-gold">{projectedWins}-{82 - projectedWins}</div>
                    <div className="text-xs text-broadcast-text-muted">PROJ RECORD</div>
                  </div>
                </div>
              </div>

              {selectedTeam && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card-elevated p-6"
                >
                  <h4 className="font-medium text-broadcast-text-secondary mb-4">SCOUTING REPORT</h4>
                  <div className="space-y-3">
                    <ScoutingRow label="ERA" value={selectedTeam.players[0]?.era || 'Unknown'} />
                    <ScoutingRow label="RECORD" value={selectedTeam.record} />
                    <ScoutingRow label="TITLES" value={`${selectedTeam.championships} CHAMPIONSHIPS`} />
                    <ScoutingRow label="KEY PLAYERS" value={selectedTeam.players.slice(0, 3).map(p => p.name).join(', ')} />
                    <div className="pt-3 border-t border-broadcast-border">
                      <p className="text-sm text-broadcast-text-muted">{selectedTeam.description}</p>
                    </div>
                  </div>
                </motion.div>
              )}

              <motion.button
                onClick={handleStartVS}
                disabled={!selectedTeam || isLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  'w-full btn-gold py-4 text-lg font-semibold gap-2',
                  !selectedTeam && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Trophy className="w-6 h-6" />
                {isLoading ? 'SIMULATING...' : `CHALLENGE ${selectedTeam?.name.toUpperCase() || 'A LEGEND'}`}
              </motion.button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ScoutingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-broadcast-text-muted uppercase tracking-wider">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

function VSModeResult({ matchup, onBack }: { matchup: VSModeMatchup; onBack: () => void }) {
  const { result, historicalTeam, games, userWins, historicalWins, seriesWinner } = matchup as any;
  const userWon = seriesWinner === 'user';

  return (
    <div className="min-h-screen bg-broadcast-dark">
      <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-broadcast-dark/95 to-transparent pb-4">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <motion.button
              onClick={onBack}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 rounded-lg bg-broadcast-card border border-broadcast-border hover:border-broadcast-accent/50 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-broadcast-text-secondary" />
            </motion.button>
            <div>
              <h1 className="font-display text-2xl font-bold gradient-text">SERIES COMPLETE</h1>
              <p className="text-xs text-broadcast-text-secondary">{userWins}-{historicalWins} • {userWon ? 'VICTORY' : 'DEFEAT'}</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 pb-20 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full mb-4"
            style={{
              backgroundColor: userWon ? 'rgba(0, 212, 170, 0.2)' : 'rgba(255, 59, 48, 0.2)',
              border: userWon ? '1px solid rgba(0, 212, 170, 0.3)' : '1px solid rgba(255, 59, 48, 0.3)'
            }}
          >
            <Trophy className={cn('w-6 h-6', userWon ? 'text-broadcast-accent' : 'text-broadcast-red')} />
            <span className="font-display text-xl font-bold" style={{ color: userWon ? '#00d4aa' : '#ff3b30' }}>
              {userWon ? 'SERIES VICTORY' : 'SERIES DEFEAT'}
            </span>
          </div>
          <div className="text-4xl font-display font-bold gradient-text mb-2">{userWins}-{historicalWins}</div>
          <div className="text-broadcast-text-secondary">vs {historicalTeam.name}</div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <GameCards games={games} />
        </div>

        {games.length > 0 && (
          <AnimatePresence mode="wait">
            <motion.div
              key="boxscore"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="card-elevated"
            >
              <div className="p-4 border-b border-broadcast-border">
                <h3 className="section-title font-display text-lg">GAME BOX SCORES</h3>
              </div>
              <div className="p-4 overflow-x-auto">
                {games.map((game: any, i: number) => (
                  <BoxScoreTable key={game.gameNumber} game={game} index={i} historicalTeam={historicalTeam} />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        <div className="flex flex-wrap items-center justify-center gap-4">
          <motion.button
            onClick={onBack}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn-secondary px-8 py-3"
          >
            BACK TO RESULTS
          </motion.button>
        </div>
      </main>
    </div>
  );
}

function GameCards({ games }: { games: any[] }) {
  return (
    <div className="space-y-3">
      {games.map((game: VSSeriesResult) => (
        <motion.div
          key={game.gameNumber}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-broadcast-text-muted">GAME {game.gameNumber}</span>
            <span className={cn(
              'px-3 py-1 rounded-full text-sm font-bold',
              game.winner === 'user' ? 'bg-broadcast-accent/20 text-broadcast-accent' : 'bg-broadcast-red/20 text-broadcast-red'
            )}>
              {game.winner === 'user' ? 'W' : 'L'}
            </span>
          </div>
          <div className="flex items-center justify-between text-lg font-display font-bold">
            <span style={{ color: game.winner === 'user' ? '#00d4aa' : '#ff3b30' }}>{game.score.user}</span>
            <span className="text-broadcast-text-muted">-</span>
            <span style={{ color: game.winner === 'historical' ? '#00d4aa' : '#ff3b30' }}>{game.score.historical}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function BoxScoreTable({ game, index, historicalTeam }: { game: any; index: number; historicalTeam: HistoricalTeam }) {
  const isUserWinner = game.winner === 'user';

  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-broadcast-border">
        <h4 className="font-medium">GAME {game.gameNumber} • {isUserWinner ? 'VICTORY' : 'DEFEAT'}</h4>
        <span className="font-display text-xl font-bold" style={{ color: isUserWinner ? '#00d4aa' : '#ff3b30' }}>
          {game.score.user} - {game.score.historical}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h5 className="text-sm text-broadcast-text-secondary mb-2">YOUR TEAM</h5>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-broadcast-border text-broadcast-text-muted">
                <th className="text-left py-1">PLAYER</th>
                <th className="text-center py-1">PTS</th>
                <th className="text-center py-1">REB</th>
                <th className="text-center py-1">AST</th>
              </tr>
            </thead>
            <tbody>
              {game.boxScore.user.map((perf: PlayerGamePerformance) => (
                <tr key={perf.playerId} className="border-b border-broadcast-border/50">
                  <td className="py-1 font-medium">{perf.playerName}</td>
                  <td className="text-center py-1 text-broadcast-accent font-bold">{perf.stats.pts}</td>
                  <td className="text-center py-1 text-broadcast-gold font-bold">{perf.stats.reb}</td>
                  <td className="text-center py-1 text-blue-400 font-bold">{perf.stats.ast}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h5 className="text-sm text-broadcast-text-secondary mb-2">{historicalTeam.name.toUpperCase()}</h5>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-broadcast-border text-broadcast-text-muted">
                <th className="text-left py-1">PLAYER</th>
                <th className="text-center py-1">PTS</th>
                <th className="text-center py-1">REB</th>
                <th className="text-center py-1">AST</th>
              </tr>
            </thead>
            <tbody>
              {game.boxScore.historical.map((perf: PlayerGamePerformance) => (
                <tr key={perf.playerId} className="border-b border-broadcast-border/50">
                  <td className="py-1 font-medium">{perf.playerName}</td>
                  <td className="text-center py-1 text-broadcast-accent font-bold">{perf.stats.pts}</td>
                  <td className="text-center py-1 text-broadcast-gold font-bold">{perf.stats.reb}</td>
                  <td className="text-center py-1 text-blue-400 font-bold">{perf.stats.ast}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function getPositionColor(position: Position): string {
  const colors: Record<Position, string> = {
    PG: '#00d4aa',
    SG: '#ffd700',
    SF: '#ff6b6b',
    PF: '#7c5cff',
    C: '#007aff',
  };
  return colors[position];
}