import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Trophy, Zap, Crown, Star } from 'lucide-react';
import { cn, getPositionColor, calculateTeamStrength, getWinProjection, otLabel } from '../../utils/helpers';
import { useGameStore } from '../../store/gameStore';
import { notify } from '../../store/toastStore';
import { api } from '../../utils/api';
import type { HistoricalTeam, VSModeMatchup, VSSeriesResult, PlayerGamePerformance, Player } from '../../types/game';

interface VSModeScreenProps {
  onBack: () => void;
}

export function VSModeScreen({ onBack }: VSModeScreenProps) {
  const {
    draftState,
    vsMatchup,
    historicalTeams,
    setHistoricalTeams,
    startVSMode,
    setPhase,
    setVSMatchup,
  } = useGameStore();

  const [selectedTeam, setSelectedTeam] = useState<HistoricalTeam | null>(null);
  const [seriesLength, setSeriesLength] = useState<1 | 7>(7);
  const [isLoading, setIsLoading] = useState(false);

  const lineup = draftState.lineup.slots.map(s => s.player).filter((p): p is Player => p !== null);
  const sixthManId = draftState.lineup.slots.find(s => s.isSixthMan && s.player)?.player?.id;
  const teamStrength = calculateTeamStrength(lineup, sixthManId);
  const projectedWins = getWinProjection(teamStrength);

  useEffect(() => {
    if (historicalTeams.length === 0) {
      api.simulation.getHistoricalTeams()
        .then(data => setHistoricalTeams(data.teams))
        .catch((err) => notify.error(err instanceof Error ? err.message : 'Failed to load historical teams'));
    }
  }, [historicalTeams.length, setHistoricalTeams]);

  const handleStartVS = async () => {
    if (!selectedTeam) return;
    setIsLoading(true);
    try {
      await startVSMode(selectedTeam.id, seriesLength);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'VS Mode failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (vsMatchup) {
    return <VSModeResult matchup={vsMatchup} onBack={() => { setVSMatchup(null); setPhase('results'); }} />;
  }

  return (
    <div className="min-h-screen bg-broadcast-dark">
      <div className="sticky top-0 z-40 bg-broadcast-dark/95 backdrop-blur border-b border-broadcast-border/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.button
                onClick={onBack}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-lg bg-broadcast-card border border-broadcast-border hover:border-broadcast-accent/50 transition-colors"
                aria-label="Back"
              >
                <ChevronLeft className="w-5 h-5 text-broadcast-text-secondary" aria-hidden="true" />
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

      <main className="max-w-7xl mx-auto px-4 py-6 pb-20">
        {historicalTeams.length === 0 && (
          <div className="text-center py-12 text-broadcast-text-secondary" role="status">Loading legendary opponents...</div>
        )}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card-elevated p-6">
              <h3 className="section-title font-display text-lg mb-4">SELECT OPPONENT</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Historical opponents">
                {historicalTeams.map(team => (
                  <motion.button
                    key={team.id}
                    role="radio"
                    aria-checked={selectedTeam?.id === team.id}
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
                        <Crown className="w-6 h-6 text-broadcast-gold" aria-hidden="true" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-white">{team.name}</h4>
                        <p className="text-sm text-broadcast-text-secondary">{team.season} • {team.record}</p>
                      </div>
                      {selectedTeam?.id === team.id && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-broadcast-gold flex items-center justify-center">
                          <Star className="w-3 h-3 text-broadcast-dark" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <p className="mt-3 text-sm text-broadcast-text-muted line-clamp-2">{team.description}</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-broadcast-text-secondary">
                      <span className="px-2 py-0.5 bg-broadcast-border rounded">{team.championships} title{team.championships === 1 ? '' : 's'}</span>
                      <span aria-hidden="true">•</span>
                      <span>Legends: {team.players.length > 0 ? `${team.players.slice(0, 3).map(p => p.name).join(', ')}${team.players.length > 3 ? '…' : ''}` : 'Roster loading…'}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="card-elevated p-6">
              <h3 className="section-title font-display text-lg mb-4">SERIES FORMAT</h3>
              <div className="flex gap-4" role="radiogroup" aria-label="Series length">
                {([1, 7] as const).map(length => (
                  <button
                    key={length}
                    role="radio"
                    aria-checked={seriesLength === length}
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
                      <div className="text-xs opacity-70 mt-1">
                        {length === 1 ? 'Winner takes all' : 'First to 4 wins'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="card-elevated p-6">
              <h3 className="section-title font-display text-lg mb-4">YOUR LINEUP ({lineup.length})</h3>
              <div className="space-y-2">
                {lineup.map((player) => (
                  <div key={player.id} className="flex items-center gap-3 p-3 bg-broadcast-darker rounded-lg">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
                      style={{ backgroundColor: getPositionColor(player.position) }}>
                      {player.position}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-white">
                        {player.name}
                        {sixthManId === player.id && (
                          <span className="ml-2 rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-broadcast-gold">6TH MAN</span>
                        )}
                      </div>
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
                  <Zap className="w-10 h-10 text-broadcast-dark" aria-hidden="true" />
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
                    <ScoutingRow label="TITLES" value={`${selectedTeam.championships} CHAMPIONSHIP${selectedTeam.championships === 1 ? '' : 'S'}`} />
                    <ScoutingRow label="KEY PLAYERS" value={selectedTeam.players.length > 0 ? selectedTeam.players.slice(0, 3).map(p => p.name).join(', ') : 'Unknown'} />
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
                <Trophy className="w-6 h-6" aria-hidden="true" />
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
      <span className="font-medium text-white text-right ml-4">{value}</span>
    </div>
  );
}

function VSModeResult({ matchup, onBack }: { matchup: VSModeMatchup; onBack: () => void }) {
  const games = matchup.games ?? matchup.results ?? [];
  const historicalTeam = matchup.historicalTeam;
  const userWins = matchup.userWins ?? games.filter(g => g.winner === 'user').length;
  const historicalWins = matchup.historicalWins ?? games.filter(g => g.winner === 'historical').length;
  const seriesWinner = matchup.seriesWinner ?? (userWins > historicalWins ? 'user' : 'historical');
  const userWon = seriesWinner === 'user';

  if (!historicalTeam || games.length === 0) {
    return (
      <div className="min-h-screen bg-broadcast-dark flex items-center justify-center px-4">
        <div className="text-center" role="alert">
          <h1 className="font-display text-2xl font-bold text-white mb-2">Series data missing</h1>
          <p className="text-broadcast-text-secondary mb-4">The VS result came back incomplete.</p>
          <button onClick={onBack} className="btn-secondary px-6 py-3">BACK TO RESULTS</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-broadcast-dark">
      <div className="sticky top-0 z-40 bg-broadcast-dark/95 backdrop-blur border-b border-broadcast-border/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <motion.button
              onClick={onBack}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 rounded-lg bg-broadcast-card border border-broadcast-border hover:border-broadcast-accent/50 transition-colors"
              aria-label="Back to results"
            >
              <ChevronLeft className="w-5 h-5 text-broadcast-text-secondary" aria-hidden="true" />
            </motion.button>
            <div>
              <h1 className="font-display text-2xl font-bold gradient-text">SERIES COMPLETE</h1>
              <p className="text-xs text-broadcast-text-secondary">{userWins}-{historicalWins} • {userWon ? 'VICTORY' : 'DEFEAT'}</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 pb-20">
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
            <Trophy className={cn('w-6 h-6', userWon ? 'text-broadcast-accent' : 'text-broadcast-red')} aria-hidden="true" />
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
                {games.map((game, i) => (
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

function GameCards({ games }: { games: VSSeriesResult[] }) {
  return (
    <div className="space-y-3 md:col-span-2">
      {games.map((game: VSSeriesResult) => (
        <motion.div
          key={game.gameNumber}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-broadcast-text-muted">
              GAME {game.gameNumber}
              {otLabel(game.otPeriods) && (
                <span className="ml-1.5 rounded bg-broadcast-gold/20 px-1.5 py-px text-xs font-bold text-broadcast-gold">
                  {otLabel(game.otPeriods)}
                </span>
              )}
            </span>
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

function BoxScoreTable({ game, index, historicalTeam }: { game: VSSeriesResult; index: number; historicalTeam: HistoricalTeam }) {
  void index;
  const isUserWinner = game.winner === 'user';

  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-broadcast-border">
        <h4 className="font-medium">
          GAME {game.gameNumber} • {isUserWinner ? 'VICTORY' : 'DEFEAT'}
          {otLabel(game.otPeriods) ? ` • ${otLabel(game.otPeriods)}` : ''}
        </h4>
        <span className="font-display text-xl font-bold" style={{ color: isUserWinner ? '#00d4aa' : '#ff3b30' }}>
          {game.score.user} - {game.score.historical}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h5 className="text-sm text-broadcast-text-secondary mb-2">YOUR TEAM</h5>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-broadcast-border text-broadcast-text-muted">
                <th scope="col" className="text-left py-1">PLAYER</th>
                <th scope="col" className="text-center py-1">PTS</th>
                <th scope="col" className="text-center py-1">REB</th>
                <th scope="col" className="text-center py-1">AST</th>
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
                <th scope="col" className="text-left py-1">PLAYER</th>
                <th scope="col" className="text-center py-1">PTS</th>
                <th scope="col" className="text-center py-1">REB</th>
                <th scope="col" className="text-center py-1">AST</th>
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
