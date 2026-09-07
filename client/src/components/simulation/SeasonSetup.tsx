import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Trophy, Shuffle } from 'lucide-react';
import { cn, getPositionColor } from '../../utils/helpers';
import { useGameStore } from '../../store/gameStore';
import { api } from '../../utils/api';
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
  const { draftState, selectedEra, setSelectedEra, runSimulation, isLoading } = useGameStore();
  const [eras, setEras] = useState<EraInfo[]>(FALLBACK_ERAS);

  useEffect(() => {
    let cancelled = false;
    api.simulation.getEras()
      .then(data => { if (!cancelled && data.eras.length > 0) setEras(data.eras); })
      .catch(() => { /* static fallback above keeps the picker usable */ });
    return () => { cancelled = true; };
  }, []);

  const lineup: Player[] = draftState.lineup.slots
    .map(s => s.player)
    .filter((p): p is Player => p !== null);

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
            <p className="text-xs text-broadcast-text-secondary">YOUR LOCKED 5 TAKE ON AN 82-GAME SCHEDULE AGAINST…</p>
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
            </span>
          ))}
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
            disabled={isLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn-primary px-8 py-3 text-lg gap-2"
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
        <p className="mt-3 text-center text-xs text-broadcast-text-muted">
          Era leagues run softer or tougher than average — projections adjust to the league you pick.
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
