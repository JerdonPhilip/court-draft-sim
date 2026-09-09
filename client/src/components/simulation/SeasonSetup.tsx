import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Trophy, Shuffle } from 'lucide-react';
import { cn, getPositionColor, calculateTeamStrength, getWinProjection, foulRiskLabel } from '../../utils/helpers';
import { useGameStore, minutesSum, isMinutesValid } from '../../store/gameStore';
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

export function SeasonSetup({ onBack }: SeasonSetupProps) {
  const { draftState, selectedEra, setSelectedEra, runSimulation, isLoading, setSixthMan, setOptionRank, confirmRotation, ensureMinutesInitialized, setPlayerMinutes, applyMinutesPreset, resetMinutesToDefault, rebalanceMinutes } = useGameStore();
  const [eras, setEras] = useState<EraInfo[]>(FALLBACK_ERAS);

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
  const confirmed = draftState.rotationConfirmed ?? false;
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
    first: rankSlotIdx(1) >= 0 ? slots[rankSlotIdx(1)]?.player?.id ?? null : null,
    second: rankSlotIdx(2) >= 0 ? slots[rankSlotIdx(2)]?.player?.id ?? null : null,
    third: rankSlotIdx(3) >= 0 ? slots[rankSlotIdx(3)]?.player?.id ?? null : null,
  };
  const minuteStrength = minutes ? calculateTeamStrength(lineup, sixthId, minuteOptions, minutes) : 0;
  const minuteProj = getWinProjection(minuteStrength);

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
      <div className="mx-auto max-w-5xl px-4 py-8 pb-12">
        <div className="mb-2 flex items-center gap-3">
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
            <h1 className="font-display text-2xl font-bold gradient-text">CHOOSE YOUR SEASON</h1>
            <p className="text-xs text-broadcast-text-secondary">YOUR LOCKED 10 TAKE ON AN 82-GAME SCHEDULE AGAINST…</p>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="Your locked lineup">
          {lineup.map(p => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-broadcast-card px-2.5 py-1 text-xs font-medium text-white"
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white"
                style={{ backgroundColor: getPositionColor(p.position) }}
                aria-hidden="true"
              >
                {p.position}
              </span>
              {p.name}
              {badgeFor(p.id) && (
                <span className="rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-broadcast-gold">
                  {badgeFor(p.id)}
                </span>
              )}
            </span>
          ))}
        </div>

        <div className="mb-5 rounded-2xl border border-white/10 bg-broadcast-card/90 p-4" aria-label="Confirm your rotation">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-white">CONFIRM YOUR ROTATION</h2>
              <p className="text-xs text-broadcast-text-secondary">
                Review your Sixth Man + 1st/2nd/3rd options. Simulation stays locked until you confirm.
                {(sixthAuto || optionAuto(1) || optionAuto(2) || optionAuto(3)) && (
                  <> <span className="font-bold text-broadcast-gold">AUTO</span> = filled in for you; change it below.</>
                )}
              </p>
            </div>
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', confirmed ? 'border-broadcast-accent/50 bg-broadcast-accent/15 text-broadcast-accent' : 'border-broadcast-gold/50 bg-broadcast-gold/15 text-broadcast-gold')}>
              {confirmed ? 'Confirmed ✓' : 'Needs review'}
            </span>
          </div>

          <div className="mt-3">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-broadcast-gold">Sixth Man (bench only)</h3>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sixth man">
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
                      'rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors',
                      active
                        ? 'border-broadcast-gold/60 bg-broadcast-gold/10 text-white shadow-glow-gold'
                        : 'border-white/10 bg-white/5 text-broadcast-text-secondary hover:border-broadcast-gold/40 hover:text-white'
                    )}
                  >
                    <span className="font-bold text-white">{s.player!.name}</span>
                    <span className="ml-1.5 text-broadcast-text-muted">{s.position} • {s.player!.overall} OVR</span>
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

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {([1, 2, 3] as const).map(rank => {
              const currentIdx = rankSlotIdx(rank);
              const currentId = currentIdx >= 0 ? slots[currentIdx]?.player?.id ?? '' : '';
              return (
                <div key={rank}>
                  <label htmlFor={`option-${rank}`} className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-broadcast-purple">
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
                    className="w-full rounded-xl border border-white/10 bg-broadcast-darker px-3 py-2 text-sm font-medium text-white focus:border-broadcast-purple/60 focus:outline-none"
                  >
                    {lineup.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.position} • {p.overall} OVR)
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-broadcast-text-muted">
                    {rank === 1 ? '+8% scoring, top usage' : rank === 2 ? '+4% scoring' : '+2% scoring'}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => confirmRotation()}
              disabled={confirmed}
              className={cn('rounded-xl px-5 py-2.5 text-sm font-bold transition-all', confirmed ? 'cursor-default border border-broadcast-accent/40 bg-broadcast-accent/10 text-broadcast-accent' : 'btn-primary')}
            >
              {confirmed ? 'ROTATION CONFIRMED ✓' : 'CONFIRM ROTATION'}
            </button>
            {!confirmed && (
              <span className="text-xs text-broadcast-text-muted">Any change up top resets confirmation, so re-confirm before simulating.</span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-broadcast-text-muted">Need a starter ↔ bench swap? Head back to the draft. Swaps only go through when the positions fit.</p>
        </div>

        <div className="mb-5 rounded-2xl border border-white/10 bg-broadcast-card/90 p-4" aria-label="Minutes plan">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                MINUTES PLAN{minutesAuto && <span className="ml-2 rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1.5 py-px text-[10px] font-bold text-broadcast-gold">AUTO</span>}
              </h2>
              <p className="text-xs text-broadcast-text-secondary">
                Minutes move win%. Ride your stars with a short rotation or stay fresh with a deep one (playing over 32 a night wears players down).
                6 fouls = ejected; <span className="font-bold text-white">0 MIN</span> players only enter as emergency foul cover (must fit the slot).
              </p>
            </div>
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', minutesValid ? 'border-broadcast-accent/50 bg-broadcast-accent/15 text-broadcast-accent' : 'border-broadcast-red/50 bg-broadcast-red/15 text-broadcast-red')}>
              {minutesTotal}/240{minutesValid ? '' : ' · FIX TO CONFIRM'}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Minutes presets">
            {(['default', 'balanced', 'short'] as const).map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => applyMinutesPreset(preset)}
                title={preset === 'default' ? 'Starters 34 • Sixth 22 • bench 12' : preset === 'balanced' ? 'Everyone 24' : 'Starters 36 • Sixth 26 • two bench 17 • two DNP cover'}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-broadcast-text-secondary transition-colors hover:border-broadcast-accent/50 hover:text-white"
              >
                {preset === 'default' ? 'DEFAULT 34/22/12' : preset === 'balanced' ? 'BALANCED 24s' : 'SHORT 8-MAN'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => rebalanceMinutes()}
              title="Stretch nonzero shares to total exactly 240 (DNP zeros stay 0)"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-broadcast-text-secondary transition-colors hover:border-broadcast-accent/50 hover:text-white"
            >
              REBALANCE
            </button>
            <button
              type="button"
              onClick={() => resetMinutesToDefault()}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-broadcast-text-secondary transition-colors hover:border-broadcast-accent/50 hover:text-white"
            >
              RESET
            </button>
            {minutes && (
              <span className="ml-auto text-xs font-bold text-broadcast-text-secondary">
                PROJ WITH THESE MINUTES: <span className="text-broadcast-gold">{minuteProj}-{82 - minuteProj}</span>
                <span className="text-broadcast-text-muted"> ({minuteStrength} STR)</span>
              </span>
            )}
          </div>

          <div className="mt-3 space-y-2">
            {slots.map((slot, i) => {
              const p = slot.player;
              if (!p) return null;
              const v = Math.round(minutes?.[p.id] ?? 0);
              const risk = foulRiskLabel(p);
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                    style={{ backgroundColor: getPositionColor(p.position) }}
                    aria-hidden="true"
                  >
                    {p.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">
                      {p.name}
                      <span className="ml-1.5 text-[11px] font-medium text-broadcast-text-muted">
                        {slot.role === 'bench' ? 'BENCH' : 'STARTER'} • {p.overall} OVR
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
                  <input
                    type="number"
                    min={0}
                    max={48}
                    step={1}
                    value={v}
                    onChange={(e) => setPlayerMinutes(p.id, Number(e.target.value))}
                    aria-label={`Minutes number for ${p.name}`}
                    className="w-16 shrink-0 rounded-lg border border-white/10 bg-broadcast-darker px-2 py-1.5 text-center text-sm font-bold text-white focus:border-broadcast-accent/60 focus:outline-none"
                  />
                  <span className="hidden text-[11px] text-broadcast-text-muted sm:block" aria-hidden="true">#{i + 1}</span>
                </div>
              );
            })}
          </div>
          {!minutesValid && (
            <p className="mt-2 text-xs font-medium text-broadcast-red" role="alert">
              Total is {minutesTotal}/240. Confirm stays locked until it hits 240 (Rebalance fixes it instantly; DNP zeros are kept).
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Season era">
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
              meta={era.teams > 0 ? `${era.teams} teams • ${era.avgOverall.toFixed(0)} avg OVR` : 'Historic rosters'}
              badge={era.difficulty || 'HISTORIC'}
              badgeClass="bg-broadcast-gold/20 text-broadcast-gold border-broadcast-gold/30"
            />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <motion.button
            onClick={() => void runSimulation()}
            disabled={isLoading || !confirmed}
            title={!confirmed ? 'Confirm your rotation above first' : undefined}
            whileHover={{ scale: confirmed ? 1.02 : 1 }}
            whileTap={{ scale: confirmed ? 0.98 : 1 }}
            className="btn-primary px-8 py-3 text-lg gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              'SIMULATING…'
            ) : (
              <>
                <Trophy className="w-5 h-5" aria-hidden="true" />
                {confirmed ? `SIMULATE 82 vs ${selectedLabel.toUpperCase()}` : 'CONFIRM ROTATION TO SIMULATE'}
              </>
            )}
          </motion.button>
        </div>
        <p className="mt-3 text-center text-xs text-broadcast-text-muted">
          Era leagues run softer or tougher than average. Projections adjust to the league you pick.
        </p>
        <p className="mt-1 text-center text-[11px] text-broadcast-text-muted/70">
          COURT DRAFT SIM v{APP_VERSION}
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
        'relative rounded-2xl border p-4 text-left transition-all',
        selected
          ? 'border-broadcast-accent/60 bg-broadcast-accent/5 shadow-glow-accent'
          : 'border-white/10 bg-broadcast-card/90 hover:border-broadcast-accent/40'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            {title === 'Mixed League' && <Shuffle className="h-4 w-4 text-broadcast-accent" aria-hidden="true" />}
            <span className="truncate">{title}</span>
          </h3>
          <p className="mt-0.5 truncate text-xs text-broadcast-text-secondary">{subtitle}</p>
          <p className="mt-1 text-xs font-medium text-broadcast-text-muted">{meta}</p>
        </div>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', badgeClass, selected && 'ring-1 ring-current')}>
          {badge}
        </span>
      </div>
    </motion.button>
  );
}
