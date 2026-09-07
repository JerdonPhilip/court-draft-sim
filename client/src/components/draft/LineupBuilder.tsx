'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, Plus, X, ChevronLeft, ChevronRight, Star, Trophy, Zap } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { Player, Position, LineupSlot } from '../../types/game';
import { getPositionColor, getPositionIcon } from '../../utils/helpers';
import { POSITIONS } from '../../data/constants';

interface SortableSlotProps {
  slot: LineupSlot;
  index: number;
  currentRound: number;
  onRemove: (index: number) => void;
}

function SortableSlot({ slot, index, currentRound, onRemove }: SortableSlotProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: index });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const positionLabels: Record<Position, string> = {
    PG: 'Point Guard',
    SG: 'Shooting Guard',
    SF: 'Small Forward',
    PF: 'Power Forward',
    C: 'Center',
  };

  const filled = index < currentRound;
  const isCurrentSlot = index === currentRound - 1;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group',
        !slot.player && !filled && 'opacity-50'
      )}
      animate={{ opacity: slot.player ? 1 : (filled ? 0.6 : 0.3) }}
    >
      <div
        {...attributes}
        {...listeners}
        className={cn(
          'relative p-3 rounded-xl transition-all duration-300',
          slot.player
            ? 'bg-broadcast-card border-2 border-broadcast-accent/50 shadow-glow-accent player-card-selected'
            : isCurrentSlot
            ? 'bg-broadcast-accent/10 border-2 border-dashed border-broadcast-accent animate-pulse'
            : 'bg-broadcast-darker border border-broadcast-border'
        )}
      >
        {slot.player ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
                  style={{ backgroundColor: getPositionColor(slot.player.position) }}
                >
                  {slot.player.position}
                </div>
                <span className="font-medium text-broadcast-text-secondary text-sm">
                  {positionLabels[slot.player.position]}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(index); }}
                className="p-1 rounded-lg hover:bg-broadcast-red/20 text-broadcast-red transition-colors opacity-0 group-hover:opacity-100"
                aria-label="Remove player"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-white flex-shrink-0"
                style={{ backgroundColor: getPositionColor(slot.player.position) }}
              >
                <span className="text-xl">{getPositionIcon(slot.player.position)}</span>
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-white truncate">{slot.player.name}</h4>
                <div className="flex items-center gap-2 text-xs text-broadcast-text-secondary">
                  <span className="px-1.5 py-0.5 bg-broadcast-border rounded text-broadcast-text-muted">
                    {slot.player.team.toUpperCase()}
                  </span>
                  <span className="px-1.5 py-0.5 bg-broadcast-border rounded text-broadcast-text-muted">
                    {slot.player.decade}
                  </span>
                  <span className="px-1.5 py-0.5 bg-broadcast-gold/20 text-broadcast-gold rounded border border-broadcast-gold/30">
                    {slot.player.archetype}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-2 text-xs">
                  <div className="flex items-center gap-1 text-broadcast-accent">
                    <Star className="w-3 h-3" />
                    <span className="font-bold">{slot.player.overall}</span>
                    <span className="text-broadcast-text-muted">OVR</span>
                  </div>
                  <div className="flex items-center gap-1 text-broadcast-gold">
                    <Trophy className="w-3 h-3" />
                    <span className="font-medium">{slot.player.stats.pts} PPG</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1 mt-3 pt-3 border-t border-broadcast-border">
              <StatMini label="PTS" value={slot.player.stats.pts} color="text-broadcast-accent" />
              <StatMini label="REB" value={slot.player.stats.reb} color="text-broadcast-gold" />
              <StatMini label="AST" value={slot.player.stats.ast} color="#007aff" />
              <StatMini label="STL" value={slot.player.stats.stl} color="#34c759" />
              <StatMini label="BLK" value={slot.player.stats.blk} color="#af52de" />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-32">
            <div
              className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center mb-3"
              style={{ borderColor: getPositionColor(POSITIONS[index]) }}
            >
              <Plus className="w-8 h-8" style={{ color: getPositionColor(POSITIONS[index]) }} />
            </div>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
              style={{ backgroundColor: getPositionColor(POSITIONS[index]) }}
            >
              {POSITIONS[index]}
            </div>
            <span className="mt-2 font-medium text-broadcast-text-secondary text-sm">
              {positionLabels[POSITIONS[index]]}
            </span>
            {isCurrentSlot && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="mt-1 text-xs text-broadcast-accent font-medium"
              >
                CLICK TO DRAFT →
              </motion.p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className="font-bold font-mono text-sm" style={{ color }}>{value}</div>
      <div className="text-[10px] text-broadcast-text-muted uppercase">{label}</div>
    </div>
  );
}

interface LineupBuilderProps {
  lineup: LineupSlot[];
  currentRound: number;
  onRemovePlayer: (index: number) => void;
  teamStrength: number;
  projectedWins: number;
}

export function LineupBuilder({ lineup, currentRound, onRemovePlayer, teamStrength, projectedWins }: LineupBuilderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="section-title font-display text-xl">YOUR LINEUP</h2>
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event: DragEndEvent) => {
          const { active, over } = event;
          if (over && active.id !== over.id) {
            console.log('Reorder:', active.id, over.id);
          }
        }}
      >
        <SortableContext
          items={lineup.map((_, i) => i.toString())}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {lineup.map((slot, index) => (
              <SortableSlot
                key={index}
                slot={slot}
                index={index}
                currentRound={currentRound}
                onRemove={onRemovePlayer}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="p-4 bg-broadcast-card border border-broadcast-border rounded-xl">
        <h4 className="font-medium text-broadcast-text-secondary mb-3">TEAM CHEMISTRY</h4>
        <div className="grid grid-cols-5 gap-4">
          {POSITIONS.map(pos => (
            <div key={pos} className="text-center">
              <div
                className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center font-bold text-white text-sm"
                style={{ backgroundColor: getPositionColor(pos) }}
              >
                {pos}
              </div>
              <div className="text-xs text-broadcast-text-muted">{pos}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}