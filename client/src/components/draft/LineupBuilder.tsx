import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Star, Trophy } from 'lucide-react';
import { cn, getPositionColor, getPositionLabel, formatHeight, splitPlayerName, fitNameSize } from '../../utils/helpers';
import { canPlayPosition, getPlayerPositions } from '../../types/game';
import type { LineupSlot, Player, Position } from '../../types/game';
import { POSITIONS } from '../../data/constants';

interface SlotProps {
  slot: LineupSlot;
  index: number;
  isSelected: boolean;
  draggedPlayer: Player | null;
  onSelect: (index: number) => void;
  onDropPlayer: (player: Player, slotIndex: number) => void;
}

function Slot({ slot, index, isSelected, draggedPlayer, onSelect, onDropPlayer }: SlotProps) {
  const hasPlayer = !!slot.player;
  const expectedPos = POSITIONS[index]!;
  const [isDragOver, setIsDragOver] = useState(false);
  const flexLabel = slot.player && (slot.player.secondaryPositions?.length ?? 0) > 0
    ? getPlayerPositions(slot.player).join('/')
    : null;

  const dropEligible = !hasPlayer && draggedPlayer !== null && canPlayPosition(draggedPlayer, slot.position);
  const dropBlocked = !hasPlayer && draggedPlayer !== null && !canPlayPosition(draggedPlayer, slot.position);

  const readDraggedPlayer = (e: React.DragEvent): Player | null => {
    if (draggedPlayer) return draggedPlayer;
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) return JSON.parse(raw) as Player;
    } catch {
      return null;
    }
    return null;
  };

  const emptySlotBody = (
    <div className="flex flex-col items-center justify-center h-32">
      <div
        className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center mb-3"
        style={{ borderColor: getPositionColor(expectedPos) }}
      >
        <Plus className="w-8 h-8" style={{ color: getPositionColor(expectedPos) }} aria-hidden="true" />
      </div>
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
        style={{ backgroundColor: getPositionColor(expectedPos) }}
      >
        {expectedPos}
      </div>
      <span className="mt-2 font-medium text-broadcast-text-secondary text-sm">
        {getPositionLabel(expectedPos)}
      </span>
      {isSelected && !draggedPlayer && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-1 text-xs text-broadcast-gold font-bold"
        >
          SELECTED →
        </motion.p>
      )}
      {dropEligible && (
        <p className="mt-1 text-xs text-broadcast-accent font-bold">
          {isDragOver ? 'RELEASE TO DRAFT' : 'DROP HERE'}
        </p>
      )}
      {dropBlocked && (
        <p className="mt-1 text-xs text-broadcast-red font-medium">NO FIT</p>
      )}
    </div>
  );

  const slotColor = getPositionColor(hasPlayer && slot.player ? slot.player.position : expectedPos);

  return (
    <motion.div
      className={cn('min-w-0')}
      animate={{ opacity: hasPlayer ? 1 : 0.9 }}
    >
      <div
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-2xl border bg-broadcast-card/90 shadow-[0_10px_36px_rgb(0,0,0,0.38)] backdrop-blur-sm transition-[transform,border-color,box-shadow] duration-200',
          hasPlayer
            ? 'border-broadcast-accent/50 shadow-glow-accent player-card-selected'
            : isSelected
            ? 'border-broadcast-gold shadow-glow-gold'
            : dropEligible
            ? 'border-dashed border-broadcast-accent shadow-glow-accent'
            : dropBlocked
            ? 'border-broadcast-red/40 opacity-60'
            : 'border-white/10'
        )}
      >
        <div
          className="h-1 w-full shrink-0"
          style={{ backgroundImage: `linear-gradient(90deg, transparent, ${slotColor}, transparent)` }}
          aria-hidden="true"
        />
        {slot.player ? (
          <div className="flex flex-1 flex-col">
            <div className="p-6 pb-5 pt-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div
                  className="flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-2 text-xs font-bold text-white ring-1 ring-white/25"
                  style={{ backgroundImage: `linear-gradient(135deg, ${slotColor}, ${slotColor}55 130%)` }}
                >
                  {flexLabel ?? slot.player.position}
                </div>
                <span className="truncate text-sm font-medium text-broadcast-text-secondary">
                  {getPositionLabel(slot.position)} slot{flexLabel ? ` • ${flexLabel}` : ''}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-display text-xl font-bold leading-none text-broadcast-accent" title="Overall rating">{slot.player.overall}</span>
                <span className="shrink-0 rounded-full border border-broadcast-accent/30 bg-broadcast-accent/15 px-2 py-0.5 text-[10px] font-bold text-broadcast-accent">
                  LOCKED
                </span>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-display font-bold text-white ring-1 ring-white/25 [box-shadow:inset_0_2px_10px_rgb(0,0,0,0.35)]"
                style={{ backgroundImage: `linear-gradient(135deg, ${slotColor}, ${slotColor}55 130%)` }}
                aria-hidden="true"
              >
                <span className="break-words px-1 text-center text-lg leading-tight">{slot.player.position}</span>
              </div>

              <div className="min-w-0 flex-1 leading-tight" title={slot.player.name}>
                <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-broadcast-text-secondary">{splitPlayerName(slot.player.name).first}</div>
                <h4 className="whitespace-nowrap font-semibold leading-snug text-white" style={{ fontSize: fitNameSize(splitPlayerName(slot.player.name).last || slot.player.name, 16) }}>{splitPlayerName(slot.player.name).last || splitPlayerName(slot.player.name).first}</h4>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-broadcast-text-secondary">
                  <span className="whitespace-nowrap rounded border border-broadcast-accent/30 bg-broadcast-accent/20 px-1.5 py-0.5 text-broadcast-accent" title="Height">
                    {formatHeight(slot.player.heightIn, slot.player.position)}
                  </span>
                  <span className="whitespace-nowrap rounded bg-broadcast-border px-1.5 py-0.5 text-broadcast-text-muted">
                    {slot.player.team.toUpperCase()}
                  </span>
                  <span className="whitespace-nowrap rounded bg-broadcast-border px-1.5 py-0.5 text-broadcast-text-muted">
                    {slot.player.decade}
                  </span>
                  <span className="break-words rounded border border-broadcast-gold/30 bg-broadcast-gold/20 px-1.5 py-0.5 text-broadcast-gold">
                    {slot.player.archetype}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5 text-broadcast-accent">
                    <Star className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="text-sm font-bold">{slot.player.overall}</span>
                    <span className="text-broadcast-text-muted">OVR</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-broadcast-gold">
                    <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="text-sm font-medium">{slot.player.stats.pts} PPG</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-auto grid grid-cols-5 gap-2 border-t border-white/5 bg-black/20 px-6 pb-5 pt-4">
              <StatMini label="PTS" value={slot.player.stats.pts} color="text-broadcast-accent" />
              <StatMini label="REB" value={slot.player.stats.reb} color="text-broadcast-gold" />
              <StatMini label="AST" value={slot.player.stats.ast} color="#007aff" />
              <StatMini label="STL" value={slot.player.stats.stl} color="#34c759" />
              <StatMini label="BLK" value={slot.player.stats.blk} color="#af52de" />
            </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(index)}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const player = readDraggedPlayer(e);
              if (player) onDropPlayer(player, index);
            }}
            className="w-full flex-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-gold"
            aria-label={`Select ${slot.position} slot (${getPositionLabel(slot.position)})${isSelected ? ', selected' : ''}`}
            aria-pressed={isSelected}
          >
            {emptySlotBody}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center py-1">
      <div className="font-bold font-mono text-base" style={{ color }}>{value}</div>
      <div className="text-[10px] text-broadcast-text-muted uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

interface LineupBuilderProps {
  lineup: LineupSlot[];
  selectedSlot: number | null;
  draggedPlayer: Player | null;
  onSelectSlot: (index: number) => void;
  onDropPlayer: (player: Player, slotIndex: number) => void;
  teamStrength: number;
  projectedWins: number;
}

function eligibleLabel(player: Player | null): string {
  if (!player) return '';
  return getPlayerPositions(player).join('/');
}

export function LineupBuilder({ lineup, selectedSlot, draggedPlayer, onSelectSlot, onDropPlayer, teamStrength, projectedWins }: LineupBuilderProps) {
  const filled = lineup.filter(s => s.player).length;
  const selectedPos: Position | null = selectedSlot !== null ? lineup[selectedSlot]?.position ?? null : null;
  void eligibleLabel;
  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title font-display text-xl">YOUR LINEUP ({filled}/5)</h2>
        <div className="flex items-center gap-3">
          <div className="min-w-[88px] rounded-xl border border-broadcast-border bg-broadcast-card p-3.5 text-center">
            <div className="font-display text-2xl font-bold gradient-text">{teamStrength}</div>
            <div className="mt-0.5 text-xs text-broadcast-text-muted">TEAM STR</div>
          </div>
          <div className="min-w-[88px] rounded-xl border border-broadcast-gold/30 bg-broadcast-card p-3.5 text-center">
            <div className="font-display text-2xl font-bold text-broadcast-gold">{projectedWins}-{82 - projectedWins}</div>
            <div className="mt-0.5 text-xs text-broadcast-text-muted">PROJ. RECORD</div>
          </div>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-broadcast-text-secondary" aria-live="polite">
        {draggedPlayer
          ? `Placing ${draggedPlayer.name} (${eligibleLabel(draggedPlayer)}) — glowing slots accept him.`
          : selectedPos
            ? `${selectedPos} slot selected — click a fitting player, or drag one in. Picks lock once made.`
            : 'Click an open slot to target it, then pick a player. Picks lock once made.'}
      </p>

      <div className="grid grid-cols-1 gap-5">
        {lineup.map((slot, index) => (
          <Slot
            key={`${slot.position}-${index}`}
            slot={slot}
            index={index}
            isSelected={selectedSlot === index}
            draggedPlayer={draggedPlayer}
            onSelect={onSelectSlot}
            onDropPlayer={onDropPlayer}
          />
        ))}
      </div>

      <div className="rounded-xl border border-broadcast-border bg-broadcast-card p-5">
        <h4 className="mb-4 font-medium text-broadcast-text-secondary">TEAM CHEMISTRY — {filled}/5 SLOTS FILLED</h4>
        <div className="grid grid-cols-5 gap-4" aria-hidden="true">
          {POSITIONS.map(pos => {
            const hasPos = lineup.some(s => s.player && canPlayPosition(s.player, pos));
            return (
              <div key={pos} className="text-center" style={{ opacity: hasPos ? 1 : 0.4 }}>
                <div
                  className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center font-bold text-white text-sm"
                  style={{ backgroundColor: getPositionColor(pos) }}
                >
                  {pos}
                </div>
                <div className="text-xs text-broadcast-text-muted">{pos}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
