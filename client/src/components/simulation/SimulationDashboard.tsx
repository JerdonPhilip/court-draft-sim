import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Award,
  BarChart2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
  ListOrdered,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { formatTeamName, otLabel } from '../../utils/helpers';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { api } from '../../utils/api';
import { notify } from '../../store/toastStore';
import { useGameStore } from '../../store/gameStore';
import type {
  GameResult,
  Player,
  PlayerGamePerformance,
  PlayerStats,
  PlayoffGameResult,
  SimulatedPlayerStats,
  SimulationResult,
} from '../../types/game';
import {
  allPlayoffSeriesKeys,
  awardScore,
  buildLeagueRows,
  buildOpponentPlayoffRoster,
  buildPlayoffTeams,
  buildSeasonAverageById,
  buildUserPlayoffLineup,
  fullTeamName,
  getClutchPlayer,
  getPlayoffParticipants,
  getSeedLabel,
  getStreak,
  isByeTeam,
  isPlaceholderTeam,
  makeFirstRound,
  normalizeTeamName,
  playoffSeriesRound,
  seasonAverageFor,
  selectTeam,
  simulatePlayoffSeriesWinner,
  teamAbbreviation,
  toCompactName,
  type LeagueRow,
} from './dashboardUtils';

interface SimulationDashboardProps {
  result: SimulationResult;
  onNewDraft: () => void;
  onVSMode: () => void;
}

/** Stable fingerprint of a simulated season — bracket progress restores only onto a match. */
function playoffSeasonKey(result: SimulationResult): string {
  const games = result.games;
  const first = games[0];
  const last = games[games.length - 1];
  return [
    result.wins,
    result.losses,
    result.era?.id ?? 'mixed',
    games.length,
    first ? `${first.opponent}:${first.score.us}-${first.score.them}` : 'none',
    last ? `${last.opponent}:${last.score.us}-${last.score.them}` : 'none',
    result.playerStats.map((p) => p.playerId).join(','),
  ].join('|');
}

const STAT_LABELS: Record<keyof PlayerStats, string> = {
  pts: 'POINTS',
  reb: 'REBOUNDS',
  ast: 'ASSISTS',
  stl: 'STEALS',
  blk: 'BLOCKS',
  pf: 'FOULS',
};

const STAT_COLORS: Record<keyof PlayerStats, string> = {
  pts: '#00d4aa',
  reb: '#ffd700',
  ast: '#007aff',
  stl: '#34c759',
  blk: '#af52de',
  pf: '#ff9f0a',
};

type SeasonView = 'overview' | 'games' | 'standings' | 'players' | 'teams' | 'league' | 'awards' | 'playoffs';

const SEASON_VIEWS: Array<{ id: SeasonView; label: string; Icon: typeof Trophy }> = [
  { id: 'overview', label: 'OVERVIEW', Icon: BarChart2 },
  { id: 'games', label: 'GAMES', Icon: Calendar },
  { id: 'standings', label: 'STANDINGS', Icon: ListOrdered },
  { id: 'players', label: 'MY TEAM', Icon: Target },
  { id: 'teams', label: 'TEAMS', Icon: Shield },
  { id: 'league', label: 'LEAGUE STATS', Icon: Users },
  { id: 'awards', label: 'AWARDS', Icon: Award },
  { id: 'playoffs', label: 'PLAYOFFS', Icon: Trophy },
];

export function SimulationDashboard({ result, onNewDraft, onVSMode }: SimulationDashboardProps) {
  const [view, setView] = useState<SeasonView>('overview');
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);
  // Playoff bracket state lives here (not in PlayoffsView) so switching
  // tabs doesn't wipe winners / restart background sims. It is also mirrored
  // to localStorage per season so a browser reload resumes mid-playoffs.
  const seasonKey = useMemo(() => playoffSeasonKey(result), [result]);
  const restoredProgress = useMemo(() => {
    const saved = useGameStore.getState().playoffProgress;
    return saved && saved.seasonKey === seasonKey ? saved : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonKey]);
  const [playoffWinners, setPlayoffWinners] = useState<Record<string, string>>(() => restoredProgress?.winners ?? {});
  const [playoffsStarted, setPlayoffsStarted] = useState<boolean>(() => restoredProgress?.hasStarted ?? false);
  // Every game of YOUR played series, kept after the modal closes so finished
  // rounds (R1 → Finals) can be re-opened and reviewed any time.
  const [playoffSeriesGames, setPlayoffSeriesGames] = useState<Record<string, PlayoffGameResult[]>>(
    () => restoredProgress?.seriesGames ?? {},
  );
  // One-shot result card after YOUR series ends (advance / eliminated / champion).
  const [advancement, setAdvancement] = useState<{ seriesKey: string; winner: string; userTeamName: string } | null>(null);
  const [selectedPlayoffSeries, setSelectedPlayoffSeries] = useState<{
    home: string;
    away: string;
    userTeamName: string;
    seriesKey: string;
    readOnly: boolean;
    // games = full series log (see PlayoffsModal: the clinching game's save
    // must travel with completion — relying on the child's save effect alone
    // loses it when completion unmounts the modal in the same task).
    onComplete: (winner: string, games?: PlayoffGameResult[]) => void;
  } | null>(null);

  // New season => fresh bracket. Guarded by seasonKey so a remount/reload
  // with the SAME season restores progress instead of wiping it.
  const seasonKeyRef = useRef(seasonKey);
  useEffect(() => {
    if (seasonKeyRef.current === seasonKey) return;
    seasonKeyRef.current = seasonKey;
    setPlayoffWinners({});
    setPlayoffsStarted(false);
    setPlayoffSeriesGames({});
    setAdvancement(null);
    useGameStore.getState().setPlayoffProgress(null);
    setSelectedPlayoffSeries(null);
    setView('overview');
    setSelectedGame(null);
  }, [seasonKey, result]);

  // Mirror bracket progress to localStorage (per season) for reload recovery.
  useEffect(() => {
    useGameStore.getState().setPlayoffProgress({
      seasonKey,
      winners: playoffWinners,
      hasStarted: playoffsStarted,
      seriesGames: playoffSeriesGames,
    });
  }, [seasonKey, playoffWinners, playoffsStarted, playoffSeriesGames]);

  const totalGames = result.games.length || 1;
  const winPctNum = totalGames > 0 ? result.wins / totalGames : 0;
  const record = `${result.wins}-${result.losses}`;
  const winPct = `${(winPctNum * 100).toFixed(1)}`;
  const isUndefeated = result.losses === 0 && result.wins > 0;
  const isChampionship = winPctNum >= 0.79;
  const isPlayoffTeam = winPctNum >= 0.61;
  const streak = useMemo(() => getStreak(result.games), [result.games]);
  const teamAvgPts = result.teamStats?.avgPts ?? 0;

  const handleOpenPlayoffSeries = useCallback(
    (home: string, away: string, userTeamName: string, seriesKey: string, onComplete: (winner: string, games?: PlayoffGameResult[]) => void) => {
      setSelectedPlayoffSeries({ home, away, userTeamName, seriesKey, readOnly: false, onComplete });
    },
    [],
  );

  const handleReviewPlayoffSeries = useCallback((home: string, away: string, userTeamName: string, seriesKey: string) => {
    setSelectedPlayoffSeries({ home, away, userTeamName, seriesKey, readOnly: true, onComplete: () => {} });
  }, []);

  const handleSeriesGamesUpdate = useCallback((seriesKey: string, games: PlayoffGameResult[]) => {
    setPlayoffSeriesGames((previous) => {
      const current = previous[seriesKey];
      if (current === games || (current && current.length === games.length)) return previous;
      return { ...previous, [seriesKey]: games };
    });
  }, []);

  // Live derivation for the advancement card: series score from saved games
  // (your squad is always the recorded home side), next opponent resolved
  // against the current bracket (TBD while their series still sims).
  const advancementInfo = useMemo(() => {
    if (!advancement) return null;
    const { seriesKey, winner, userTeamName } = advancement;
    const round = playoffSeriesRound(seriesKey);
    const roundLabel =
      round === 0 ? 'FIRST ROUND' : round === 1 ? 'CONFERENCE SEMIFINALS' : round === 2 ? 'CONFERENCE FINALS' : 'NBA FINALS';
    const nextLabel = round === 0 ? 'Conference Semifinals' : round === 1 ? 'Conference Finals' : round === 2 ? 'NBA Finals' : null;
    const games = playoffSeriesGames[seriesKey] ?? [];
    let userWins = 0;
    let oppWins = 0;
    for (const g of games) {
      if (g.homeScore > g.awayScore) userWins++;
      else if (g.awayScore > g.homeScore) oppWins++;
    }
    const teams = buildPlayoffTeams(result.standings);
    const parts = getPlayoffParticipants(makeFirstRound(teams.east), makeFirstRound(teams.west), playoffWinners, seriesKey);
    const opponent = !parts ? 'TBD' : parts.home === userTeamName ? parts.away : parts.away === userTeamName ? parts.home : 'TBD';
    let nextOpponent: string | null = null;
    if (winner === userTeamName && round < 3) {
      const nextKeys = allPlayoffSeriesKeys().filter((k) => playoffSeriesRound(k) === round + 1);
      for (const k of nextKeys) {
        const np = getPlayoffParticipants(makeFirstRound(teams.east), makeFirstRound(teams.west), playoffWinners, k);
        if (np && (np.home === userTeamName || np.away === userTeamName)) {
          const other = np.home === userTeamName ? np.away : np.home;
          nextOpponent = isPlaceholderTeam(other) ? null : other;
          break;
        }
      }
    }
    return {
      seriesKey, winner, userTeamName, round, roundLabel, nextLabel,
      userWon: winner === userTeamName, champion: round === 3 && winner === userTeamName,
      gamesPlayed: games.length, userWins, oppWins, opponent, nextOpponent,
      eraLabel: result.era?.label ?? '2020s',
    };
  }, [advancement, playoffSeriesGames, playoffWinners, result.standings, result.era]);

  return (
    <div className="min-h-screen bg-broadcast-dark">
      <div className="sticky top-0 z-40 bg-broadcast-dark/95 backdrop-blur border-b border-broadcast-border/50">
        <div className="max-w-7xl mx-auto px-4 py-2.5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onNewDraft}
                className="p-2 rounded-lg bg-broadcast-card border border-broadcast-border hover:border-broadcast-accent/50 transition-colors"
                aria-label="Back to draft"
              >
                <ChevronRight className="w-5 h-5 text-broadcast-text-secondary rotate-180" aria-hidden="true" />
              </button>
              <div>
                <h1 className="font-display text-2xl font-bold gradient-text">SEASON COMPLETE</h1>
                <p className="text-xs text-broadcast-text-secondary">
                  {record} • {winPct}% WIN PCT • {teamAvgPts.toFixed(1)} PPG
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full text-sm font-bold bg-broadcast-card border border-broadcast-border text-broadcast-text-secondary">
                {result.era ? `${result.era.label.toUpperCase()} LEAGUE` : 'MIXED LEAGUE'}
              </span>
              <span
                className={cn(
                  'px-3 py-1 rounded-full text-sm font-bold',
                  isUndefeated
                    ? 'bg-broadcast-gold/20 text-broadcast-gold border border-broadcast-gold/30'
                    : isChampionship
                      ? 'bg-broadcast-accent/20 text-broadcast-accent border border-broadcast-accent/30'
                      : isPlayoffTeam
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-broadcast-border text-broadcast-text-secondary',
                )}
              >
                {isUndefeated ? 'PERFECT SEASON' : isChampionship ? 'CHAMPIONSHIP CALIBER' : isPlayoffTeam ? 'PLAYOFF TEAM' : 'LOTTERY BOUND'}
              </span>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2" role="tablist" aria-label="Season views">
            {SEASON_VIEWS.map(({ id, label, Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  view === id
                    ? 'bg-broadcast-accent text-broadcast-dark shadow-glow-accent'
                    : 'bg-broadcast-card border border-broadcast-border text-broadcast-text-secondary hover:text-white hover:border-broadcast-accent/50',
                )}
              >
                <Icon className="w-4 h-4 inline mr-1" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-4 pb-8">
        <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
          {view === 'overview' && (
            <OverviewView result={result} streak={streak} isUndefeated={isUndefeated} isChampionship={isChampionship} totalGames={totalGames} />
          )}
          {view === 'games' && <GamesView result={result} onSelectGame={setSelectedGame} />}
          {view === 'standings' && <StandingsView result={result} />}
          {view === 'players' && <PlayersView result={result} />}
          {view === 'teams' && <TeamsView result={result} />}
          {view === 'league' && <LeagueView result={result} />}
          {view === 'awards' && <AwardsView result={result} />}
          {/* Keep the bracket mounted (hidden) so tab switches never wipe winners or kill the background sim. */}
          <div hidden={view !== 'playoffs'}>
            <PlayoffsView
              result={result}
              onOpen={handleOpenPlayoffSeries}
              onReview={handleReviewPlayoffSeries}
              winners={playoffWinners}
              setWinners={setPlayoffWinners}
              hasStarted={playoffsStarted}
              setHasStarted={setPlayoffsStarted}
              seriesGames={playoffSeriesGames}
              onSeriesGames={handleSeriesGamesUpdate}
              onResetBracket={() => {
                setPlayoffSeriesGames({});
                setAdvancement(null);
              }}
            />
          </div>
        </motion.div>

        {selectedGame && <GameBoxScoreModal game={selectedGame} result={result} onClose={() => setSelectedGame(null)} />}
        {selectedPlayoffSeries && (
          <PlayoffsModal
            key={selectedPlayoffSeries.seriesKey}
            result={result}
            userTeamName={selectedPlayoffSeries.userTeamName}
            homeName={(() => {
              const sel = selectedPlayoffSeries;
              const involvesUser = sel.home === sel.userTeamName || sel.away === sel.userTeamName;
              // Your squad always plays as the recorded home side; CPU-only
              // reviews keep bracket-home alignment from the background sim.
              return involvesUser ? sel.userTeamName : sel.home;
            })()}
            awayName={(() => {
              const sel = selectedPlayoffSeries;
              if (sel.home === sel.userTeamName) return sel.away;
              if (sel.away === sel.userTeamName) return sel.home;
              return sel.away;
            })()}
            seriesKey={selectedPlayoffSeries.seriesKey}
            readOnly={selectedPlayoffSeries.readOnly}
            initialGames={playoffSeriesGames[selectedPlayoffSeries.seriesKey] ?? []}
            onGamesUpdate={handleSeriesGamesUpdate}
            onSeriesComplete={(winner, games) => {
              selectedPlayoffSeries.onComplete(winner, games);
              setSelectedPlayoffSeries(null);
              if (!selectedPlayoffSeries.readOnly) {
                setAdvancement({
                  seriesKey: selectedPlayoffSeries.seriesKey,
                  winner,
                  userTeamName: selectedPlayoffSeries.userTeamName,
                });
              }
            }}
            onClose={() => setSelectedPlayoffSeries(null)}
          />
        )}
        {advancement && (
          <SeriesAdvancementModal info={advancementInfo} onClose={() => setAdvancement(null)} />
        )}

        {view === 'overview' && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button onClick={onVSMode} className="btn-gold px-6 py-2.5 text-base gap-2">
              <Trophy className="w-5 h-5" aria-hidden="true" />
              VS MODE: CHALLENGE A LEGEND
            </button>
            <button onClick={onNewDraft} className="btn-secondary px-6 py-2.5 text-base">
              NEW DRAFT
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export interface AdvancementInfo {
  seriesKey: string;
  winner: string;
  userTeamName: string;
  round: number;
  roundLabel: string;
  nextLabel: string | null;
  userWon: boolean;
  champion: boolean;
  gamesPlayed: number;
  userWins: number;
  oppWins: number;
  opponent: string;
  nextOpponent: string | null;
  eraLabel: string;
}

function SeriesAdvancementModal({ info, onClose }: { info: AdvancementInfo | null; onClose: () => void }) {
  useLockBodyScroll(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!info) return null;

  const runnerUp = info.round === 3 && !info.userWon;
  const Icon = info.champion ? Trophy : info.userWon ? TrendingUp : TrendingDown;
  const iconClass = info.champion
    ? 'bg-broadcast-gold/20 text-broadcast-gold border-broadcast-gold/40'
    : info.userWon
      ? 'bg-broadcast-accent/15 text-broadcast-accent border-broadcast-accent/40'
      : 'bg-broadcast-red/15 text-broadcast-red border-broadcast-red/40';
  const eyebrow = info.champion
    ? `${info.eraLabel.toUpperCase()} LEAGUE • NBA FINALS`
    : runnerUp
      ? `NBA FINALS • ${teamAbbreviation(info.opponent)} WINS ${info.oppWins}–${info.userWins}`
      : `${info.roundLabel} • YOU WIN ${info.userWins}–${info.oppWins}`;
  const title = info.champion ? 'NBA CHAMPIONS' : runnerUp ? 'RUNNER-UP' : info.userWon ? 'YOU ADVANCE' : 'ELIMINATED';
  const sub = info.champion ? (
    <>
      {teamAbbreviation(info.userTeamName)} take{info.gamesPlayed === 1 ? 's' : ''} the Finals {info.userWins}–{info.oppWins} over{' '}
      {teamAbbreviation(info.opponent)}.
    </>
  ) : runnerUp ? (
    <>
      {teamAbbreviation(info.opponent)} take{info.gamesPlayed === 1 ? 's' : ''} the Finals {info.oppWins}–{info.userWins}.
    </>
  ) : info.userWon ? (
    <>
      Next: the {info.nextLabel}
      {info.nextOpponent ? (
        <>
          {' '}vs <strong className="text-white" title={info.nextOpponent}>{teamAbbreviation(info.nextOpponent)}</strong>
        </>
      ) : (
        <> — opponent still to be decided.</>
      )}
    </>
  ) : (
    <>
      {teamAbbreviation(info.opponent)} win{info.gamesPlayed === 1 ? 's' : ''} the {info.roundLabel.toLowerCase()}{' '}
      {info.oppWins}–{info.userWins}
      {info.nextLabel ? ` and move on to the ${info.nextLabel.toLowerCase()}.` : '.'}
    </>
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-broadcast-dark/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-broadcast-border bg-broadcast-card p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cn('mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border', iconClass)}>
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="mt-4 text-xs font-bold tracking-widest text-broadcast-text-secondary">{eyebrow}</p>
        <h2 className="gradient-text mt-1 font-display text-4xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-broadcast-text-secondary" title={info.opponent}>
          {sub}
        </p>
        <button onClick={onClose} className="btn-primary mt-5 w-full py-2.5 text-sm" autoFocus>
          {info.champion ? 'LIFT THE TROPHY' : 'VIEW BRACKET'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewView({
  result,
  streak,
  isUndefeated,
  isChampionship,
  totalGames,
}: {
  result: SimulationResult;
  streak: { count: number; type: 'W' | 'L' };
  isUndefeated: boolean;
  isChampionship: boolean;
  totalGames: number;
}) {
  const winPct = totalGames > 0 ? ((result.wins / totalGames) * 100).toFixed(1) : '0.0';
  const teamStats = result.teamStats;
  const avgMetrics: Array<{ label: string; value: number; color: string }> = [
    { label: 'POINTS', value: teamStats?.avgPts ?? 0, color: STAT_COLORS.pts },
    { label: 'REBOUNDS', value: teamStats?.avgReb ?? 0, color: STAT_COLORS.reb },
    { label: 'ASSISTS', value: teamStats?.avgAst ?? 0, color: STAT_COLORS.ast },
    { label: 'STEALS', value: teamStats?.avgStl ?? 0, color: STAT_COLORS.stl },
    { label: 'BLOCKS', value: teamStats?.avgBlk ?? 0, color: STAT_COLORS.blk },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="FINAL RECORD"
          value={`${result.wins}-${result.losses}`}
          icon={Trophy}
          iconColor={isUndefeated ? 'text-broadcast-gold' : isChampionship ? 'text-broadcast-accent' : 'text-blue-400'}
          trend={result.wins > result.losses ? 'positive' : result.wins < result.losses ? 'negative' : undefined}
          trendLabel={result.wins === result.losses ? 'AT .500' : undefined}
        />
        <StatCard label="WIN %" value={`${winPct}%`} icon={TrendingUp} iconColor="text-broadcast-accent" />
        <StatCard
          label="ENDING STREAK"
          value={streak.count > 0 ? `${streak.count} ${streak.type}` : '—'}
          icon={streak.type === 'W' ? TrendingUp : TrendingDown}
          iconColor={streak.type === 'W' ? 'text-green-400' : 'text-red-400'}
        />
      </div>

      <div className="card-elevated p-4">
        <h3 className="section-title font-display text-xl mb-3">TEAM STATS</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <TeamMetric label="OFF RTG" value={(teamStats?.offensiveRating ?? 0).toFixed(1)} color="#00d4aa" />
          <TeamMetric label="DEF RTG" value={(teamStats?.defensiveRating ?? 0).toFixed(1)} color="#ff3b30" />
          <TeamMetric label="NET RTG" value={(teamStats?.netRating ?? 0).toFixed(1)} color="#ffd700" />
          <TeamMetric label="PACE" value={(teamStats?.pace ?? 0).toFixed(1)} color="#007aff" />
        </div>
        <div className="mt-2.5 grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {avgMetrics.map((m) => (
            <TeamMetric key={m.label} label={m.label} value={m.value.toFixed(1)} color={m.color} />
          ))}
        </div>
      </div>

      {isUndefeated && (
        <div className="relative p-8 bg-gradient-to-br from-broadcast-gold/10 to-broadcast-accent/10 border-2 border-broadcast-gold/50 rounded-2xl text-center overflow-hidden">
          <div className="relative z-10">
            <div className="text-6xl font-display font-bold gradient-text mb-4">{result.wins} - 0</div>
            <p className="text-broadcast-text-secondary text-lg mb-4">PERFECT SEASON ACHIEVED</p>
            <p className="text-broadcast-text-muted">You&apos;ve joined the immortals. The only team to ever go undefeated.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

const GameRow = memo(function GameRow({ game, onSelect }: { game: GameResult; onSelect: (g: GameResult) => void }) {
  return (
    <button
      type="button"
      className="card px-4 py-2.5 hover:shadow-broadcast transition-shadow cursor-pointer w-full text-left"
      onClick={() => onSelect(game)}
      aria-label={`Game ${game.gameNumber} vs ${game.opponent}: ${game.result}, ${game.score.us} to ${game.score.them}${
        otLabel(game.otPeriods) ? ` in ${otLabel(game.otPeriods)}` : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="w-10 shrink-0 text-right text-broadcast-text-muted font-mono text-sm">#{game.gameNumber}</span>
        <span
          className="shrink-0 px-2 py-0.5 rounded-md text-sm font-bold"
          style={{
            backgroundColor: game.result === 'W' ? 'rgba(0, 212, 170, 0.2)' : 'rgba(255, 59, 48, 0.2)',
            color: game.result === 'W' ? '#00d4aa' : '#ff3b30',
            border: game.result === 'W' ? '1px solid rgba(0, 212, 170, 0.3)' : '1px solid rgba(255, 59, 48, 0.3)',
          }}
        >
          {game.result}
        </span>
        <span className="shrink-0 font-mono font-bold text-lg">
          {game.score.us}-{game.score.them}
        </span>
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
    </button>
  );
});

function GamesView({ result, onSelectGame }: { result: SimulationResult; onSelectGame: (game: GameResult) => void }) {
  const reversed = useMemo(() => result.games.slice().reverse(), [result.games]);
  return (
    <div className="space-y-2">
      <p className="text-xs text-broadcast-text-muted px-1">
        82-game schedule is shuffled every season — opponents and home/away are drawn fresh, so no team is ever locked to game #82.
      </p>
      {reversed.map((game) => (
        <GameRow key={game.gameNumber} game={game} onSelect={onSelectGame} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// My team
// ---------------------------------------------------------------------------

interface RosterBadge {
  label: string;
  className: string;
}

function RosterTable({
  groups,
  badgeFor,
}: {
  groups: Array<{ label: string; rows: SimulatedPlayerStats[] }>;
  badgeFor: (playerId: string) => RosterBadge[];
}) {
  const statKeys = Object.keys(STAT_LABELS) as Array<keyof PlayerStats>;
  const total = groups.reduce((t, g) => t + g.rows.length, 0);
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-broadcast-text-muted">
              <th scope="col" className="px-4 py-2.5 font-semibold">Player</th>
              {statKeys.map((stat) => (
                <th key={stat} scope="col" className="px-2 py-2.5 text-right font-semibold">
                  {STAT_LABELS[stat]}
                </th>
              ))}
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">MPG</th>
            </tr>
          </thead>
          {groups.map((group) => (
            group.rows.length > 0 && (
              <tbody key={group.label}>
                <tr>
                  <td colSpan={statKeys.length + 2} className="bg-white/[0.02] px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-broadcast-text-muted">
                    {group.label} • {total > 0 ? group.rows.length : 0}
                  </td>
                </tr>
                {group.rows.map((player) => (
                  <tr key={player.playerId} className="border-t border-white/5 transition-colors hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-[10px] font-bold text-broadcast-text-muted">{player.position ?? ''}</span>
                        <span className="truncate font-medium text-white" title={player.playerName}>
                          {toCompactName(player.playerName)}
                        </span>
                        {badgeFor(player.playerId).map((b) => (
                          <span key={b.label} className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-bold ${b.className}`}>
                            {b.label}
                          </span>
                        ))}
                      </div>
                      <div className="mt-0.5 text-[11px] text-broadcast-text-muted">
                        {player.gamesPlayed} GP{typeof player.overall === 'number' ? ` • ${player.overall} OVR` : ''}
                      </div>
                    </td>
                    {statKeys.map((stat) => (
                      <td
                        key={stat}
                        className={`px-2 py-2.5 text-right font-mono tabular-nums ${stat === 'pts' ? 'font-bold text-broadcast-accent' : 'text-white'}`}
                      >
                        {player.averages[stat].toFixed(1)}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-broadcast-text-secondary">
                      {typeof player.minutesPerGame === 'number' ? player.minutesPerGame.toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            )
          ))}
        </table>
      </div>
    </div>
  );
}

function PlayersView({ result }: { result: SimulationResult }) {
  const badgeFor = (playerId: string): RosterBadge[] => {
    const badges: RosterBadge[] = [];
    if (result.sixthManId === playerId) {
      badges.push({ label: '6TH', className: 'border-broadcast-gold/50 bg-broadcast-gold/15 text-broadcast-gold' });
    }
    const opts = result.optionIds;
    if (opts?.first === playerId) badges.push({ label: '1ST', className: 'border-broadcast-purple/50 bg-broadcast-purple/15 text-broadcast-purple' });
    else if (opts?.second === playerId) badges.push({ label: '2ND', className: 'border-broadcast-purple/50 bg-broadcast-purple/15 text-broadcast-purple' });
    else if (opts?.third === playerId) badges.push({ label: '3RD', className: 'border-broadcast-purple/50 bg-broadcast-purple/15 text-broadcast-purple' });
    return badges;
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-broadcast-text-secondary">Rotation</h3>
        <span className="text-xs text-broadcast-text-muted">{result.playerStats.length} players • {result.games.length} games</span>
      </div>
      <RosterTable
        groups={[
          { label: 'Starters', rows: result.playerStats.slice(0, 5) },
          { label: 'Bench', rows: result.playerStats.slice(5, 10) },
        ]}
        badgeFor={badgeFor}
      />
    </div>
  );
}

function TeamsView({ result }: { result: SimulationResult }) {
  const teams = useMemo(() => {
    const standings = result.standings ?? [];
    const seen = new Set<string>();
    const list: Array<{ name: string; wins?: number; losses?: number; pointDiff?: number }> = [];
    for (const t of standings) {
      if (t.isUser || seen.has(normalizeTeamName(t.team))) continue;
      seen.add(normalizeTeamName(t.team));
      list.push({ name: t.team, wins: t.wins, losses: t.losses, pointDiff: t.pointDiff });
    }
    if (list.length === 0) {
      for (const p of result.opponentPlayerStats ?? []) {
        const norm = normalizeTeamName(p.team);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        list.push({ name: p.team ?? 'Opponent' });
      }
    }
    return list;
  }, [result]);
  const [selected, setSelected] = useState<string | null>(null);
  const active = teams.find((t) => t.name === selected) ?? teams[0] ?? null;
  const activeIndex = active ? teams.findIndex((t) => t.name === active.name) : -1;
  const goTeam = (dir: 1 | -1) => {
    if (teams.length === 0) return;
    const next = ((activeIndex < 0 ? 0 : activeIndex) + dir + teams.length) % teams.length;
    setSelected(teams[next]!.name);
  };
  const roster = useMemo(() => {
    if (!active) return [];
    const norm = normalizeTeamName(active.name);
    return (result.opponentPlayerStats ?? []).filter((p) => normalizeTeamName(p.team) === norm);
  }, [result, active]);
  return (
    <div className="space-y-4">
      <div className="card-elevated flex items-center gap-1 p-2">
        <button
          type="button"
          onClick={() => goTeam(-1)}
          disabled={teams.length < 2}
          aria-label="Previous team"
          className="shrink-0 rounded-lg p-2 text-broadcast-text-secondary transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate font-display text-base font-bold text-white" title={active ? fullTeamName(active.name) : ''}>
            {active ? fullTeamName(active.name) : 'Opponent'}
          </div>
          <div className="mt-0.5 text-xs text-broadcast-text-muted">
            {active && active.wins !== undefined ? (
              <>
                {active.wins}-{active.losses}
                {typeof active.pointDiff === 'number' && (
                  <span className={`ml-2 font-semibold ${active.pointDiff >= 0 ? 'text-broadcast-green' : 'text-broadcast-red'}`}>
                    {active.pointDiff >= 0 ? '+' : ''}{active.pointDiff.toFixed(1)}
                  </span>
                )}
                <span className="ml-2" aria-hidden="true">•</span>
              </>
            ) : null}
            <span className="tabular-nums">{teams.length > 0 ? `${activeIndex + 1}/${teams.length}` : '0/0'}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => goTeam(1)}
          disabled={teams.length < 2}
          aria-label="Next team"
          className="shrink-0 rounded-lg p-2 text-broadcast-text-secondary transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {active && (
        <RosterTable
          groups={[
            { label: 'Starters', rows: roster.slice(0, 5) },
            { label: 'Bench', rows: roster.slice(5, 10) },
          ]}
          badgeFor={() => []}
        />
      )}
      {!active && <div className="card p-6 text-center text-sm text-broadcast-text-muted">No opponent data</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Awards
// ---------------------------------------------------------------------------

function AwardsView({ result }: { result: SimulationResult }) {
  const rows = useMemo(() => buildLeagueRows(result), [result]);
  const standings = useMemo(() => result.standings ?? [], [result.standings]);

  const { mvp, clutch, dpoy, sixth, defensiveFirst, defensiveSecond, allNbaFirst, allNbaSecond, allNbaThird } = useMemo(() => {
    // Normalized join: standings carry display names ("1990s Chicago Bulls"),
    // rows may carry ids ("bulls") on old saves — compare normalized.
    const winPctByNorm = new Map(standings.map((t) => [normalizeTeamName(t.team), t.winPct ?? 0]));
    const userWinPct = standings.find((t) => t.isUser)?.winPct ?? 0;
    const teamWinPct = (row: LeagueRow) => (row.isUser ? userWinPct : (winPctByNorm.get(normalizeTeamName(row.team)) ?? 0));

    // MVP/DPOY require half a season (spec §5.3); fall back to the full table
    // if nobody qualifies so the awards never render empty.
    const minGP = Math.max(1, Math.ceil(result.games.length * 0.5));
    const qualified = rows.filter((r) => r.gp >= minGP);
    const awardPool = qualified.length > 0 ? qualified : rows;
    const mvpRow =
      awardPool.slice().sort((a, b) => awardScore(b) + teamWinPct(b) * 10 - awardScore(a) - teamWinPct(a) * 10)[0] ?? null;
    const clutchRow = getClutchPlayer(result, rows);
    const dpoyRow = awardPool.slice().sort((a, b) => awardScore(b, true) - awardScore(a, true))[0] ?? null;
    // Sixth Man: bench-minute players only (starters log ~30+, sixth ~22-24,
    // bench ~14-17; legacy 5-man saves log 42-48). Same team-success weighting as MVP.
    let sixthEligible = awardPool.filter((r) => r.mpg < 26);
    if (sixthEligible.length === 0) {
      const byMpg = awardPool.slice().sort((a, b) => a.mpg - b.mpg);
      sixthEligible = byMpg.slice(0, Math.max(1, Math.floor(byMpg.length / 2)));
    }
    const sixthRow =
      sixthEligible.slice().sort((a, b) => awardScore(b) + teamWinPct(b) * 10 - awardScore(a) - teamWinPct(a) * 10)[0] ?? null;
    const defFirst = selectTeam(rows, true);
    const defFirstKeys = new Set(defFirst.map((p) => p.rowKey));
    const defSecond = selectTeam(rows.filter((r) => !defFirstKeys.has(r.rowKey)), true);
    const first = selectTeam(rows);
    const firstKeys = new Set(first.map((p) => p.rowKey));
    const second = selectTeam(rows.filter((r) => !firstKeys.has(r.rowKey)));
    const secondKeys = new Set(second.map((p) => p.rowKey));
    const third = selectTeam(rows.filter((r) => !firstKeys.has(r.rowKey) && !secondKeys.has(r.rowKey)));
    return {
      mvp: mvpRow,
      clutch: clutchRow,
      dpoy: dpoyRow,
      sixth: sixthRow,
      defensiveFirst: defFirst,
      defensiveSecond: defSecond,
      allNbaFirst: first,
      allNbaSecond: second,
      allNbaThird: third,
    };
  }, [rows, standings, result]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AwardCard title="MOST VALUABLE PLAYER" icon={Trophy} player={mvp} accent="text-broadcast-gold" />
        <AwardCard title="CLUTCH PLAYER OF THE YEAR" icon={Flame} player={clutch} accent="text-orange-400" />
        <AwardCard title="DEFENSIVE PLAYER OF THE YEAR" icon={Shield} player={dpoy} accent="text-blue-400" />
        <AwardCard
          title="SIXTH MAN OF THE YEAR"
          icon={Sparkles}
          player={sixth}
          accent="text-broadcast-purple"
          badge={sixth && result.sixthManId === sixth.playerId && sixth.isUser ? 'YOUR 6TH MAN' : null}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <AwardTeamCard title="ALL-DEFENSIVE FIRST TEAM" players={defensiveFirst} />
        <AwardTeamCard title="ALL-DEFENSIVE SECOND TEAM" players={defensiveSecond} />
        <AwardTeamCard title="ALL-NBA FIRST TEAM" players={allNbaFirst} />
        <AwardTeamCard title="ALL-NBA SECOND TEAM" players={allNbaSecond} />
        <AwardTeamCard title="ALL-NBA THIRD TEAM" players={allNbaThird} />
      </div>
    </div>
  );
}

const AwardCard = memo(function AwardCard({
  title,
  icon: Icon,
  player,
  accent,
  badge,
}: {
  title: string;
  icon: typeof Trophy;
  player: LeagueRow | null;
  accent: string;
  badge?: string | null;
}) {
  return (
    <div className="card-elevated p-4">
      <div className={cn('flex items-center gap-2 text-xs font-bold tracking-wider', accent)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        {title}
      </div>
      <div className="mt-4">
        <div className="font-display text-xl font-bold text-white">{player?.playerName ?? '—'}</div>
        <div className="mt-1 text-xs text-broadcast-text-secondary">
          {player ? `${player.position ?? '—'} • ${player.isUser ? 'YOUR TEAM' : formatTeamName(player.team)}` : 'No eligible player'}
          {badge && (
            <span className="ml-2 rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-broadcast-gold">
              {badge}
            </span>
          )}
        </div>
        {player && (
          <div className="mt-3 flex gap-4 text-xs text-broadcast-text-muted">
            <span>
              <strong className="text-white">{player.averages.pts.toFixed(1)}</strong> PPG
            </span>
            <span>
              <strong className="text-white">{player.averages.reb.toFixed(1)}</strong> RPG
            </span>
            <span>
              <strong className="text-white">{player.averages.ast.toFixed(1)}</strong> APG
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

const AwardTeamCard = memo(function AwardTeamCard({ title, players }: { title: string; players: LeagueRow[] }) {
  return (
    <div className="card p-4">
      <h3 className="text-xs font-bold tracking-wider text-broadcast-accent">{title}</h3>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5">
        {players.map((player, index) => (
          <div key={player.rowKey} className="rounded-lg bg-broadcast-darker p-2 text-center">
            <div className="text-[10px] font-bold text-broadcast-text-muted">{player.position ?? `#${index + 1}`}</div>
            <div className="mt-1 truncate text-sm font-semibold text-white" title={player.playerName}>
              {toCompactName(player.playerName)}
            </div>
            <div className="mt-1 text-[10px] text-broadcast-text-muted">{player.averages.pts.toFixed(1)} PPG</div>
          </div>
        ))}
        {players.length === 0 && <div className="text-sm text-broadcast-text-muted">No eligible players</div>}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Playoffs bracket
// ---------------------------------------------------------------------------

/** Re-key one game so home/away always mean the bracket-home/-away sides. */
function alignGameToBracketSides(game: PlayoffGameResult, hostsAreBracketHome: boolean): PlayoffGameResult {
  if (hostsAreBracketHome) return game;
  return {
    ...game,
    homeScore: game.awayScore,
    awayScore: game.homeScore,
    homePlayerStats: game.awayPlayerStats,
    awayPlayerStats: game.homePlayerStats,
    homeMinutes: game.awayMinutes,
    awayMinutes: game.homeMinutes,
    events: game.events.map((e) => ({ ...e, team: e.team === 'home' ? ('away' as const) : ('home' as const) })),
  };
}

/**
 * A real best-of-7 between two rotations (2-2-1-1-1 venues, first to 4),
 * bracket-home-aligned throughout. Powers background CPU-vs-CPU series so they
 * carry genuine box scores — reviewable exactly like your own series.
 * User sides (10-man) pass their Sixth Man; CPU sides (5-man) pass none.
 */
async function simulateRealSeries(
  homeRoster: Player[],
  awayRoster: Player[],
  onGame?: (gameNumber: number, game: PlayoffGameResult) => void,
  shouldAbort?: () => boolean,
  gameDelayMs = 250,
  homeSixthManId?: string | null,
  awaySixthManId?: string | null,
  homeOptions?: { first?: string | null; second?: string | null; third?: string | null } | null,
  awayOptions?: { first?: string | null; second?: string | null; third?: string | null } | null,
): Promise<{ homeWins: number; awayWins: number; games: PlayoffGameResult[] }> {
  // Higher seed hosts games 1, 2, 5, 7 — the bracket-home side.
  const hostsBracketHome = (n: number) => n === 1 || n === 2 || n === 5 || n === 7;
  const games: PlayoffGameResult[] = [];
  let homeWins = 0;
  let awayWins = 0;
  for (let n = 1; n <= 7; n++) {
    if (shouldAbort?.()) break;
    const hostsHome = hostsBracketHome(n);
    const response = await api.simulation.runGame(hostsHome ? homeRoster : awayRoster, hostsHome ? awayRoster : homeRoster, n, hostsHome ? (homeSixthManId ?? null) : (awaySixthManId ?? null), hostsHome ? (awaySixthManId ?? null) : (homeSixthManId ?? null), hostsHome ? (homeOptions ?? null) : (awayOptions ?? null), hostsHome ? (awayOptions ?? null) : (homeOptions ?? null));
    if (shouldAbort?.()) break;
    const game = alignGameToBracketSides(response.result, hostsHome);
    games.push(game);
    onGame?.(n, game);
    if (game.homeScore > game.awayScore) homeWins++;
    else awayWins++;
    if (homeWins >= 4 || awayWins >= 4) break;
    await new Promise((resolve) => setTimeout(resolve, gameDelayMs));
  }
  return { homeWins, awayWins, games };
}

function PlayoffsView({
  result,
  onOpen,
  onReview,
  winners,
  setWinners,
  hasStarted,
  setHasStarted,
  seriesGames,
  onSeriesGames,
  onResetBracket,
}: {
  result: SimulationResult;
  onOpen: (home: string, away: string, userTeamName: string, seriesKey: string, onComplete: (winner: string, games?: PlayoffGameResult[]) => void) => void;
  onReview: (home: string, away: string, userTeamName: string, seriesKey: string) => void;
  winners: Record<string, string>;
  setWinners: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  hasStarted: boolean;
  setHasStarted: React.Dispatch<React.SetStateAction<boolean>>;
  seriesGames: Record<string, PlayoffGameResult[]>;
  onSeriesGames: (seriesKey: string, games: PlayoffGameResult[]) => void;
  onResetBracket: () => void;
}) {
  const [backgroundSimulation, setBackgroundSimulation] = useState<{ seriesKey: string; game: number } | null>(null);
  const [pendingSeries, setPendingSeries] = useState<{ home: string; away: string; seriesKey: string } | null>(null);
  const otherSeriesStarted = useRef(false);
  const simulationAborted = useRef(false);
  const drainingRef = useRef(false);
  const winnersRef = useRef(winners);
  winnersRef.current = winners;

  const playoffTeams = useMemo(() => buildPlayoffTeams(result.standings), [result.standings]);
  const { userTeamName, east: eastTeams, west: westTeams } = playoffTeams;

  const eastFirstRound = useMemo(() => makeFirstRound(eastTeams), [eastTeams]);
  const westFirstRound = useMemo(() => makeFirstRound(westTeams), [westTeams]);

  useEffect(() => {
    return () => {
      simulationAborted.current = true;
    };
  }, []);

  const seedFor = useCallback((teamName: string) => getSeedLabel(teamName, eastTeams, westTeams), [eastTeams, westTeams]);

  const allSeriesKeys = useMemo(() => allPlayoffSeriesKeys(), []);

  const participantsFor = useCallback(
    (seriesKey: string, wins: Record<string, string>): { home: string; away: string } | null =>
      getPlayoffParticipants(eastFirstRound, westFirstRound, wins, seriesKey),
    [eastFirstRound, westFirstRound],
  );

  const setWinner = useCallback(
    (seriesKey: string, winner: string) => {
      setWinners((previous) => (previous[seriesKey] === winner ? previous : { ...previous, [seriesKey]: winner }));
    },
    [setWinners],
  );

  // Your team can finish outside the top 16 — then no series is clickable and
  // the bracket would sit dead forever. Detect it and offer a full sim.
  const userRank = useMemo(() => {
    const ordered = (result.standings ?? []).slice().sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff);
    return ordered.findIndex((s) => s.isUser) + 1;
  }, [result.standings]);
  const userInBracket = eastTeams.includes(userTeamName) || westTeams.includes(userTeamName);

  // True once a decided series involving you went the other way.
  const userEliminated = useCallback(
    (wins: Record<string, string>) =>
      allSeriesKeys.some((key) => {
        const winner = wins[key];
        if (!winner || winner === userTeamName) return false;
        const p = getPlayoffParticipants(eastFirstRound, westFirstRound, wins, key);
        return !!p && (p.home === userTeamName || p.away === userTeamName);
      }),
    [allSeriesKeys, eastFirstRound, westFirstRound, userTeamName],
  );

  // Round-by-round pacing: a later round's CPU series wait until YOUR series
  // in the previous round is decided (or you're eliminated / not in the
  // bracket). Round 0 always runs so the bracket comes alive on start.
  const roundReleased = useCallback(
    (round: number, wins: Record<string, string>) => {
      if (round === 0) return true;
      if (!userInBracket) return true;
      if (userEliminated(wins)) return true;
      const prevKeys = allSeriesKeys.filter((k) => playoffSeriesRound(k) === round - 1);
      const mine = prevKeys.find((k) => {
        const p = getPlayoffParticipants(eastFirstRound, westFirstRound, wins, k);
        return !!p && (p.home === userTeamName || p.away === userTeamName);
      });
      if (!mine) return false;
      return Boolean(wins[mine]);
    },
    [allSeriesKeys, eastFirstRound, westFirstRound, userInBracket, userEliminated, userTeamName],
  );

  // Real 10-man rotations for both sides (your rotation + CPU rotations).
  // User sides pass their Sixth Man; CPU sides pass none.
  const rosterFor = useCallback(
    (team: string): Player[] =>
      team === userTeamName ? buildUserPlayoffLineup(result, userTeamName) : buildOpponentPlayoffRoster(result, team),
    [result, userTeamName],
  );
  const sixthFor = useCallback(
    (team: string): string | null =>
      team === userTeamName ? (result.sixthManId ?? null) : null,
    [result, userTeamName],
  );
  const optionsFor = useCallback(
    (team: string): { first?: string | null; second?: string | null; third?: string | null } | null =>
      team === userTeamName ? (result.optionIds ?? null) : null,
    [result, userTeamName],
  );
  const drainRoundRef = useRef(-1);

  // BYE auto-advance: a real team vs BYE never needs a simulated game.
  useEffect(() => {
    if (!hasStarted) return;
    for (const key of allSeriesKeys) {
      if (winners[key]) continue;
      const p = participantsFor(key, winners);
      if (!p) continue;
      if (isByeTeam(p.home) && !isByeTeam(p.away) && !isPlaceholderTeam(p.away)) setWinner(key, p.away);
      else if (isByeTeam(p.away) && !isByeTeam(p.home) && !isPlaceholderTeam(p.home)) setWinner(key, p.home);
    }
  }, [winners, hasStarted, allSeriesKeys, participantsFor, setWinner]);

  // Drain loop: every CPU series is played as REAL games (2-2-1-1-1 venues),
  // round by round behind your progress, all the way to the Finals — so each
  // decided series (yours or CPU) ends up with box scores you can review.
  // NOTE: this must NOT cancel a running drain when `winners` changes; doing
  // so stalled the bracket after a single series. The loop reads live
  // `winnersRef` each iteration, so concurrent effect runs just return early.
  // Abort happens only on RESET/unmount.
  useEffect(() => {
    if (!hasStarted || drainingRef.current) return;
    drainingRef.current = true;
    const drain = async () => {
      try {
        for (;;) {
          if (simulationAborted.current) break;
          const current = winnersRef.current;
          const next = allSeriesKeys.find((key) => {
            if (current[key]) return false;
            const p = participantsFor(key, current);
            if (!p) return false;
            if (isPlaceholderTeam(p.home) || isPlaceholderTeam(p.away)) return false;
            if (p.home === userTeamName || p.away === userTeamName) return false;
            if (!roundReleased(playoffSeriesRound(key), current)) return false;
            return true;
          });
          if (!next) break;
          const p = participantsFor(next, winnersRef.current)!;
          // Beat between rounds so the bracket reveals itself in stages.
          const round = playoffSeriesRound(next);
          if (drainRoundRef.current !== -1 && round > drainRoundRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (simulationAborted.current) break;
          }
          drainRoundRef.current = round;
          const homeRoster = rosterFor(p.home);
          const awayRoster = rosterFor(p.away);
          let winner: string | null = null;
          let games: PlayoffGameResult[] = [];
          const validRoster = (r: Player[]) => r.length === 5 || r.length === 10;
          if (validRoster(homeRoster) && validRoster(awayRoster)) {
            try {
              const series = await simulateRealSeries(homeRoster, awayRoster, (gameNumber) => {
                if (!simulationAborted.current) setBackgroundSimulation({ seriesKey: next, game: gameNumber });
              }, undefined, 250, sixthFor(p.home), sixthFor(p.away), optionsFor(p.home), optionsFor(p.away));
              if (simulationAborted.current) break;
              games = series.games;
              winner =
                series.homeWins >= 4
                  ? p.home
                  : series.awayWins >= 4
                    ? p.away
                    : series.homeWins >= series.awayWins
                      ? p.home
                      : p.away;
            } catch {
              // Real games failed (e.g. throttled) — cool down briefly so a
              // burst can settle, then fall through to the virtual fallback.
              await new Promise((resolve) => setTimeout(resolve, 1500));
              winner = null;
            }
          }
          if (!winner) {
            // Last-resort virtual result so one bad roster can never brick the bracket.
            if (simulationAborted.current) break;
            winner = await simulatePlayoffSeriesWinner(
              result,
              p.home,
              p.away,
              (game) => {
                if (!simulationAborted.current) setBackgroundSimulation({ seriesKey: next, game });
              },
              () => simulationAborted.current,
            );
            games = [];
            if (simulationAborted.current) break;
          }
          winnersRef.current = { ...winnersRef.current, [next]: winner };
          setWinner(next, winner);
          if (games.length > 0) onSeriesGames(next, games);
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      } catch (error) {
        if (!simulationAborted.current) {
          notify.error(error instanceof Error ? error.message : 'Failed to simulate the other playoff series');
        }
      } finally {
        drainingRef.current = false;
        if (!simulationAborted.current) setBackgroundSimulation(null);
      }
    };
    void drain();
  }, [winners, hasStarted, allSeriesKeys, participantsFor, result, userTeamName, setWinner, roundReleased, rosterFor, sixthFor, optionsFor, onSeriesGames]);

  const runBackgroundPlayoffs = useCallback(async () => {
    // Initial sweep is now handled by the drain loop; this just kicks it and
    // resolves any opening-round BYEs instantly.
    const initial: Record<string, string> = {};
    for (const key of allSeriesKeys) {
      const p = participantsFor(key, winnersRef.current);
      if (!p) continue;
      if (key.includes('EAST-') || key.includes('WEST-')) {
        if (isByeTeam(p.home) && !isPlaceholderTeam(p.away)) initial[key] = p.away;
        else if (isByeTeam(p.away) && !isPlaceholderTeam(p.home)) initial[key] = p.home;
      }
    }
    if (Object.keys(initial).length > 0) {
      winnersRef.current = { ...winnersRef.current, ...initial };
      setWinners((previous) => ({ ...previous, ...initial }));
    }
    notify.success('Playoff simulation started — other series simulate automatically.');
  }, [allSeriesKeys, participantsFor, setWinners]);

  const handleConfirmSeries = useCallback(() => {
    if (!pendingSeries) return;
    const { home, away, seriesKey } = pendingSeries;
    setPendingSeries(null);
    setHasStarted(true);
    simulationAborted.current = false;
    onOpen(home, away, userTeamName, seriesKey, (winner: string, games?: PlayoffGameResult[]) => {
      setWinner(seriesKey, winner);
      // Persist the full log here (not just via the modal's save effect) so
      // the clinching game can't be lost when completion unmounts the modal.
      if (games && games.length > 0) onSeriesGames(seriesKey, games);
    });
    if (!otherSeriesStarted.current) {
      otherSeriesStarted.current = true;
      void runBackgroundPlayoffs();
    }
  }, [pendingSeries, onOpen, userTeamName, runBackgroundPlayoffs, setWinner, setHasStarted, onSeriesGames]);

  const handleReset = useCallback(() => {
    simulationAborted.current = true;
    otherSeriesStarted.current = false;
    drainingRef.current = false;
    drainRoundRef.current = -1;
    winnersRef.current = {};
    setWinners({});
    setHasStarted(false);
    setBackgroundSimulation(null);
    setPendingSeries(null);
    onResetBracket();
  }, [setWinners, setHasStarted, onResetBracket]);

  // Your team can finish outside the top 16 — then no series is clickable and
  // the bracket would sit dead forever. Detect it and offer a full sim.
  // (userRank / userInBracket live above the drain loop; the drain gates on them.)
  const handleSimulateAll = useCallback(() => {
    setHasStarted(true);
    simulationAborted.current = false;
    otherSeriesStarted.current = true;
    void runBackgroundPlayoffs();
  }, [runBackgroundPlayoffs, setHasStarted]);

  const renderMatchup = useCallback(
    (home: string, away: string, seriesKey: string) => {
      const homeBye = isByeTeam(home);
      const awayBye = isByeTeam(away);
      const known = !isPlaceholderTeam(home) && !isPlaceholderTeam(away) && !homeBye && !awayBye;
      const byeDecided = Boolean(winners[seriesKey]) || homeBye || awayBye;
      const byeWinner = winners[seriesKey] ?? (homeBye && !awayBye ? away : awayBye && !homeBye ? home : undefined);
      const isUserTeam = home === userTeamName || away === userTeamName;
      const alreadyDecided = Boolean(winners[seriesKey]);
      const savedGameCount = seriesGames[seriesKey]?.length ?? 0;
      // Finished (or paused) user series with saved games can be re-opened:
      // review box scores any time, or continue an unfinished series.
      // Decided CPU-vs-CPU series with real box scores review the same way.
      const playClickable = known && isUserTeam && !alreadyDecided;
      const reviewable = known && alreadyDecided && savedGameCount > 0;
      const clickable = playClickable || reviewable;
      const isSimulating = backgroundSimulation?.seriesKey === seriesKey;
      const decidedWinner = winners[seriesKey] ?? byeWinner;

      return (
        <button
          key={seriesKey}
          type="button"
          disabled={!clickable}
          onClick={() => {
            if (!clickable) return;
            if (reviewable) onReview(home, away, userTeamName, seriesKey);
            else setPendingSeries({ home, away, seriesKey });
          }}
          title={`${home} vs ${away}${reviewable && alreadyDecided ? ` • ${savedGameCount} games saved — click to review` : ''}`}
          className={cn(
            'w-full rounded-lg border p-3 text-center transition-all min-h-[80px] flex flex-col justify-center',
            clickable
              ? 'border-broadcast-accent/60 bg-broadcast-accent/10 hover:bg-broadcast-accent/20 cursor-pointer shadow-glow-accent'
              : isSimulating
                ? 'border-broadcast-accent/40 bg-broadcast-card'
                : 'border-broadcast-border bg-broadcast-card opacity-70',
          )}
          aria-label={`${teamAbbreviation(home)} vs ${teamAbbreviation(away)}${playClickable ? ' - Click to simulate' : ''}${
            reviewable ? ` - Click to review ${savedGameCount} games` : ''
          }${decidedWinner ? ` - Winner: ${teamAbbreviation(decidedWinner)}` : ''}`}
        >
          <div className="space-y-1">
            <div className="truncate text-base font-bold tracking-wide text-white" title={home}>
              {teamAbbreviation(home)}
              <span className="ml-1 text-xs font-medium text-broadcast-text-muted">{seedFor(home)}</span>
            </div>
            <div className="text-xs text-broadcast-text-muted">vs</div>
            <div className="truncate text-base font-bold tracking-wide text-white" title={away}>
              {teamAbbreviation(away)}
              <span className="ml-1 text-xs font-medium text-broadcast-text-muted">{seedFor(away)}</span>
            </div>
          </div>
          {homeBye || awayBye ? (
            !winners[seriesKey] && byeWinner ? (
              <div className="mt-2 text-xs font-bold text-broadcast-text-muted">BYE — ADVANCES</div>
            ) : null
          ) : null}
          {isSimulating && !alreadyDecided && (
            <div className="mt-2 flex items-center justify-center gap-1 text-xs font-bold text-broadcast-accent">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-broadcast-accent/30 border-t-broadcast-accent" aria-hidden="true" />
              SIMULATING GAME {backgroundSimulation?.game}
            </div>
          )}
          {playClickable && !isSimulating && (
            <div className="mt-2 text-xs font-bold text-broadcast-accent">SIMULATE YOUR SERIES</div>
          )}
          {reviewable && (
            <div className="mt-2 text-xs font-bold text-broadcast-gold">
              REVIEW {savedGameCount} GAME{savedGameCount === 1 ? '' : 'S'}
            </div>
          )}
          {!known && !byeDecided && <div className="mt-2 text-xs text-broadcast-text-muted">TBD</div>}
        </button>
      );
    },
    [backgroundSimulation, seedFor, userTeamName, winners, seriesGames, onReview],
  );

  const eastChampion = winners['EAST-conference-final-0'] ?? 'East Champion';
  const westChampion = winners['WEST-conference-final-0'] ?? 'West Champion';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">
            NBA PLAYOFFS <span className="text-broadcast-accent">• {result.era?.label ?? '2020s'}</span>
          </h2>
          <p className="mt-1 text-xs text-broadcast-text-secondary">Best-of-seven series • simulate your team, review every playoff matchup</p>
        </div>
        {hasStarted && (
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-broadcast-card border border-broadcast-border text-broadcast-text-secondary hover:text-white hover:border-broadcast-accent/50 transition-colors text-xs font-bold"
            aria-label="Reset playoff simulation"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            RESET
          </button>
        )}
      </div>

      {!userInBracket && (
        <div className="rounded-xl border border-broadcast-gold/40 bg-broadcast-gold/10 p-4 text-center" role="status">
          <p className="text-sm font-bold text-broadcast-gold">
            YOUR TEAM MISSED THE PLAYOFFS{userRank > 0 ? ` (RANKED #${userRank})` : ''}
          </p>
          <p className="mt-1 text-xs text-broadcast-text-secondary">
            Only the top 16 reach the bracket — but you can still crown a champion.
          </p>
          {!hasStarted && (
            <button onClick={handleSimulateAll} className="btn-gold mt-3 px-5 py-2 text-sm">
              <Trophy className="w-4 h-4" aria-hidden="true" />
              SIMULATE FULL BRACKET
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[1000px]">
          <div className="grid grid-cols-7 gap-3 mb-4">
            <div className="text-center text-sm font-bold text-broadcast-accent">EAST FIRST ROUND</div>
            <div className="text-center text-sm font-bold text-broadcast-accent">EAST SEMIFINALS</div>
            <div className="text-center text-sm font-bold text-broadcast-accent">EAST FINALS</div>
            <div className="text-center text-sm font-bold text-broadcast-gold">NBA FINALS</div>
            <div className="text-center text-sm font-bold text-broadcast-accent">WEST FINALS</div>
            <div className="text-center text-sm font-bold text-broadcast-accent">WEST SEMIFINALS</div>
            <div className="text-center text-sm font-bold text-broadcast-accent">WEST FIRST ROUND</div>
          </div>

          <div className="grid grid-cols-7 gap-3 items-center">
            <div className="space-y-6">{eastFirstRound.map((matchup, index) => renderMatchup(matchup.home, matchup.away, `EAST-${index}`))}</div>

            <div className="space-y-20">
              {[0, 1].map((index) => {
                const home = winners[`EAST-${index * 2}`] || `Winner ${index * 2 + 1}`;
                const away = winners[`EAST-${index * 2 + 1}`] || `Winner ${index * 2 + 2}`;
                return renderMatchup(home, away, `EAST-semifinal-${index}`);
              })}
            </div>

            <div className="flex items-center justify-center">
              <div className="w-full">
                {renderMatchup(
                  winners['EAST-semifinal-0'] || 'Semifinal Winner 1',
                  winners['EAST-semifinal-1'] || 'Semifinal Winner 2',
                  'EAST-conference-final-0',
                )}
              </div>
            </div>

            <div className="flex flex-col items-center space-y-3">
              <div className="w-full">{renderMatchup(eastChampion, westChampion, 'CHAMPIONSHIP')}</div>
              <div className="text-center">
                <Trophy className="h-8 w-8 text-broadcast-gold mx-auto" aria-hidden="true" />
                <div className="mt-1 text-sm font-bold text-broadcast-gold" title={winners['CHAMPIONSHIP'] ?? ''}>
                  {winners['CHAMPIONSHIP'] ? teamAbbreviation(winners['CHAMPIONSHIP']!) : 'NBA CHAMPION'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="w-full">
                {renderMatchup(
                  winners['WEST-semifinal-0'] || 'Semifinal Winner 1',
                  winners['WEST-semifinal-1'] || 'Semifinal Winner 2',
                  'WEST-conference-final-0',
                )}
              </div>
            </div>

            <div className="space-y-20">
              {[0, 1].map((index) => {
                const home = winners[`WEST-${index * 2}`] || `Winner ${index * 2 + 1}`;
                const away = winners[`WEST-${index * 2 + 1}`] || `Winner ${index * 2 + 2}`;
                return renderMatchup(home, away, `WEST-semifinal-${index}`);
              })}
            </div>

            <div className="space-y-6">{westFirstRound.map((matchup, index) => renderMatchup(matchup.home, matchup.away, `WEST-${index}`))}</div>
          </div>
        </div>
      </div>

      {hasStarted && <PlayoffTeamStats result={result} />}

      {backgroundSimulation && (
        <div
          className="flex items-center justify-center gap-2 rounded-lg border border-broadcast-accent/40 bg-broadcast-accent/10 px-4 py-3 text-sm font-bold text-broadcast-accent"
          role="status"
        >
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-broadcast-accent/30 border-t-broadcast-accent" aria-hidden="true" />
          SIMULATING GAME {backgroundSimulation.game} • {backgroundSimulation.seriesKey.replace('-', ' ')}
        </div>
      )}

      <p className="text-sm text-broadcast-text-muted">
        Balanced 8v8 conferences (snake-seeded) •{' '}
        {userInBracket ? (
          <>Simulate your series to unlock the next round • click any finished series to review its games.</>
        ) : (
          <>Your team is out — every series simulates automatically once started • click any finished series to review.</>
        )}
      </p>

      {pendingSeries && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-broadcast-dark/90 p-4 backdrop-blur-sm"
          onClick={() => setPendingSeries(null)}
        >
          <div
            className="max-w-md w-full rounded-2xl border border-broadcast-border bg-broadcast-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm playoff simulation"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-broadcast-gold shrink-0" aria-hidden="true" />
              <div>
                <h3 className="font-display text-lg font-bold text-white">Start Playoff Simulation?</h3>
                <p className="mt-2 text-sm text-broadcast-text-secondary">
                  {teamAbbreviation(pendingSeries.home)} vs {teamAbbreviation(pendingSeries.away)}{' '}
                  <span className="text-broadcast-text-muted">
                    ({pendingSeries.home} vs {pendingSeries.away})
                  </span>
                  . This opens your live best-of-7. Other series in this round simulate alongside it; later rounds unlock as you advance. This cannot be undone.
                </p>
                <div className="mt-4 flex gap-2 justify-end">
                  <button
                    onClick={() => setPendingSeries(null)}
                    className="px-4 py-2 rounded-lg bg-broadcast-card border border-broadcast-border text-broadcast-text-secondary hover:text-white transition-colors text-sm font-bold"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleConfirmSeries}
                    className="px-4 py-2 rounded-lg bg-broadcast-accent text-broadcast-dark hover:bg-broadcast-accent/90 transition-colors text-sm font-bold"
                  >
                    START SIMULATION
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayoffTeamStats({ result }: { result: SimulationResult }) {
  const teamRows = useMemo(() => buildLeagueRows(result).filter((row) => !row.isUser), [result]);

  return (
    <section className="card-elevated overflow-hidden">
      <div className="border-b border-broadcast-border p-4">
        <h3 className="font-display text-sm font-bold tracking-wider text-broadcast-accent">OTHER PLAYOFF TEAMS — PLAYER STATS</h3>
        <p className="mt-1 text-xs text-broadcast-text-muted">Read-only season production. Viewing these stats does not simulate their games.</p>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[680px] text-xs">
          <thead className="sticky top-0 bg-broadcast-card text-broadcast-text-muted">
            <tr className="border-b border-broadcast-border">
              <th className="px-4 py-3 text-left">TEAM</th>
              <th className="px-4 py-3 text-left">PLAYER</th>
              <th className="px-4 py-3 text-center">GP</th>
              <th className="px-4 py-3 text-center">MPG</th>
              <th className="px-4 py-3 text-center">PPG</th>
              <th className="px-4 py-3 text-center">RPG</th>
              <th className="px-4 py-3 text-center">APG</th>
            </tr>
          </thead>
          <tbody>
            {teamRows.map((row) => (
              <tr key={row.rowKey} className="border-b border-broadcast-border/40">
                <td className="px-4 py-2 font-bold text-white" title={formatTeamName(row.team)}>
                  {teamAbbreviation(row.team)}
                </td>
                <td className="px-4 py-2 text-broadcast-text-secondary">{row.playerName}</td>
                <td className="px-4 py-2 text-center text-broadcast-text-secondary">{row.gp}</td>
                <td className="px-4 py-2 text-center text-broadcast-text-secondary">{row.mpg.toFixed(1)}</td>
                <td className="px-4 py-2 text-center font-bold text-broadcast-accent">{row.averages.pts.toFixed(1)}</td>
                <td className="px-4 py-2 text-center text-white">{row.averages.reb.toFixed(1)}</td>
                <td className="px-4 py-2 text-center text-white">{row.averages.ast.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Live best-of-7 modal (single series, always 7 max)
// ---------------------------------------------------------------------------

function getQuarterScores(game: PlayoffGameResult): Array<{ quarter: number; home: number; away: number }> {
  // Estimated split only — the API returns final totals. Regulation quarters
  // split evenly; each OT period (~5 min vs 12) scores ~42% of a regulation
  // quarter so OT shows ~10-11 pts instead of an impossible ~24. Sums match.
  const ot = Math.max(0, game.otPeriods);
  const OT_WEIGHT = 0.42;
  const split = (total: number) => {
    if (ot === 0) {
      const base = Math.floor(total / 4);
      const rem = total % 4;
      return Array.from({ length: 4 }, (_, i) => base + (i < rem ? 1 : 0));
    }
    const regulationQ = total / (4 + OT_WEIGHT * ot);
    const otQ = regulationQ * OT_WEIGHT;
    const targets = [
      ...Array.from({ length: 4 }, () => regulationQ),
      ...Array.from({ length: ot }, () => otQ),
    ];
    const floored = targets.map((t) => Math.floor(t));
    let remainder = total - floored.reduce((a, b) => a + b, 0);
    // Feed remainder to regulation quarters first (they carry the variance).
    for (let i = 0; remainder > 0 && i < floored.length + 4; i++) {
      floored[i % floored.length]! += 1;
      remainder--;
    }
    return floored;
  };
  const home = split(game.homeScore);
  const away = split(game.awayScore);
  return Array.from({ length: 4 + ot }, (_, index) => ({
    quarter: index + 1,
    home: home[index]!,
    away: away[index]!,
  }));
}

/** Fast count-up: capped steps so a 40-pt quarter doesn't take 1.4s. Abortable mid-quarter. */
async function countQuarterScore(
  homeTarget: number,
  awayTarget: number,
  setScore: (score: { home: number; away: number }) => void,
  shouldAbort?: () => boolean,
): Promise<void> {
  const maxTarget = Math.max(homeTarget, awayTarget, 1);
  const steps = Math.min(maxTarget, 24);
  const homeStep = homeTarget / steps;
  const awayStep = awayTarget / steps;
  for (let step = 1; step <= steps; step++) {
    if (shouldAbort?.()) break;
    setScore({
      home: Math.round(Math.min(homeTarget, homeStep * step)),
      away: Math.round(Math.min(awayTarget, awayStep * step)),
    });
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
  if (!shouldAbort?.()) setScore({ home: homeTarget, away: awayTarget });
}

function PlayoffsModal({
  result,
  userTeamName,
  homeName,
  awayName,
  seriesKey,
  readOnly,
  initialGames,
  onGamesUpdate,
  onSeriesComplete,
  onClose,
}: {
  result: SimulationResult;
  /** Your bracket team (your squad resolves from this, whatever side you're on). */
  userTeamName: string;
  /** Score-home side: you in play mode / your team when reviewing your series / bracket-home for CPU reviews. */
  homeName: string;
  /** Score-away side, aligned with homeName. */
  awayName: string;
  seriesKey: string;
  readOnly?: boolean;
  initialGames: PlayoffGameResult[];
  onGamesUpdate: (seriesKey: string, games: PlayoffGameResult[]) => void;
  onSeriesComplete: (winner: string, games: PlayoffGameResult[]) => void;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState(initialGames.length);
  const [completedGames, setCompletedGames] = useState<PlayoffGameResult[]>(initialGames);
  // The game currently being animated. Withheld from `completedGames` until
  // its final buzzer so the series score, stats and progress stay at 0-0
  // while it plays instead of jumping ahead on click.
  const [liveGame, setLiveGame] = useState<PlayoffGameResult | null>(null);
  // Synchronous mirror of the series log for the completion handoff above.
  const gamesRef = useRef<PlayoffGameResult[]>(initialGames);
  const [liveQuarter, setLiveQuarter] = useState<number | null>(null);
  const [liveQuarterScores, setLiveQuarterScores] = useState<{ home: number; away: number } | null>(null);
  const [liveGameScore, setLiveGameScore] = useState<{ home: number; away: number } | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef(false);
  const onGamesUpdateRef = useRef(onGamesUpdate);
  onGamesUpdateRef.current = onGamesUpdate;

  // Persist every finished game upward so the series survives closing the
  // modal and can be reviewed from the bracket (R1 → Finals).
  useEffect(() => {
    onGamesUpdateRef.current(seriesKey, completedGames);
  }, [completedGames, seriesKey]);

  const lineup: Player[] = useMemo(
    () => (homeName === userTeamName ? buildUserPlayoffLineup(result, userTeamName) : buildOpponentPlayoffRoster(result, homeName)),
    [result, userTeamName, homeName],
  );
  const opponent: Player[] = useMemo(
    () => (awayName === userTeamName ? buildUserPlayoffLineup(result, userTeamName) : buildOpponentPlayoffRoster(result, awayName)),
    [result, userTeamName, awayName],
  );
  const userSixthManId = result.sixthManId ?? null;
  const userOptions = result.optionIds ?? null;
  const homeSixth = homeName === userTeamName ? userSixthManId : null;
  const awaySixth = awayName === userTeamName ? userSixthManId : null;
  const homeOptions = homeName === userTeamName ? userOptions : null;
  const awayOptions = awayName === userTeamName ? userOptions : null;
  const validPlayoffRoster = (r: Player[]) => r.length === 5 || r.length === 10;
  const lineupIssue = !validPlayoffRoster(lineup) || !validPlayoffRoster(opponent);

  const MAX_GAMES = 7;
  const { homeWins, awayWins } = useMemo(() => {
    // Scores are always recorded home-side-aligned (your squad in play mode),
    // so homeScore belongs to homeName and awayScore to awayName.
    let home = 0;
    let away = 0;
    for (const game of completedGames) {
      if (game.homeScore > game.awayScore) home++;
      else if (game.awayScore > game.homeScore) away++;
    }
    return { homeWins: home, awayWins: away };
  }, [completedGames]);
  const seriesWinner = homeWins >= 4 ? teamAbbreviation(homeName) : awayWins >= 4 ? teamAbbreviation(awayName) : null;
  const seriesDecided = homeWins >= 4 || awayWins >= 4;
  // Latest first: the just-simulated game sits at the top, already expanded.
  const orderedGames = useMemo(
    () => completedGames.map((game, index) => ({ game, gameNumber: index + 1 })).reverse(),
    [completedGames],
  );
  // Sweep shows 4/4 (100%), not 4/7 — total collapses once decided.
  const progressTotal = seriesDecided ? completedGames.length || 1 : MAX_GAMES;

  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  const simulate = useCallback(async () => {
    if (readOnly || lineupIssue || running) return;
    if (completedGames.length >= MAX_GAMES || seriesDecided) return;
    const startIndex = completedGames.length;
    setRunning(true);
    setProgress(startIndex);
    setLiveGame(null);
    setLiveQuarter(null);
    setLiveQuarterScores(null);
    setLiveGameScore(null);
    abortRef.current = false;

    try {
      let runningHomeWins = homeWins;
      let runningAwayWins = awayWins;
      for (let index = startIndex; index < MAX_GAMES; index++) {
        if (abortRef.current) break;
        const response = await api.simulation.runGame(lineup, opponent, index + 1, homeSixth, awaySixth, homeOptions, awayOptions);
        if (abortRef.current) break;
        const nextGame = response.result;
        // Live from 0-0: animate first, record only on the final buzzer.
        setLiveGame(nextGame);
        setLiveGameScore({ home: 0, away: 0 });

        const quarterScores = getQuarterScores(nextGame);
        const quarters = quarterScores.map((score) => score.quarter);
        let completedScore = { home: 0, away: 0 };
        for (const quarter of quarters.length > 0 ? quarters : [1, 2, 3, 4]) {
          if (abortRef.current) break;
          setLiveQuarter(quarter);
          const quarterScore = quarterScores[quarter - 1] ?? { home: 0, away: 0 };
          await countQuarterScore(
            quarterScore.home,
            quarterScore.away,
            (score) => {
              setLiveQuarterScores(score);
              setLiveGameScore({
                home: completedScore.home + score.home,
                away: completedScore.away + score.away,
              });
            },
            () => abortRef.current,
          );
          completedScore = {
            home: completedScore.home + quarterScore.home,
            away: completedScore.away + quarterScore.away,
          };
          if (abortRef.current) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (abortRef.current) break;
        setLiveGameScore(completedScore);

        // Final buzzer: only now does the result count (series score, stats, progress).
        // Mirror into a ref too — the clincher's save effect may never run
        // because completion unmounts this modal in the same task.
        gamesRef.current = [...gamesRef.current, nextGame];
        setCompletedGames(gamesRef.current);
        setLiveGame(null);
        setProgress(index + 1);
        runningHomeWins += nextGame.homeScore > nextGame.awayScore ? 1 : 0;
        runningAwayWins += nextGame.awayScore > nextGame.homeScore ? 1 : 0;
        if (runningHomeWins >= 4 || runningAwayWins >= 4) break;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      if (!abortRef.current && (runningHomeWins >= 4 || runningAwayWins >= 4)) {
        const winner = runningHomeWins >= 4 ? homeName : awayName;
        onSeriesComplete(winner, gamesRef.current);
        notify.success(`${teamAbbreviation(winner)} wins the series!`);
      }
    } catch (error) {
      if (!abortRef.current) notify.error(error instanceof Error ? error.message : 'Playoff simulation failed');
    } finally {
      setRunning(false);
      setLiveGame(null);
    }
  }, [readOnly, lineup, opponent, running, completedGames.length, seriesDecided, homeWins, awayWins, lineupIssue, homeName, awayName, onSeriesComplete, homeSixth, awaySixth, homeOptions, awayOptions]);

  useLockBodyScroll(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-broadcast-dark/90 p-4 backdrop-blur-sm"
      onClick={() => {
        abortRef.current = true;
        onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-broadcast-border bg-broadcast-card p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Playoff series ${seriesKey}: ${homeName} vs ${awayName}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold tracking-wide text-white">
              {readOnly ? 'SERIES REVIEW' : 'BEST-OF-7 SERIES'}
            </h2>
            <p className="truncate text-xs text-broadcast-text-secondary" title={`${homeName} vs ${awayName}`}>
              {teamAbbreviation(homeName)} vs {teamAbbreviation(awayName)} •{' '}
              {readOnly ? `${completedGames.length} games saved` : 'First to 4 • Neutral court'}
            </p>
          </div>
          <button
            onClick={() => {
              abortRef.current = true;
              onClose();
            }}
            className="rounded-lg p-2 text-broadcast-text-secondary hover:bg-broadcast-border"
            aria-label="Close playoff simulation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {(homeWins > 0 || awayWins > 0) && (
          <div className="mt-4 text-center" title={`${homeName} vs ${awayName}`}>
            <div className="font-display text-2xl font-bold tracking-wide text-white">
              {teamAbbreviation(homeName)}{' '}
              <span className="text-broadcast-accent">{homeWins}</span>
              <span className="mx-1 text-broadcast-text-muted">–</span>
              <span className="text-broadcast-gold">{awayWins}</span>{' '}
              {teamAbbreviation(awayName)}
            </div>
            <div className="mt-0.5 text-xs font-medium text-broadcast-text-secondary">
              {seriesWinner ? (
                <span className="font-bold text-broadcast-gold">{seriesWinner} ADVANCES</span>
              ) : (
                <>First to 4 • Game {completedGames.length + 1} next</>
              )}
            </div>
          </div>
        )}

        {!readOnly && (
          <button
            onClick={() => void simulate()}
            disabled={running || seriesDecided || lineupIssue}
            className="btn-primary mt-4 w-full py-2.5 text-sm disabled:opacity-60"
          >
            {running
              ? `GAME ${progress + 1} • ${liveQuarter && liveQuarter > 4 ? `OT${liveQuarter - 4}` : `Q${liveQuarter ?? 1}`} SIMULATING…`
              : seriesWinner
                ? `${seriesWinner} WIN SERIES`
                : completedGames.length >= MAX_GAMES
                  ? 'SERIES COMPLETE'
                  : completedGames.length > 0
                    ? `CONTINUE WITH GAME ${completedGames.length + 1}`
                    : 'START REAL-TIME SIMULATION'}
          </button>
        )}
        {lineupIssue && (
          <p className="mt-2 text-center text-xs text-broadcast-red">
            Playoff lineup incomplete for this save — start a new season to play the bracket.
          </p>
        )}

        {(running || progress > 0) && (
          <div className="mt-3" role="status">
            <div className="mb-1.5 flex items-center justify-between text-xs text-broadcast-text-secondary">
              <span className="font-medium tracking-wide">
                {seriesDecided ? 'SERIES COMPLETE' : `GAME ${Math.min(progress + 1, progressTotal)} OF ${progressTotal}`}
              </span>
              <span className="font-mono">
                {progress}/{progressTotal}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-broadcast-darker">
              <div className="h-full bg-broadcast-accent transition-all" style={{ width: `${(progress / progressTotal) * 100}%` }} />
            </div>
          </div>
        )}

        {(completedGames.length > 0 || liveGame) && (
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <p className="mb-2 shrink-0 text-[11px] font-semibold tracking-wider text-broadcast-text-muted">
              LATEST FIRST • EXPAND ANY GAME FOR QUARTERS + BOTH TEAMS&apos; STATS
            </p>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {liveGame && (
                <PlayoffGameSummary
                  key="live-game"
                  gameNumber={completedGames.length + 1}
                  game={liveGame}
                  homeTeam={lineup}
                  awayTeam={opponent}
                  homeTeamName={homeName}
                  awayTeamName={awayName}
                  defaultOpen
                  hideStats
                  isSimulating
                  liveQuarter={liveQuarter}
                  liveQuarterScores={liveQuarterScores}
                  liveGameScore={liveGameScore}
                />
              )}
              {orderedGames.map(({ game, gameNumber }) => (
                <PlayoffGameSummary
                  key={`game-${gameNumber}`}
                  gameNumber={gameNumber}
                  game={game}
                  homeTeam={lineup}
                  awayTeam={opponent}
                  homeTeamName={homeName}
                  awayTeamName={awayName}
                  // Collapsed: open a game yourself to see its quarters + box scores.
                  defaultOpen={false}
                  isSimulating={false}
                  liveQuarter={null}
                  liveQuarterScores={null}
                  liveGameScore={null}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const PlayoffGameSummary = memo(function PlayoffGameSummary({
  gameNumber,
  game,
  homeTeam,
  awayTeam,
  homeTeamName,
  awayTeamName,
  defaultOpen,
  hideStats,
  isSimulating,
  liveQuarter,
  liveQuarterScores,
  liveGameScore,
}: {
  gameNumber: number;
  game: PlayoffGameResult;
  homeTeam: Player[];
  awayTeam: Player[];
  homeTeamName: string;
  awayTeamName: string;
  defaultOpen?: boolean;
  /** Live game: quarters animate from 0-0, box scores stay hidden until the buzzer. */
  hideStats?: boolean;
  isSimulating: boolean;
  liveQuarter: number | null;
  liveQuarterScores: { home: number; away: number } | null;
  liveGameScore: { home: number; away: number } | null;
}) {
  const quarterScores = useMemo(() => {
    const base = getQuarterScores(game);
    if (!liveQuarter) return base;
    return base.map((score) => {
      if (score.quarter > liveQuarter) return { ...score, home: 0, away: 0 };
      if (score.quarter === liveQuarter && liveQuarterScores) return { ...score, ...liveQuarterScores };
      return score;
    });
  }, [game, liveQuarter, liveQuarterScores]);

  const renderStats = (team: Player[], stats: Record<string, PlayerStats>, minutes: Record<string, number>) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="border-b border-broadcast-border text-[11px] uppercase tracking-wider text-broadcast-text-muted">
            <th className="py-1.5 text-left font-semibold">Player</th>
            <th className="py-1.5 text-center font-semibold">Min</th>
            <th className="py-1.5 text-center font-semibold">Pts</th>
            <th className="py-1.5 text-center font-semibold">Reb</th>
            <th className="py-1.5 text-center font-semibold">Ast</th>
            <th className="py-1.5 text-center font-semibold">Stl</th>
            <th className="py-1.5 text-center font-semibold">Blk</th>
            <th className="py-1.5 text-center font-semibold" title="Personal fouls (capped at 5 — never benches anyone)">PF</th>
          </tr>
        </thead>
        <tbody>
          {team.map((player) => {
            const playerStats = stats[player.id] ?? { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, pf: 0 };
            return (
              <tr key={player.id} className="border-b border-broadcast-border/40 last:border-0">
                <td className="whitespace-nowrap py-1.5 pr-2 text-left font-medium text-white">{player.name}</td>
                <td className="py-1.5 text-center tabular-nums text-broadcast-text-secondary">{minutes[player.id] ?? 0}</td>
                {(['pts', 'reb', 'ast', 'stl', 'blk', 'pf'] as const).map((stat) => (
                  <td key={stat} className="py-1.5 text-center font-semibold tabular-nums text-white">
                    {playerStats[stat] ?? 0}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const homeWon = game.homeScore > game.awayScore;

  return (
    <details open={defaultOpen} className="rounded-xl border border-broadcast-border/70 bg-broadcast-darker/60">
      <summary className="cursor-pointer list-none px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 rounded-md bg-broadcast-card px-1.5 py-0.5 font-mono text-xs font-bold text-broadcast-text-secondary">
            G{gameNumber}
          </span>
          <span className="font-mono text-base font-bold tabular-nums text-white">
            {liveGameScore?.home ?? game.homeScore}
            <span className="mx-1 text-broadcast-text-muted">–</span>
            {liveGameScore?.away ?? game.awayScore}
          </span>
          {isSimulating ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-broadcast-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-broadcast-accent" aria-hidden="true" />
              LIVE
            </span>
          ) : (
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold',
                homeWon ? 'bg-broadcast-accent/15 text-broadcast-accent' : 'bg-broadcast-red/15 text-broadcast-red',
              )}
            >
              {homeWon ? `${teamAbbreviation(homeTeamName)} W` : `${teamAbbreviation(awayTeamName)} W`}
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs text-broadcast-text-muted">
            {game.otPeriods ? `${game.otPeriods}OT` : 'Final'}
          </span>
        </div>
      </summary>
      <div className="space-y-3 border-t border-broadcast-border/60 px-3 py-3">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {quarterScores.map(({ quarter, home, away }) => {
            const homeLeads = home > away;
            const awayLeads = away > home;
            return (
              <div
                key={quarter}
                className={cn(
                  'min-w-[64px] flex-1 rounded-lg border px-2 py-1.5 text-center',
                  liveQuarter === quarter ? 'border-broadcast-accent ring-1 ring-broadcast-accent/50' : 'border-broadcast-border/60',
                )}
              >
                <div className="text-[10px] font-bold tracking-wider text-broadcast-text-muted">{quarter <= 4 ? `Q${quarter}` : `OT${quarter - 4}`}</div>
                <div className="mt-0.5 flex justify-center gap-1.5 font-mono text-[13px] tabular-nums">
                  <span className={cn(homeLeads && 'font-bold text-broadcast-accent')}>{home}</span>
                  <span className="text-broadcast-text-muted">-</span>
                  <span className={cn(awayLeads && 'font-bold text-broadcast-gold')}>{away}</span>
                </div>
              </div>
            );
          })}
        </div>
        {!hideStats && (
          <>
            <div>
              <h4 className="mb-1 text-[11px] font-bold tracking-wider text-broadcast-text-muted" title={homeTeamName}>
                {teamAbbreviation(homeTeamName)}
              </h4>
              {renderStats(homeTeam, game.homePlayerStats, game.homeMinutes)}
            </div>
            <div>
              <h4 className="mb-1 text-[11px] font-bold tracking-wider text-broadcast-text-muted" title={awayTeamName}>
                {teamAbbreviation(awayTeamName)}
              </h4>
              {renderStats(awayTeam, game.awayPlayerStats, game.awayMinutes)}
            </div>
          </>
        )}
      </div>
    </details>
  );
});

// ---------------------------------------------------------------------------
// League stats
// ---------------------------------------------------------------------------

type LeagueSortKey = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'mpg' | 'gp' | 'name';

function LeagueView({ result }: { result: SimulationResult }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'user' | 'opp'>('all');
  const [sortKey, setSortKey] = useState<LeagueSortKey>('pts');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const rows = useMemo(() => buildLeagueRows(result), [result]);

  const leaders = useMemo(() => {
    // Minimum-sample guard: on old saves CPU rows have 2-3 GP vs your 82 —
    // require >=50% of max GP (min 5) so a one-game fluke can't lead the league.
    const maxGP = rows.reduce((m, r) => Math.max(m, r.gp), 0);
    const minGP = Math.max(5, Math.floor(maxGP * 0.5));
    const eligible = rows.filter((r) => r.gp >= minGP);
    const pool = eligible.length > 0 ? eligible : rows;
    const best = (k: keyof PlayerStats) =>
      pool.reduce<LeagueRow | null>((top, r) => (!top || r.averages[k] > top.averages[k] ? r : top), null);
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
    const out = rows.filter((r) => {
      if (filter === 'user' && !r.isUser) return false;
      if (filter === 'opp' && r.isUser) return false;
      if (q && !`${r.playerName} ${r.team} ${formatTeamName(r.team)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return out.slice().sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.playerName.localeCompare(b.playerName);
      else if (sortKey === 'mpg') cmp = a.mpg - b.mpg;
      else if (sortKey === 'gp') cmp = a.gp - b.gp;
      else cmp = a.averages[sortKey] - b.averages[sortKey];
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [rows, query, filter, sortKey, sortDir]);

  const toggleSort = useCallback(
    (key: LeagueSortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      } else {
        setSortKey(key);
        setSortDir(key === 'name' ? 'asc' : 'desc');
      }
    },
    [sortKey],
  );

  const hasOpponents = useMemo(() => rows.some((r) => !r.isUser), [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {(['pts', 'reb', 'ast', 'stl', 'blk'] as const).map((k) => {
          const lead = leaders[k];
          return (
            <div key={k} className="p-2.5 bg-broadcast-darker rounded-lg text-center">
              <div className="text-xs text-broadcast-text-muted uppercase tracking-wider mb-1">{STAT_LABELS[k]} LEADER</div>
              <div className="font-bold text-sm text-white truncate" title={lead?.playerName ?? ''}>
                {lead ? toCompactName(lead.playerName) : '—'}
              </div>
              <div className="font-display text-2xl font-bold" style={{ color: STAT_COLORS[k] }}>
                {lead ? lead.averages[k].toFixed(1) : '—'}
              </div>
              {lead && <div className="text-xs text-broadcast-text-muted truncate">{lead.isUser ? 'YOUR TEAM' : formatTeamName(lead.team)}</div>}
            </div>
          );
        })}
      </div>

      <div className="card-elevated p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-broadcast-text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every player in the league…"
            aria-label="Search league players"
            className="w-full bg-broadcast-darker border border-broadcast-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-broadcast-text-muted focus:outline-none focus:border-broadcast-accent/60"
          />
        </div>
        <div className="flex gap-2" role="tablist" aria-label="League filter">
          {(
            [
              ['all', 'ALL'],
              ['user', 'MY TEAM'],
              ['opp', 'OPPONENTS'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              role="tab"
              aria-selected={filter === val}
              onClick={() => setFilter(val)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-bold transition-all',
                filter === val
                  ? 'bg-broadcast-accent text-broadcast-dark'
                  : 'bg-broadcast-card border border-broadcast-border text-broadcast-text-secondary hover:text-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!hasOpponents && (
        <p className="text-sm text-broadcast-text-muted px-1">
          This save was simulated before opponent box scores were recorded, so only your 5 are listed. Simulate a new season for full league stats.
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <caption className="sr-only">League-wide per-game player stats, including your drafted players</caption>
            <thead>
              <tr className="border-b border-broadcast-border text-broadcast-text-secondary text-sm">
                <th scope="col" className="text-left py-2 pl-3 pr-2">
                  #
                </th>
                <th scope="col" className="text-left py-2 px-2">
                  <SortHeader label="PLAYER" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} align="left" />
                </th>
                <th scope="col" className="text-left py-2 px-2">
                  TEAM
                </th>
                <th scope="col" className="text-center py-2 px-2">
                  <SortHeader label="GP" active={sortKey === 'gp'} dir={sortDir} onClick={() => toggleSort('gp')} />
                </th>
                <th scope="col" className="text-center py-2 px-2">
                  <SortHeader label="MPG" active={sortKey === 'mpg'} dir={sortDir} onClick={() => toggleSort('mpg')} />
                </th>
                {(['pts', 'reb', 'ast', 'stl', 'blk'] as const).map((k) => (
                  <th key={k} scope="col" className="text-center py-2 px-2">
                    <SortHeader label={k.toUpperCase()} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} color={STAT_COLORS[k]} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.rowKey}
                  className={cn('border-b border-broadcast-border/50', r.isUser ? 'bg-broadcast-accent/5 hover:bg-broadcast-accent/10' : 'hover:bg-broadcast-border/30')}
                >
                  <td className="py-2 pl-3 pr-2 text-broadcast-text-muted font-mono">{i + 1}</td>
                  <td className="py-2 px-2 font-medium text-white whitespace-nowrap">
                    {r.isUser && (
                      <span className="mr-1.5 inline-block rounded bg-broadcast-accent/20 border border-broadcast-accent/30 px-1 py-px text-xs font-bold text-broadcast-accent align-middle">
                        YOU
                      </span>
                    )}
                    <span title={r.playerName}>{toCompactName(r.playerName)}</span>
                    {r.position && (
                      <span className="ml-1.5 text-xs text-broadcast-text-muted">
                        {r.position}
                        {typeof r.overall === 'number' ? ` ${r.overall}` : ''}
                      </span>
                    )}
                  </td>
                  <td
                    className="py-2 px-2 text-broadcast-text-secondary whitespace-nowrap max-w-[180px] truncate"
                    title={r.isUser ? 'YOUR TEAM' : formatTeamName(r.team)}
                  >
                    {r.isUser ? 'YOUR TEAM' : formatTeamName(r.team)}
                  </td>
                  <td className="py-2 px-2 text-center text-broadcast-text-secondary">{r.gp}</td>
                  <td className="py-2 px-2 text-center text-broadcast-text-secondary">{r.mpg.toFixed(1)}</td>
                  <td className="py-2 px-2 text-center font-bold" style={{ color: STAT_COLORS.pts }}>
                    {r.averages.pts.toFixed(1)}
                  </td>
                  <td className="py-2 px-2 text-center font-bold" style={{ color: STAT_COLORS.reb }}>
                    {r.averages.reb.toFixed(1)}
                  </td>
                  <td className="py-2 px-2 text-center font-bold" style={{ color: STAT_COLORS.ast }}>
                    {r.averages.ast.toFixed(1)}
                  </td>
                  <td className="py-2 px-2 text-center font-bold" style={{ color: STAT_COLORS.stl }}>
                    {r.averages.stl.toFixed(1)}
                  </td>
                  <td className="py-2 px-2 text-center font-bold" style={{ color: STAT_COLORS.blk }}>
                    {r.averages.blk.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-center text-broadcast-text-muted py-8 text-sm">No players match &quot;{query}&quot;.</p>}
        </div>
        <p className="px-3 py-2 text-xs text-broadcast-text-muted border-t border-broadcast-border/50">
          {filtered.length} of {rows.length} players • your drafted 5 are tagged YOU • all players reflect their complete simulated season.
        </p>
      </div>
    </div>
  );
}

const SortHeader = memo(function SortHeader({
  label,
  active,
  dir,
  onClick,
  align,
  color,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  align?: 'left' | 'center';
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sort by ${label} ${active && dir === 'desc' ? 'ascending' : 'descending'}`}
      className={cn('inline-flex items-center gap-1 font-bold hover:text-white', align === 'left' ? '' : 'justify-center', active ? 'text-white' : '')}
      style={color && active ? { color } : undefined}
    >
      {label}
      <span className={cn('text-xs', active ? 'opacity-100' : 'opacity-40')} aria-hidden="true">
        {active ? (dir === 'desc' ? '▼' : '▲') : '↕'}
      </span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

function StandingsView({ result }: { result: SimulationResult }) {
  const standings = useMemo(() => result.standings ?? [], [result.standings]);
  const userRank = useMemo(() => standings.findIndex((s) => s.isUser) + 1, [standings]);

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
      <p className="text-sm text-broadcast-text-muted px-1">
        {standings.length} teams • 82 games each • every team&apos;s games vs you count, the rest are simulated against each other
        {userRank > 0 && (
          <>
            {' '}
            • your team is ranked <span className="font-bold text-broadcast-accent">#{userRank}</span>
          </>
        )}
        .
      </p>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <caption className="sr-only">League standings with wins and losses for every team</caption>
            <thead>
              <tr className="border-b border-broadcast-border text-broadcast-text-secondary text-sm">
                <th scope="col" className="text-left py-2 pl-3 pr-2">
                  #
                </th>
                <th scope="col" className="text-left py-2 px-2">
                  TEAM
                </th>
                <th scope="col" className="text-center py-2 px-2">
                  W
                </th>
                <th scope="col" className="text-center py-2 px-2">
                  L
                </th>
                <th scope="col" className="text-center py-2 px-2">
                  PCT
                </th>
                <th scope="col" className="text-center py-2 px-2">
                  GB
                </th>
                <th scope="col" className="text-center py-2 px-2">
                  PF
                </th>
                <th scope="col" className="text-center py-2 px-2">
                  PA
                </th>
                <th scope="col" className="text-center py-2 px-2">
                  DIFF
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr
                  key={s.team}
                  className={cn('border-b border-broadcast-border/50', s.isUser ? 'bg-broadcast-accent/10 hover:bg-broadcast-accent/15' : 'hover:bg-broadcast-border/30')}
                >
                  <td className="py-2 pl-3 pr-2 text-broadcast-text-muted font-mono">{i + 1}</td>
                  <td className="py-2 px-2 font-medium text-white whitespace-nowrap">
                    {s.isUser && (
                      <span className="mr-1.5 inline-block rounded bg-broadcast-accent/20 border border-broadcast-accent/30 px-1 py-px text-xs font-bold text-broadcast-accent align-middle">
                        YOU
                      </span>
                    )}
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
// Box score
// ---------------------------------------------------------------------------

interface HoverState {
  perf: PlayerGamePerformance;
  isUser: boolean;
  teamLabel: string;
  season: { averages: PlayerStats; gamesPlayed: number; minutesPerGame?: number } | SimulatedPlayerStats | null;
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

  const perfs: PlayerGamePerformance[] = useMemo(() => game.playerPerformances ?? [], [game.playerPerformances]);
  const oppPerfs: PlayerGamePerformance[] = useMemo(() => game.opponentPerformances ?? [], [game.opponentPerformances]);

  const seasonById = useMemo(() => {
    const rows = buildLeagueRows(result);
    const byId = buildSeasonAverageById(rows);
    const userMap = new Map<string, SimulatedPlayerStats>();
    for (const s of result.playerStats) userMap.set(s.playerId, s);
    return { byId, userMap };
  }, [result]);

  const showHover = useCallback(
    (perf: PlayerGamePerformance, isUser: boolean, teamLabel: string, e: React.SyntheticEvent<HTMLElement>) => {
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      const width = 288;
      const height = 300;
      const x = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
      let y = rect.bottom + 8;
      if (y + height > window.innerHeight - 8) {
        y = Math.max(8, rect.top - height - 8);
      }
      // Team-scoped first so a CPU clone sharing a historical id can't show your pick's average.
      const scoped = seasonAverageFor(seasonById.byId, perf.playerId, teamLabel, isUser);
      const season = isUser
        ? (seasonById.userMap.get(perf.playerId) ?? scoped ?? null)
        : (scoped ?? null);
      setHover({ perf, isUser, teamLabel, season, x, y });
    },
    [seasonById],
  );

  const clearHover = useCallback(() => setHover(null), []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-broadcast-dark/90 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-7xl max-h-[90vh] overflow-y-auto bg-broadcast-card border border-broadcast-border rounded-2xl"
        onClick={(e) => e.stopPropagation()}
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
          <p className="text-center text-xs text-broadcast-text-muted mb-4">Hover, focus, or tap a player name for season averages + card ratings.</p>

          <div className="grid gap-6 md:grid-cols-2">
            <BoxScoreTable title="YOUR TEAM" performances={perfs} isUser teamLabel="YOUR TEAM" onHover={showHover} onLeave={clearHover} />
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
      </div>

      {hover && <HoverCard hover={hover} onClose={clearHover} />}
    </div>
  );
}

const HoverCard = memo(function HoverCard({ hover, onClose }: { hover: HoverState; onClose: () => void }) {
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
          <div className="text-xs text-broadcast-text-secondary truncate">
            {teamLabel}
            {perf.position ? ` • ${perf.position}` : ''}
            {typeof perf.overall === 'number' ? ` • ${perf.overall} OVR` : ''}
            {isUser ? ' • YOUR PICK' : ''}
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-broadcast-border text-broadcast-text-muted" aria-label="Dismiss player details">
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 rounded-lg bg-broadcast-card/60 p-2">
        <div className="text-xs font-bold text-broadcast-text-muted uppercase tracking-wider mb-1">This game • {perf.minutes} MIN</div>
        <div className="grid grid-cols-5 gap-1 text-center">
          {(['pts', 'reb', 'ast', 'stl', 'blk'] as const).map((k) => (
            <div key={k}>
              <div className="font-bold text-sm" style={{ color: STAT_COLORS[k] }}>
                {perf.stats[k]}
              </div>
              <div className="text-[10px] text-broadcast-text-muted uppercase">{k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1.5 rounded-lg bg-broadcast-card/60 p-2">
        <div className="text-xs font-bold text-broadcast-text-muted uppercase tracking-wider mb-1">
          Season avg
          {season ? ` • ${season.gamesPlayed} GP${season.minutesPerGame !== undefined ? ` • ${Number(season.minutesPerGame).toFixed(1)} MPG` : ''}` : ''}
        </div>
        {avg ? (
          <div className="grid grid-cols-5 gap-1 text-center">
            {(['pts', 'reb', 'ast', 'stl', 'blk'] as const).map((k) => (
              <div key={k}>
                <div className="font-bold text-sm" style={{ color: STAT_COLORS[k] }}>
                  {avg[k].toFixed(1)}
                </div>
                <div className="text-[10px] text-broadcast-text-muted uppercase">{k}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-broadcast-text-muted">No season average recorded for this save.</p>
        )}
      </div>

      {perf.baseStats && (
        <div className="mt-1.5 rounded-lg bg-broadcast-card/60 p-2">
          <div className="text-xs font-bold text-broadcast-text-muted uppercase tracking-wider mb-1">Card ratings</div>
          <div className="grid grid-cols-5 gap-1 text-center">
            {(['pts', 'reb', 'ast', 'stl', 'blk'] as const).map((k) => (
              <div key={k}>
                <div className="font-mono text-xs text-broadcast-text-secondary">{Number(perf.baseStats![k]).toFixed(1)}</div>
                <div className="text-[10px] text-broadcast-text-muted uppercase">{k}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

const BoxScoreTable = memo(function BoxScoreTable({
  title,
  performances,
  emptyText,
  isUser,
  teamLabel,
  onHover,
  onLeave,
}: {
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
        <table className="w-full text-base">
          <caption className="sr-only">{title} player performances</caption>
          <thead>
            <tr className="border-b border-broadcast-border text-broadcast-text-secondary">
              <th scope="col" className="text-left py-2 pl-1 pr-2">
                PLAYER
              </th>
              <th scope="col" className="text-center py-2 px-2">
                MIN
              </th>
              <th scope="col" className="text-center py-2 px-2" style={{ color: STAT_COLORS.pts }}>
                PTS
              </th>
              <th scope="col" className="text-center py-2 px-2" style={{ color: STAT_COLORS.reb }}>
                REB
              </th>
              <th scope="col" className="text-center py-2 px-2" style={{ color: STAT_COLORS.ast }}>
                AST
              </th>
              <th scope="col" className="text-center py-2 px-2" style={{ color: STAT_COLORS.stl }}>
                STL
              </th>
              <th scope="col" className="text-center py-2 px-2" style={{ color: STAT_COLORS.blk }}>
                BLK
              </th>
              <th scope="col" className="text-center py-2 px-2" style={{ color: STAT_COLORS.pf }} title="Personal fouls (capped at 5 — never benches anyone)">
                PF
              </th>
            </tr>
          </thead>
          <tbody>
            {performances.map((perf) => (
              <tr key={perf.playerId} className="border-b border-broadcast-border/50 hover:bg-broadcast-border/50">
                <td className="whitespace-nowrap py-2 pl-1 pr-2 font-medium">
                  <button
                    type="button"
                    title={`${perf.playerName} — hover for season + card stats`}
                    onMouseEnter={(e) => onHover?.(perf, !!isUser, teamLabel ?? title, e)}
                    onFocus={(e) => onHover?.(perf, !!isUser, teamLabel ?? title, e)}
                    onMouseLeave={onLeave}
                    onBlur={onLeave}
                    onClick={(e) => onHover?.(perf, !!isUser, teamLabel ?? title, e)}
                    className="underline decoration-dotted decoration-broadcast-accent/50 underline-offset-4 hover:text-broadcast-accent hover:decoration-broadcast-accent focus:outline-none focus:text-broadcast-accent cursor-help text-left"
                  >
                    {toCompactName(perf.playerName)}
                  </button>
                </td>
                <td className="text-center py-2 px-2 text-broadcast-text-secondary">{perf.minutes}</td>
                <td className="text-center py-2 px-2 font-bold" style={{ color: STAT_COLORS.pts }}>
                  {perf.stats.pts}
                </td>
                <td className="text-center py-2 px-2 font-bold" style={{ color: STAT_COLORS.reb }}>
                  {perf.stats.reb}
                </td>
                <td className="text-center py-2 px-2 font-bold" style={{ color: STAT_COLORS.ast }}>
                  {perf.stats.ast}
                </td>
                <td className="text-center py-2 px-2 font-bold" style={{ color: STAT_COLORS.stl }}>
                  {perf.stats.stl}
                </td>
                <td className="text-center py-2 px-2 font-bold" style={{ color: STAT_COLORS.blk }}>
                  {perf.stats.blk}
                </td>
                <td className="text-center py-2 px-2 font-bold" style={{ color: STAT_COLORS.pf }}>
                  {perf.stats.pf ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {performances.length === 0 && <p className="text-center text-broadcast-text-muted py-6">{emptyText ?? 'No per-player box score recorded for this game.'}</p>}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Small cards
// ---------------------------------------------------------------------------

const StatCard = memo(function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  trend,
  trendLabel,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  iconColor: string;
  trend?: 'positive' | 'negative';
  trendLabel?: string;
}) {
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
      {trendLabel && !trend && <div className="mt-1 text-xs font-medium text-broadcast-text-muted">{trendLabel}</div>}
    </div>
  );
});

const TeamMetric = memo(function TeamMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center p-2.5 bg-broadcast-darker rounded-lg">
      <div className="text-xs text-broadcast-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="font-display text-3xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
});
