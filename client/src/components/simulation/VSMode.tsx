import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Trophy, Zap, Star, RefreshCw } from 'lucide-react';
import { cn, getPositionColor, calculateTeamStrength, getBaseTeamImpact, getWinProjection, otLabel, counterMinutesPreview, foulRiskLabel } from '../../utils/helpers';
import { useGameStore, minutesSum, isMinutesValid } from '../../store/gameStore';
import { notify } from '../../store/toastStore';
import { api } from '../../utils/api';
import { HISTORICAL_TEAMS, historicalTeamColors } from '../../data/historicalTeams';
import type { HistoricalTeam, VSModeMatchup, VSSeriesResult, PlayerGamePerformance, Player, PlayerStats } from '../../types/game';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(255,215,0,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function bestTextOn(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return '#fff';
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111111' : '#ffffff';
}

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
  const [preview, setPreview] = useState<null | {
    teamId: string;
    you: number;
    opp: number;
    homeStats: Record<string, PlayerStats>;
    awayStats: Record<string, PlayerStats>;
  }>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const slots = draftState.lineup.slots;
  const lineup = slots.map(s => s.player).filter((p): p is Player => p !== null);
  const yourSixth = slots.find(s => s.isSixthMan && s.player)?.player ?? null;
  const sixthManId = slots.find(s => s.isSixthMan && s.player)?.player?.id;
  const options = (() => {
    const r = (rank: 1 | 2 | 3) => slots.find(s => s.optionRank === rank && s.player)?.player?.id ?? null;
    return { first: r(1), second: r(2), third: r(3) };
  })();
  const {
    ensureMinutesInitialized, setPlayerMinutes, rebalanceMinutes, resetMinutesToDefault,
  } = useGameStore();
  const minutes = draftState.minutes;
  const minutesTotal = Math.round(minutesSum(minutes));
  const minutesValid = isMinutesValid(slots, minutes);
  const minutesAuto = !(draftState.minutesExplicit ?? false);
  const teamStrength = calculateTeamStrength(lineup, sixthManId, options, minutes ?? null);
  const projectedWins = getWinProjection(teamStrength);

  // Seed the minutes plan once (same AUTO defaults as season setup) + fetch legends.
  useEffect(() => {
    ensureMinutesInitialized();
  }, [ensureMinutesInitialized]);
  useEffect(() => {
    if (historicalTeams.length === 0) {
      api.simulation.getHistoricalTeams()
        .then(data => setHistoricalTeams(data.teams))
        .catch(() => {
          // Offline backup: local reference list (ids match the server sim).
          setHistoricalTeams(HISTORICAL_TEAMS);
          notify.error('Live legends list unreachable — showing offline reference');
        });
    }
  }, [historicalTeams.length, setHistoricalTeams]);

  // Opponent aggregates + CPU counter-minutes preview (mirrors the server).
  const oppPlayers = selectedTeam?.players ?? [];
  const hasOppRoster = oppPlayers.length > 0;
  const cpuPreview = useMemo(() => {
    if (!selectedTeam || !hasOppRoster || !minutes) return null;
    try {
      return counterMinutesPreview(oppPlayers, lineup, minutes);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeam?.id, hasOppRoster, minutes, lineup.length]);
  const oppColors = selectedTeam ? historicalTeamColors(selectedTeam.id) : null;
  const sumPts = (ps: Player[]) => ps.reduce((t, p) => t + (p.stats?.pts ?? 0), 0);
  const avgOvr = (ps: Player[]) => (ps.length > 0 ? ps.reduce((t, p) => t + (p.overall ?? 0), 0) / ps.length : 0);
  const youPPG = sumPts(lineup);
  const oppPPG = sumPts(oppPlayers);
  const youOVR = avgOvr(lineup);
  const oppOVR = avgOvr(oppPlayers);
  const sumStat = (ps: Player[], k: 'reb' | 'ast' | 'stl' | 'blk') => ps.reduce((t, p) => t + (p.stats?.[k] ?? 0), 0);
  const youREB = sumStat(lineup, 'reb');
  const oppREB = sumStat(oppPlayers, 'reb');
  const youAST = sumStat(lineup, 'ast');
  const oppAST = sumStat(oppPlayers, 'ast');
  const youSTK = sumStat(lineup, 'stl') + sumStat(lineup, 'blk');
  const oppSTK = sumStat(oppPlayers, 'stl') + sumStat(oppPlayers, 'blk');
  const topOvr = (ps: Player[]) => ps.reduce<Player | null>((best, p) => (!best || (p.overall ?? 0) > (best.overall ?? 0) ? p : best), null);
  const youStar = topOvr(lineup);
  const oppStar = topOvr(oppPlayers);
  const oppStrength = hasOppRoster ? calculateTeamStrength(oppPlayers, null, null, cpuPreview) : 0;
  const topScorers = [...oppPlayers].sort((a, b) => (b.stats?.pts ?? 0) - (a.stats?.pts ?? 0)).slice(0, 3);

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

  // One-game preview sim: shows each side's SIM pts next to base PPG, using
  // the current minutes plan (yours + the CPU counter). Auto-runs on select,
  // re-run manually after minutes edits.
  const runPreview = async () => {
    if (!selectedTeam || !hasOppRoster || !minutesValid || !minutes || previewLoading) return;
    setPreviewLoading(true);
    try {
      const data = await api.simulation.runGame(
        lineup, oppPlayers, undefined,
        sixthManId ?? null, null, options, null, minutes, cpuPreview,
      );
      setPreview({
        teamId: selectedTeam.id,
        you: data.result.homeScore,
        opp: data.result.awayScore,
        homeStats: data.result.homePlayerStats,
        awayStats: data.result.awayPlayerStats,
      });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Preview sim failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    setPreview(null);
    if (selectedTeam && hasOppRoster && minutesValid && minutes) {
      void runPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeam?.id]);

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
                {historicalTeams.map(team => {
                  const colors = historicalTeamColors(team.id);
                  const isSelected = selectedTeam?.id === team.id;
                  const cardPPG = team.players.length > 0
                    ? team.players.reduce((t, p) => t + (p.stats?.pts ?? 0), 0)
                    : null;
                  return (
                    <motion.button
                      key={team.id}
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedTeam(team)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        'relative overflow-hidden p-4 rounded-xl text-left transition-all border',
                        isSelected
                          ? 'border-2 bg-broadcast-card'
                          : 'border-broadcast-border bg-broadcast-card'
                      )}
                      style={isSelected
                        ? { borderColor: colors.color, boxShadow: `0 0 24px ${hexToRgba(colors.color, 0.35)}` }
                        : undefined}
                    >
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-10 top-0 h-full w-24 rotate-12"
                        style={{ backgroundColor: hexToRgba(colors.color, 0.10) }}
                      />
                      <div className="relative flex items-center gap-3">
                        <div
                          className="relative w-14 h-14 shrink-0 overflow-hidden rounded-xl flex items-center justify-center border border-white/10"
                          style={{ backgroundColor: colors.color }}
                        >
                          <span
                            aria-hidden="true"
                            className="absolute inset-0"
                            style={{ background: 'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.28) 48%, transparent 62%)' }}
                          />
                          <span className="relative font-display text-base font-bold tracking-wide" style={{ color: bestTextOn(colors.color) }}>
                            {colors.abbreviation}
                          </span>
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-white">{team.name}</h4>
                          <p className="text-sm text-broadcast-text-secondary">
                            {team.season} • {team.record}
                            {cardPPG !== null && <> • <span className="font-bold" style={{ color: colors.color }}>{cardPPG.toFixed(1)} PPG</span></>}
                          </p>
                        </div>
                        {isSelected && (
                          <div
                            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: colors.color }}
                          >
                            <Star className="w-3 h-3 text-broadcast-dark" aria-hidden="true" />
                          </div>
                        )}
                      </div>
                      <p className="relative mt-3 text-sm text-broadcast-text-muted line-clamp-2">{team.description}</p>
                    </motion.button>
                  );
                })}
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

            {selectedTeam && (
              <div className="card-elevated p-6">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="section-title font-display text-lg">HEAD-TO-HEAD MATCHUPS</h3>
                  <button
                    type="button"
                    onClick={() => void runPreview()}
                    disabled={!minutesValid || previewLoading || !hasOppRoster}
                    title={minutesValid ? 'Sim one preview game with current minutes' : 'Set minutes to 240 first'}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-broadcast-text-secondary transition-colors hover:border-broadcast-accent/50 hover:text-white disabled:opacity-50"
                  >
                    <RefreshCw className={cn('w-3.5 h-3.5', previewLoading && 'animate-spin')} aria-hidden="true" />
                    {previewLoading ? 'SIMMING…' : 'PREVIEW SIM'}
                  </button>
                </div>
                <p className="text-xs text-broadcast-text-secondary mb-4">
                  Starters pair by slot{yourSixth ? ', plus your 6th man vs their first sub' : ''}. ± is the single-player impact edge.
                  Base is the historical average; SIM is engine output at these minutes (pace, matchup and competition adjusted) — that's why SIM differs from base.
                  {minutesValid ? ' Re-sim after minutes edits.' : ' Needs 240 minutes.'}
                </p>
                {preview && preview.teamId === selectedTeam.id && (
                  <p className="mb-3 text-center text-sm font-bold">
                    <span className="text-broadcast-accent">YOU {preview.you}</span>
                    <span className="text-broadcast-text-muted"> – </span>
                    <span style={{ color: oppColors?.color ?? '#ffd700' }}>{preview.opp} OPP</span>
                    <span className="ml-2 text-[11px] font-medium text-broadcast-text-muted">preview</span>
                  </p>
                )}
                {!hasOppRoster ? (
                  <p className="text-sm text-broadcast-text-secondary">Connect to load the legends' roster for matchup edges.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-wider text-broadcast-text-muted">
                      <span>Your five</span>
                      <span className="w-14 text-center">Edge</span>
                      <span className="text-right">{selectedTeam.name}</span>
                    </div>
                    {slots.slice(0, 5).map((slot, i) => {
                      const you = slot.player;
                      const opp = oppPlayers[i];
                      if (!you || !opp) return null;
                      const live = preview && preview.teamId === selectedTeam.id;
                      return (
                        <MatchupRow
                          key={you.id}
                          you={you}
                          opp={opp}
                          youMin={Math.round(minutes?.[you.id] ?? 0)}
                          oppMin={cpuPreview ? Math.round(cpuPreview[opp.id] ?? 0) : null}
                          simYou={live ? preview.homeStats[you.id]?.pts : undefined}
                          simOpp={live ? preview.awayStats[opp.id]?.pts : undefined}
                          oppColor={oppColors?.color}
                        />
                      );
                    })}
                    {yourSixth && oppPlayers[5] && (() => {
                      const live = preview && preview.teamId === selectedTeam.id;
                      const opp = oppPlayers[5]!;
                      return (
                        <MatchupRow
                          key={yourSixth!.id}
                          you={yourSixth!}
                          opp={opp}
                          youMin={Math.round(minutes?.[yourSixth!.id] ?? 0)}
                          oppMin={cpuPreview ? Math.round(cpuPreview[opp.id] ?? 0) : null}
                          simYou={live ? preview.homeStats[yourSixth!.id]?.pts : undefined}
                          simOpp={live ? preview.awayStats[opp.id]?.pts : undefined}
                          oppColor={oppColors?.color}
                          sixth
                        />
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {selectedTeam && (
              <div className="card-elevated p-6">
                <h3 className="section-title font-display text-lg mb-1">MATCHUP COMPARISON</h3>
                <p className="text-xs text-broadcast-text-secondary mb-4">
                  Base-year stats (PPG) and ratings head-to-head{minutesValid ? ', strengths with your minutes plan' : ''}.
                </p>
                {!hasOppRoster ? (
                  <p className="text-sm text-broadcast-text-secondary">Connect to load the legends' roster for a full comparison.</p>
                ) : (
                  <div className="space-y-4">
                    <CompareRow label="TEAM PPG" you={youPPG} opp={oppPPG} decimals={1} oppColor={oppColors?.color} />
                    <CompareRow label="TEAM REB" you={youREB} opp={oppREB} decimals={1} oppColor={oppColors?.color} />
                    <CompareRow label="TEAM AST" you={youAST} opp={oppAST} decimals={1} oppColor={oppColors?.color} />
                    <CompareRow label="STOCKS (STL+BLK)" you={youSTK} opp={oppSTK} decimals={1} oppColor={oppColors?.color} />
                    <CompareRow label="AVG OVR" you={youOVR} opp={oppOVR} decimals={1} oppColor={oppColors?.color} />
                    <CompareRow label="TEAM STR" you={teamStrength} opp={oppStrength} decimals={0} oppColor={oppColors?.color} />
                    {youStar && oppStar && (
                      <div>
                        <div className="text-center text-[11px] font-bold text-broadcast-text-muted uppercase tracking-wider mb-1">Star power</div>
                        <div className="flex items-start justify-between gap-2 text-sm">
                          <span className="font-bold text-broadcast-accent">{youStar.name} <span className="text-broadcast-text-secondary font-medium">{youStar.overall} OVR</span></span>
                          <span className="font-bold text-right" style={{ color: oppColors?.color ?? '#ffd700' }}>{oppStar.name} <span className="text-broadcast-text-secondary font-medium">{oppStar.overall} OVR</span></span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="card-elevated p-6" aria-label="Your minutes plan">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="section-title font-display text-lg">
                    YOUR MINUTES{minutesAuto && <span className="ml-2 rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1.5 py-px text-[10px] font-bold text-broadcast-gold">AUTO</span>}
                  </h3>
                  <p className="text-xs text-broadcast-text-secondary">
                    Set the rotation before you challenge. The CPU counters it with its own minutes — heavy usage draws extra legend run at your spots.
                  </p>
                </div>
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', minutesValid ? 'border-broadcast-accent/50 bg-broadcast-accent/15 text-broadcast-accent' : 'border-broadcast-gold/50 bg-broadcast-gold/15 text-broadcast-gold')}>
                  {minutesTotal}/240
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Minutes actions">
                <button
                  type="button"
                  onClick={() => rebalanceMinutes()}
                  className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-broadcast-text-secondary transition-colors hover:border-broadcast-accent/50 hover:text-white"
                >
                  REBALANCE
                </button>
                <button
                  type="button"
                  onClick={() => resetMinutesToDefault()}
                  className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-broadcast-text-secondary transition-colors hover:border-broadcast-accent/50 hover:text-white"
                >
                  RESET
                </button>
              </div>
              <div className="mt-2.5 space-y-1.5">
                {slots.map((slot) => {
                  const p = slot.player;
                  if (!p) return null;
                  const v = Math.round(minutes?.[p.id] ?? 0);
                  const risk = foulRiskLabel(p);
                  return (
                    <div key={p.id} className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-black/20 px-2.5 py-1.5">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                        style={{ backgroundColor: getPositionColor(p.position) }}
                        aria-hidden="true"
                      >
                        {p.position}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">
                          {p.name}
                          <span className="ml-1.5 text-[11px] font-medium text-broadcast-text-muted">
                            {slot.role === 'bench' ? 'BENCH' : 'STARTER'} • {p.overall}
                          </span>
                          <span
                            title={risk === 'High' ? 'High foul risk' : risk === 'Low' ? 'Low foul risk' : 'Average foul risk'}
                            className={cn(
                              'ml-1.5 rounded-full border px-1.5 py-px text-[10px] font-bold',
                              risk === 'High'
                                ? 'border-broadcast-red/50 bg-broadcast-red/15 text-broadcast-red'
                                : risk === 'Low'
                                  ? 'border-broadcast-accent/50 bg-broadcast-accent/15 text-broadcast-accent'
                                  : 'border-broadcast-gold/50 bg-broadcast-gold/15 text-broadcast-gold'
                            )}
                          >
                            {risk === 'High' ? 'HIGH FOUL' : risk === 'Low' ? 'LOW FOUL' : 'MED FOUL'}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={48}
                          step={1}
                          value={v}
                          onChange={(e) => setPlayerMinutes(p.id, Number(e.target.value))}
                          aria-label={`Minutes for ${p.name}`}
                          className="mt-1 w-full accent-amber-400"
                        />
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={48}
                        step={1}
                        value={v}
                        onChange={(e) => setPlayerMinutes(p.id, Number(e.target.value))}
                        aria-label={`Minutes number for ${p.name}`}
                        className="w-14 shrink-0 rounded-lg border border-white/10 bg-broadcast-darker px-2 py-1 text-center text-sm font-bold text-white focus:border-broadcast-accent/60 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                  );
                })}
              </div>
              {!minutesValid && (
                <p className="mt-2 text-xs font-medium text-broadcast-gold" role="alert">
                  Total is {minutesTotal}/240. Hit REBALANCE to unlock the challenge (DNP zeros stay put).
                </p>
              )}
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
                  style={oppColors ? { borderTop: `3px solid ${oppColors.color}` } : undefined}
                >
                  <h4 className="font-medium text-broadcast-text-secondary mb-4">SCOUTING REPORT</h4>
                  <div className="space-y-3">
                    <ScoutingRow label="ERA" value={selectedTeam.players[0]?.era || 'Unknown'} />
                    <ScoutingRow label="RECORD" value={selectedTeam.record} />
                    {hasOppRoster && (
                      <>
                        <ScoutingRow label="AVG OVR" value={oppOVR.toFixed(1)} />
                        <ScoutingRow label="TEAM PPG" value={oppPPG.toFixed(1)} />
                        <ScoutingRow
                          label="TOP SCORERS"
                          value={topScorers.map(p => `${p.name} ${p.stats?.pts ?? 0}`).join(' • ')}
                        />
                      </>
                    )}
                    <ScoutingRow label="KEY PLAYERS" value={selectedTeam.players.length > 0 ? selectedTeam.players.slice(0, 3).map(p => p.name).join(', ') : 'Unknown'} />
                    <div className="pt-3 border-t border-broadcast-border">
                      <p className="text-sm text-broadcast-text-muted">{selectedTeam.description}</p>
                    </div>
                  </div>
                </motion.div>
              )}

              <motion.button
                onClick={handleStartVS}
                disabled={!selectedTeam || isLoading || !minutesValid}
                whileHover={{ scale: !selectedTeam || !minutesValid ? 1 : 1.02 }}
                whileTap={{ scale: !selectedTeam || !minutesValid ? 1 : 0.98 }}
                title={!selectedTeam ? 'Pick a legend first' : !minutesValid ? 'Minutes must total exactly 240' : undefined}
                className={cn(
                  'w-full btn-gold py-4 text-lg font-semibold gap-2',
                  (!selectedTeam || !minutesValid) && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Trophy className="w-6 h-6" aria-hidden="true" />
                {isLoading ? 'SIMULATING...' : `CHALLENGE ${selectedTeam?.name.toUpperCase() || 'A LEGEND'}`}
              </motion.button>
              {selectedTeam && !minutesValid && (
                <p className="text-xs font-medium text-broadcast-gold text-center" role="alert">
                  Set your minutes to {minutesTotal}/240 above to unlock the challenge.
                </p>
              )}
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

function MatchupRow({ you, opp, youMin, oppMin, simYou, simOpp, oppColor, sixth = false }: { you: Player; opp: Player; youMin: number; oppMin: number | null; simYou?: number; simOpp?: number; oppColor?: string | null; sixth?: boolean }) {
  // Raw base impact (NOT 0-100 strength: that scale prorates single players
  // ×1/5 and rounds, compressing Jordan-vs-Iverson into a fake +1 YOU).
  // Scaled by minutes share WITHOUT renormalizing, so the edge mirrors real
  // sim impact: quality × court time.
  const edge = getBaseTeamImpact([you]) * (youMin / 48)
    - getBaseTeamImpact([opp]) * ((oppMin ?? 48) / 48);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-2 bg-broadcast-darker rounded-lg">
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center font-bold text-white text-xs"
          style={{ backgroundColor: getPositionColor(you.position) }}
        >
          {you.position}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white">
            {you.name}
            {sixth && (
              <span className="ml-1.5 rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1.5 py-px text-[10px] font-bold text-broadcast-gold">6TH</span>
            )}
          </div>
          <div className="text-[11px] text-broadcast-text-secondary">
            {you.overall} OVR • {simYou !== undefined ? (<><span className="font-bold text-broadcast-accent">SIM {simYou}</span> <span>({you.stats.pts} base)</span></>) : (<>{you.stats.pts} PPG</>)} • {youMin} MIN
          </div>
        </div>
      </div>
      <div className="flex w-14 flex-col items-center">
        <span className={cn(
          'px-2 py-0.5 rounded-full text-xs font-bold',
          edge > 0.05 ? 'bg-broadcast-accent/20 text-broadcast-accent' : edge < -0.05 ? 'bg-broadcast-red/20 text-broadcast-red' : 'bg-broadcast-border text-broadcast-text-secondary'
        )}>
          {Math.abs(edge) < 0.05 ? 'EVEN' : `+${Math.abs(edge).toFixed(1)}`}
        </span>
        {Math.abs(edge) >= 0.05 && (
          <span className="text-[9px] font-bold text-broadcast-text-muted">{edge > 0 ? 'YOU' : 'OPP'}</span>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 min-w-0 text-right">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white">{opp.name}</div>
          <div className="text-[11px] text-broadcast-text-secondary">
            {opp.overall} OVR • {simOpp !== undefined ? (<><span className="font-bold" style={oppColor ? { color: oppColor } : undefined}>SIM {simOpp}</span> <span>({opp.stats?.pts ?? 0} base)</span></>) : (<>{opp.stats?.pts ?? 0} PPG</>)} • {oppMin === null ? '—' : `${oppMin} MIN`}
          </div>
        </div>
        <div
          className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center font-bold text-white text-xs"
          style={{ backgroundColor: getPositionColor(opp.position) }}
        >
          {opp.position}
        </div>
      </div>
    </div>
  );
}

function CompareRow({ label, you, opp, decimals = 1, oppColor }: { label: string; you: number; opp: number; decimals?: number; oppColor?: string | null }) {
  const max = Math.max(you, opp, 0.001);
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-bold text-broadcast-accent">{you.toFixed(decimals)}</span>
        <span className="text-[11px] font-bold text-broadcast-text-muted uppercase tracking-wider">{label}</span>
        <span className="font-bold" style={{ color: oppColor ?? '#ffd700' }}>{opp.toFixed(decimals)}</span>
      </div>
      <div className="space-y-1">
        <div className="h-1.5 rounded-full bg-broadcast-darker overflow-hidden">
          <div className="h-full rounded-full bg-broadcast-accent" style={{ width: `${(you / max) * 100}%` }} />
        </div>
        <div className="h-1.5 rounded-full bg-broadcast-darker overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${(opp / max) * 100}%`, backgroundColor: oppColor ?? '#ffd700' }} />
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] text-broadcast-text-muted mt-0.5">
        <span>YOU</span>
        <span>OPP</span>
      </div>
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
