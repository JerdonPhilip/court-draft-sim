import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Star, Trophy } from 'lucide-react';
import { cn, getPositionColor, getPositionLabel, formatHeight } from '../../utils/helpers';
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

  return (
    <motion.div
      className={cn('relative group')}
      animate={{ opacity: hasPlayer ? 1 : 0.9 }}
    >
      <div
        className={cn(
          'relative p-4 rounded-xl transition-all duration-300',
          hasPlayer
            ? 'bg-broadcast-card border-2 border-broadcast-accent/50 shadow-glow-accent player-card-selected'
            : isSelected
            ? 'bg-broadcast-gold/10 border-2 border-broadcast-gold shadow-glow-gold'
            : dropEligible
            ? 'bg-broadcast-accent/10 border-2 border-dashed border-broadcast-accent shadow-glow-accent'
            : dropBlocked
            ? 'bg-broadcast-darker border border-broadcast-red/40 opacity-60'
            : 'bg-broadcast-darker border border-broadcast-border'
        )}
      >
        {slot.player ? (
          <>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div
                  className="rounded-lg flex items-center justify-center font-bold text-white text-xs px-2 h-8 flex-shrink-0 whitespace-nowrap"
                  style={{ backgroundColor: getPositionColor(slot.player.position) }}
                >
                  {flexLabel ?? slot.player.position}
                </div>
                <span className="font-medium text-broadcast-text-secondary text-sm truncate">
                  {getPositionLabel(slot.position)} slot{flexLabel ? ` • ${flexLabel}` : ''}
                </span>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-broadcast-accent/15 text-broadcast-accent border border-broadcast-accent/30 flex-shrink-0">
                LOCKED
              </span>
            </div>

            <div className="flex items-start gap-3">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center font-display font-bold text-white flex-shrink-0"
                style={{ backgroundColor: getPositionColor(slot.player.position) }}
                aria-hidden="true"
              >
                <span className="text-base px-1 text-center leading-tight break-words">{slot.player.position}</span>
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-white text-base leading-snug break-words">{slot.player.name}</h4>
                <div className="flex items-center gap-1.5 text-xs text-broadcast-text-secondary mt-1.5 flex-wrap">
                  <span className="px-1.5 py-0.5 bg-broadcast-accent/20 text-broadcast-accent border border-broadcast-accent/30 rounded whitespace-nowrap" title="Height">
                    {formatHeight(slot.player.heightIn, slot.player.position)}
                  </span>
                  <span className="px-1.5 py-0.5 bg-broadcast-border rounded text-broadcast-text-muted whitespace-nowrap">
                    {slot.player.team.toUpperCase()}
                  </span>
                  <span className="px-1.5 py-0.5 bg-broadcast-border rounded text-broadcast-text-muted whitespace-nowrap">
                    {slot.player.decade}
                  </span>
                  <span className="px-1.5 py-0.5 bg-broadcast-gold/20 text-broadcast-gold rounded border border-broadcast-gold/30 break-words">
                    {slot.player.archetype}
                  </span>
                </div>

                <div className="flex items-center gap-4 mt-2.5 text-xs">
                  <div className="flex items-center gap-1.5 text-broadcast-accent">
                    <Star className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="font-bold text-sm">{slot.player.overall}</span>
                    <span className="text-broadcast-text-muted">OVR</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-broadcast-gold">
                    <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="font-medium text-sm">{slot.player.stats.pts} PPG</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 mt-3.5 pt-3.5 border-t border-broadcast-border">
              <StatMini label="PTS" value={slot.player.stats.pts} color="text-broadcast-accent" />
              <StatMini label="REB" value={slot.player.stats.reb} color="text-broadcast-gold" />
              <StatMini label="AST" value={slot.player.stats.ast} color="#007aff" />
              <StatMini label="STL" value={slot.player.stats.stl} color="#34c759" />
              <StatMini label="BLK" value={slot.player.stats.blk} color="#af52de" />
            </div>
          </>
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
            className="w-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-gold"
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="section-title font-display text-xl">YOUR LINEUP ({filled}/5)</h2>
        <div className="flex items-center gap-4">
          <div className="text-center p-3 bg-broadcast-card border border-broadcast-border rounded-xl min-w-[80px]">
            <div className="text-2xl font-bold font-display gradient-text">{teamStrength}</div>
            <div className="text-xs text-broadcast-text-muted">TEAM STR</div>
          </div>
          <div className="text-center p-3 bg-broadcast-card border border-broadcast-gold/30 rounded-xl min-w-[80px]">
            <div className="text-2xl font-bold font-display text-broadcast-gold">{projectedWins}-{82 - projectedWins}</div>
            <div className="text-xs text-broadcast-text-muted">PROJ. RECORD</div>
          </div>
        </div>
      </div>

      <p className="text-xs text-broadcast-text-secondary" aria-live="polite">
        {draggedPlayer
          ? `Placing ${draggedPlayer.name} (${eligibleLabel(draggedPlayer)}) — glowing slots accept him.`
          : selectedPos
            ? `${selectedPos} slot selected — click a fitting player, or drag one in. Picks lock once made.`
            : 'Click an open slot to target it, then pick a player. Picks lock once made.'}
      </p>

      <div className="grid grid-cols-1 gap-4">
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

      <div className="p-4 bg-broadcast-card border border-broadcast-border rounded-xl">
        <h4 className="font-medium text-broadcast-text-secondary mb-3">TEAM CHEMISTRY — {filled}/5 SLOTS FILLED</h4>
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
