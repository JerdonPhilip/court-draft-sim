import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Trophy, Shuffle } from 'lucide-react';
import { cn, getPositionColor, bestTextOn, calculateTeamStrength, getWinProjection, foulRiskLabel } from '../../utils/helpers';
import { useGameStore, minutesSum, isMinutesValid } from '../../store/gameStore';
import { canPlayPosition } from '../../types/game';
import { api } from '../../utils/api';
import { APP_VERSION } from '../../version';
import { DECADES } from '../../data/constants';
import type { EraInfo, Player } from '../../types/game';

interface SeasonSetupProps {
  onBack: () => void;
}

const FALLBACK_ERAS: EraInfo[] = DECADES.map(d => ({
  id: d.id,
  label: d.label,
  era: d.era,
  range: d.range,
  teams: 0,
  avgOverall: 0,
  difficulty: '',
}));

const PRESETS = [
  { id: 'default', label: 'DEFAULT', title: 'Starters 34 • Sixth 22 • bench 12' },
  { id: 'balanced', label: 'BALANCED', title: 'Everyone 24' },
  { id: 'seven', label: '7-MAN', title: 'Starters 38 • Sixth 26 • one bench 24 • three DNP cover' },
  { id: 'eight', label: '8-MAN', title: 'Starters 36 • Sixth 26 • two bench 17 • two DNP cover' },
  { id: 'nine', label: '9-MAN', title: 'Starters 32 • Sixth 24 • bench 19/19/18 • one DNP cover' },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

export function SeasonSetup({ onBack }: SeasonSetupProps) {
  const { draftState, selectedEra, setSelectedEra, runSimulation, isLoading, setSixthMan, setOptionRank, swapPlayers, ensureMinutesInitialized, setPlayerMinutes, applyMinutesPreset, resetMinutesToDefault, rebalanceMinutes } = useGameStore();
  const [eras, setEras] = useState<EraInfo[]>(FALLBACK_ERAS);
  const [swapPickId, setSwapPickId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.simulation.getEras()
      .then(data => { if (!cancelled && data.eras.length > 0) setEras(data.eras); })
      .catch(() => { /* static fallback above keeps the picker usable */ });
    return () => { cancelled = true; };
  }, []);

  // Seed auto default minutes once the locked roster is here.
  useEffect(() => {
    ensureMinutesInitialized();
  }, [ensureMinutesInitialized]);

  const slots = draftState.lineup.slots;
  const slotIndexOf = (playerId: string | null | undefined): number => {
    if (!playerId) return -1;
    return slots.findIndex(s => s.player?.id === playerId);
  };
  const sixthSlotIdx = slots.findIndex(s => s.isSixthMan && s.player);
  const rankSlotIdx = (r: 1 | 2 | 3): number => slots.findIndex(s => s.optionRank === r && s.player);
  const rankHolder = (r: 1 | 2 | 3): string => {
    const idx = rankSlotIdx(r);
    return idx >= 0 ? slots[idx]?.player?.id ?? '' : '';
  };
  const sixthAuto = !(draftState.sixthManExplicit ?? false);
  const optionAuto = (r: 1 | 2 | 3): boolean => !(draftState.optionsExplicit?.[r] ?? false);
  const benchSlots = slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.role === 'bench' && s.player);
  const lineup: Player[] = slots
    .map(s => s.player)
    .filter((p): p is Player => p !== null);
  const minutes = draftState.minutes;
  const minutesTotal = Math.round(minutesSum(minutes));
  const minutesValid = isMinutesValid(slots, minutes);
  const minutesAuto = !(draftState.minutesExplicit ?? false);
  const sixthId = sixthSlotIdx >= 0 ? slots[sixthSlotIdx]?.player?.id ?? null : null;
  const minuteOptions = {
    first: rankHolder(1) || null,
    second: rankHolder(2) || null,
    third: rankHolder(3) || null,
  };
  const minuteStrength = minutes ? calculateTeamStrength(lineup, sixthId, minuteOptions, minutes) : 0;
  const minuteProj = getWinProjection(minuteStrength);

  // Starter ↔ bench swap without leaving the page. Both players must fit the
  // other's fixed positional slot.
  const swapPickIdx = swapPickId ? slotIndexOf(swapPickId) : -1;
  const swappable = (id: string): boolean | null => {
    if (swapPickIdx < 0 || id === swapPickId) return null;
    const a = slots[swapPickIdx];
    const b = slots[slotIndexOf(id)];
    if (!a?.player || !b?.player) return false;
    return canPlayPosition(a.player, b.position) && canPlayPosition(b.player, a.position);
  };
  const handleSwap = (id: string) => {
    if (!swapPickId) {
      setSwapPickId(id);
      return;
    }
    if (swapPickId === id) {
      setSwapPickId(null);
      return;
    }
    swapPlayers(slotIndexOf(swapPickId), slotIndexOf(id));
    setSwapPickId(null);
  };

  const badgeFor = (id: string): string | null => {
    const slot = draftState.lineup.slots.find(s => s.player?.id === id);
    if (!slot) return null;
    const tags: string[] = [];
    if (slot.isSixthMan) tags.push(sixthAuto ? '6TH (AUTO)' : '6TH');
    if (slot.optionRank === 1) tags.push(optionAuto(1) ? '1ST (AUTO)' : '1ST');
    else if (slot.optionRank === 2) tags.push(optionAuto(2) ? '2ND (AUTO)' : '2ND');
    else if (slot.optionRank === 3) tags.push(optionAuto(3) ? '3RD (AUTO)' : '3RD');
    return tags.length > 0 ? tags.join(' • ') : null;
  };

  const selectedLabel = selectedEra === null
    ? 'Mixed League'
    : eras.find(e => e.id === selectedEra)?.label ?? selectedEra;

  return (
    <div className="min-h-screen bg-broadcast-dark">
      <div className="mx-auto max-w-4xl px-4 py-5 pb-8">
        <div className="mb-3 flex items-center gap-3">
          <motion.button
            onClick={onBack}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-broadcast-card border border-broadcast-border hover:border-broadcast-accent/50 transition-colors"
            aria-label="Back to draft"
          >
            <ChevronLeft className="w-5 h-5 text-broadcast-text-secondary" aria-hidden="true" />
          </motion.button>
          <div>
            <h1 className="font-display text-xl font-bold gradient-text">CHOOSE YOUR SEASON</h1>
            <p className="text-xs text-broadcast-text-secondary">Set rotation and minutes, pick a league, sim 82.</p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-1.5" aria-label="Your locked lineup">
          {lineup.map(p => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-broadcast-card px-2 py-0.5 text-[11px] font-medium text-white"
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold"
                style={{ backgroundColor: getPositionColor(p.position), color: bestTextOn(getPositionColor(p.position)) }}
                aria-hidden="true"
              >
                {p.position}
              </span>
              {p.name}
              {badgeFor(p.id) && (
                <span className="rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1 py-px text-[9px] font-bold text-broadcast-gold">
                  {badgeFor(p.id)}
                </span>
              )}
            </span>
          ))}
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-broadcast-card/90 p-3" aria-label="Your rotation">
          <h2 className="font-display text-base font-bold text-white">YOUR ROTATION</h2>
          <p className="text-xs text-broadcast-text-secondary">
            Sixth Man, scoring options and starter swaps. Whatever stands here at sim time is what plays.
            {(sixthAuto || optionAuto(1) || optionAuto(2) || optionAuto(3)) && (
              <> <span className="font-bold text-broadcast-gold">AUTO</span> filled the gaps. Change anything below.</>
            )}
          </p>

          <div className="mt-2.5">
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-broadcast-gold">Sixth Man (bench only)</h3>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sixth man">
              {benchSlots.map(({ s, i }) => {
                const active = i === sixthSlotIdx;
                return (
                  <button
                    key={s.player!.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSixthMan(i)}
                    className={cn(
                      'rounded-xl border px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                      active
                        ? 'border-broadcast-gold/60 bg-broadcast-gold/10 text-white shadow-glow-gold'
                        : 'border-white/10 bg-white/5 text-broadcast-text-secondary hover:border-broadcast-gold/40 hover:text-white'
                    )}
                  >
                    <span className="font-bold text-white">{s.player!.name}</span>
                    <span className="ml-1.5 text-broadcast-text-muted">{s.position} • {s.player!.overall}</span>
                    {active && (
                      <span className="ml-1.5 rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1.5 py-px text-[10px] font-bold text-broadcast-gold">
                        6TH{sixthAuto ? ' (AUTO)' : ''}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {([1, 2, 3] as const).map(rank => {
              const currentId = rankHolder(rank);
              // One player, one rank: holders of the other two ranks are locked out here.
              const takenElsewhere = new Set(
                ([1, 2, 3] as const).filter(o => o !== rank).map(rankHolder).filter(Boolean)
              );
              return (
                <div key={rank}>
                  <label htmlFor={`option-${rank}`} className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-broadcast-purple">
                    {rank === 1 ? '1st option' : rank === 2 ? '2nd option' : '3rd option'}
                    {optionAuto(rank) && <span className="ml-1.5 rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1.5 py-px text-[10px] font-bold text-broadcast-gold">AUTO</span>}
                  </label>
                  <select
                    id={`option-${rank}`}
                    value={currentId}
                    onChange={(e) => {
                      const idx = slotIndexOf(e.target.value || null);
                      if (idx >= 0) setOptionRank(idx, rank);
                    }}
                    className="w-full rounded-xl border border-white/10 bg-broadcast-darker px-2.5 py-1.5 text-sm font-medium text-white focus:border-broadcast-purple/60 focus:outline-none"
                  >
                    {lineup.map(p => (
                      <option key={p.id} value={p.id} disabled={takenElsewhere.has(p.id)}>
                        {p.name} ({p.position} • {p.overall})
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-broadcast-card/90 p-3" aria-label="Minutes plan">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-white">
                MINUTES PLAN{minutesAuto && <span className="ml-2 rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1.5 py-px text-[10px] font-bold text-broadcast-gold">AUTO</span>}
              </h2>
              <p className="text-xs text-broadcast-text-secondary">
                Minutes move win%. Total caps at 240, so raising one player trims room for the rest.
                6 fouls ends a night early. <span className="font-bold text-white">0 MIN</span> only checks in as emergency foul cover.
              </p>
            </div>
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', minutesValid ? 'border-broadcast-accent/50 bg-broadcast-accent/15 text-broadcast-accent' : 'border-broadcast-gold/50 bg-broadcast-gold/15 text-broadcast-gold')}>
              {minutesTotal}/240
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Minutes presets">
            {PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyMinutesPreset(preset.id as PresetId)}
                title={preset.title}
                className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-broadcast-text-secondary transition-colors hover:border-broadcast-accent/50 hover:text-white"
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => rebalanceMinutes()}
              title="Stretch nonzero shares to total exactly 240 (DNP zeros stay 0)"
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
            {minutes && (
              <span className="ml-auto text-xs font-bold text-broadcast-text-secondary">
                PROJ <span className="text-broadcast-gold">{minuteProj}-{82 - minuteProj}</span>
                <span className="text-broadcast-text-muted"> ({minuteStrength})</span>
              </span>
            )}
          </div>

          {swapPickId && (
            <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-broadcast-gold/40 bg-broadcast-gold/10 px-3 py-1.5">
              <span className="text-xs font-bold text-broadcast-gold">Swap: pick a highlighted row. Spots must fit both players.</span>
              <button
                type="button"
                onClick={() => setSwapPickId(null)}
                className="rounded-lg border border-broadcast-gold/40 px-2 py-0.5 text-[11px] font-bold text-broadcast-gold hover:bg-broadcast-gold/20"
              >
                CANCEL
              </button>
            </div>
          )}

          <div className="mt-2.5 space-y-1.5">
            {slots.map((slot, i) => {
              const p = slot.player;
              if (!p) return null;
              const v = Math.round(minutes?.[p.id] ?? 0);
              const risk = foulRiskLabel(p);
              const compat = swappable(p.id);
              const isPick = swapPickId === p.id;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border bg-black/20 px-2.5 py-1.5',
                    isPick
                      ? 'border-broadcast-gold shadow-glow-gold'
                      : compat === true
                        ? 'border-broadcast-accent/70 shadow-glow-accent'
                        : compat === false
                          ? 'border-broadcast-red/40 opacity-60'
                          : 'border-white/5'
                  )}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                    style={{ backgroundColor: getPositionColor(p.position), color: bestTextOn(getPositionColor(p.position)) }}
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
                      {slot.isSixthMan && (
                        <span className="ml-1.5 rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1.5 py-px text-[10px] font-bold text-broadcast-gold">6TH</span>
                      )}
                      <span
                        title={risk === 'High' ? 'High foul risk: gambler profile, plays it safe late in close games' : risk === 'Low' ? 'Low foul risk: clean defender' : 'Average foul risk'}
                        className={cn(
                          'ml-1.5 rounded-full border px-1.5 py-px text-[10px] font-bold',
                          risk === 'High'
                            ? 'border-broadcast-red/50 bg-broadcast-red/15 text-broadcast-red'
                            : risk === 'Low'
                              ? 'border-broadcast-accent/50 bg-broadcast-accent/15 text-broadcast-accent'
                              : 'border-broadcast-gold/50 bg-broadcast-gold/15 text-broadcast-gold'
                        )}
                      >
                        {risk === 'High' ? 'HIGH FOUL RISK' : risk === 'Low' ? 'LOW FOUL' : 'MED FOUL'}
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
                  <button
                    type="button"
                    onClick={() => handleSwap(p.id)}
                    aria-pressed={isPick}
                    aria-label={isPick ? `Cancel swap pick for ${p.name}` : `Swap ${p.name} with another player`}
                    title={isPick ? 'Cancel swap pick' : compat === false ? 'Spots must fit both players' : `Swap ${p.name} with a starter or bench player`}
                    className={cn(
                      'shrink-0 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent',
                      isPick
                        ? 'border-broadcast-gold/60 bg-broadcast-gold/15 text-broadcast-gold'
                        : 'border-white/10 bg-white/5 text-broadcast-text-secondary hover:border-broadcast-accent/50 hover:text-white'
                    )}
                  >
                    ⇄
                  </button>
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
              Total is {minutesTotal}/240. Sim unlocks at exactly 240 (Rebalance gets you there, DNP zeros stay put).
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Season era">
          <EraCard
            selected={selectedEra === null}
            onSelect={() => setSelectedEra(null)}
            title="Mixed League"
            subtitle="Modern rivals • balanced schedule"
            meta="30 teams • all eras"
            badge="STANDARD"
            badgeClass="bg-broadcast-accent/20 text-broadcast-accent border-broadcast-accent/30"
          />
          {eras.map(era => (
            <EraCard
              key={era.id}
              selected={selectedEra === era.id}
              onSelect={() => setSelectedEra(era.id)}
              title={`${era.label} League`}
              subtitle={`${era.era} • ${era.range}`}
              meta={era.teams > 0 ? `${era.teams} teams • ${era.avgOverall.toFixed(0)} avg` : 'Historic rosters'}
              badge={era.difficulty || 'HISTORIC'}
              badgeClass="bg-broadcast-gold/20 text-broadcast-gold border-broadcast-gold/30"
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <motion.button
            onClick={() => void runSimulation()}
            disabled={isLoading || !minutesValid}
            title={!minutesValid ? 'Minutes must total exactly 240' : undefined}
            whileHover={{ scale: minutesValid ? 1.02 : 1 }}
            whileTap={{ scale: minutesValid ? 0.98 : 1 }}
            className="btn-primary px-6 py-2.5 text-base gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              'SIMULATING…'
            ) : (
              <>
                <Trophy className="w-5 h-5" aria-hidden="true" />
                SIMULATE 82 vs {selectedLabel.toUpperCase()}
              </>
            )}
          </motion.button>
        </div>
        <p className="mt-2 text-center text-[11px] text-broadcast-text-muted">
          Era leagues play softer or tougher. Projections adjust. · COURT DRAFT SIM v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}

function EraCard({ selected, onSelect, title, subtitle, meta, badge, badgeClass }: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  meta: string;
  badge: string;
  badgeClass: string;
}) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        'relative rounded-2xl border p-3 text-left transition-all',
        selected
          ? 'border-broadcast-accent/60 bg-broadcast-accent/5 shadow-glow-accent'
          : 'border-white/10 bg-broadcast-card/90 hover:border-broadcast-accent/40'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="flex items-center gap-2 font-display text-base font-bold text-white">
            {title === 'Mixed League' && <Shuffle className="h-4 w-4 text-broadcast-accent" aria-hidden="true" />}
            <span className="truncate">{title}</span>
          </span>
          <p className="mt-0.5 truncate text-xs text-broadcast-text-secondary">{subtitle}</p>
          <p className="mt-0.5 text-xs font-medium text-broadcast-text-muted">{meta}</p>
        </div>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', badgeClass, selected && 'ring-1 ring-current')}>
          {badge}
        </span>
      </div>
    </motion.button>
  );
}
