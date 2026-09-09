import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn, getPositionColor, getPositionLabel, formatHeight, splitPlayerName, fitNameSize } from '../../utils/helpers';
import { canPlayPosition, getPlayerPositions } from '../../types/game';
import type { LineupSlot, Player, Position } from '../../types/game';

interface SlotProps {
  slot: LineupSlot;
  index: number;
  isSelected: boolean;
  draggedPlayer: Player | null;
  sixthManAuto: boolean;
  optionAuto: boolean;
  swapMode: boolean;
  isSwapPick: boolean;
  swapCompatible: boolean | null;
  onSelect: (index: number) => void;
  onDropPlayer: (player: Player, slotIndex: number) => void;
  onSetSixthMan: (index: number) => void;
  onSetOption: (index: number, rank: 1 | 2 | 3 | null) => void;
  onSwapClick: (index: number) => void;
}

function Slot({ slot, index, isSelected, draggedPlayer, sixthManAuto, optionAuto, swapMode, isSwapPick, swapCompatible, onSelect, onDropPlayer, onSetSixthMan, onSetOption, onSwapClick }: SlotProps) {
  const hasPlayer = !!slot.player;
  const expectedPos = slot.position;
  const roleLabel = slot.role === 'bench' ? 'Bench' : 'Starter';
  const [isDragOver, setIsDragOver] = useState(false);
  const isFlex = slot.player ? (slot.player.secondaryPositions?.length ?? 0) > 0 : false;

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
    <div className="flex min-h-[190px] flex-col items-center justify-center p-6">
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed"
        style={{ borderColor: getPositionColor(expectedPos) }}
      >
        <Plus className="h-8 w-8" style={{ color: getPositionColor(expectedPos) }} aria-hidden="true" />
      </div>
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
        style={{ backgroundColor: getPositionColor(expectedPos) }}
      >
        {expectedPos}
      </div>
      <span className="mt-2.5 text-sm font-medium text-broadcast-text-secondary">
        {roleLabel} {getPositionLabel(expectedPos)}
      </span>
      {isSelected && !draggedPlayer && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-1.5 text-xs font-bold text-broadcast-gold"
        >
          SELECTED →
        </motion.p>
      )}
      {dropEligible && (
        <p className="mt-1.5 text-xs font-bold text-broadcast-accent">
          {isDragOver ? 'RELEASE TO DRAFT' : 'DROP HERE'}
        </p>
      )}
      {dropBlocked && (
        <p className="mt-1.5 text-xs font-medium text-broadcast-red">NO FIT</p>
      )}
    </div>
  );

  const slotColor = getPositionColor(hasPlayer && slot.player ? slot.player.position : expectedPos);
  const swapRing = swapMode && hasPlayer
    ? isSwapPick
      ? 'border-broadcast-gold shadow-glow-gold'
      : swapCompatible === true
        ? 'border-broadcast-accent/70 shadow-glow-accent'
        : swapCompatible === false
          ? 'border-broadcast-red/40 opacity-60'
          : 'border-white/10'
    : null;

  return (
    <motion.div
      className={cn('min-w-0')}
      animate={{ opacity: hasPlayer ? 1 : 0.9 }}
    >
      <div
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-2xl border bg-broadcast-card/90 shadow-[0_10px_36px_rgb(0,0,0,0.38)] backdrop-blur-sm transition-[transform,border-color,box-shadow] duration-200',
          swapRing ??
          (hasPlayer
            ? 'border-broadcast-accent/50 shadow-glow-accent player-card-selected'
            : isSelected
            ? 'border-broadcast-gold shadow-glow-gold'
            : dropEligible
            ? 'border-dashed border-broadcast-accent shadow-glow-accent'
            : dropBlocked
            ? 'border-broadcast-red/40 opacity-60'
            : 'border-white/10')
        )}
      >
        <div
          className="h-1 w-full shrink-0"
          style={{ backgroundImage: `linear-gradient(90deg, transparent, ${slotColor}, transparent)` }}
          aria-hidden="true"
        />
        {slot.player ? (
          <div className="flex flex-1 flex-col">
            <div className="flex items-center gap-3 px-6 pt-5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold text-white ring-1 ring-white/25 [box-shadow:inset_0_2px_8px_rgb(0,0,0,0.35)]"
                style={{ backgroundImage: `linear-gradient(135deg, ${slotColor}, ${slotColor}55 130%)` }}
                aria-hidden="true"
                title={`Plays ${getPlayerPositions(slot.player).join(' / ')}`}
              >
                {slot.player.position}
              </span>
              <div className="min-w-0 flex-1 overflow-hidden leading-tight" title={slot.player.name}>
                <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-broadcast-text-secondary">{splitPlayerName(slot.player.name).first}</div>
                <h4 className="whitespace-nowrap font-display text-xl font-bold leading-tight text-white" style={{ fontSize: fitNameSize(splitPlayerName(slot.player.name).last || slot.player.name) }}>{splitPlayerName(slot.player.name).last || splitPlayerName(slot.player.name).first}</h4>
              </div>
              <span className="shrink-0 whitespace-nowrap font-display text-2xl font-bold leading-none text-broadcast-accent" title={`Overall rating ${slot.player.overall}`}>
                {slot.player.overall}
                <span className="ml-1 align-middle text-[11px] font-semibold uppercase tracking-[0.18em] text-broadcast-text-muted">OVR</span>
              </span>
            </div>

            <div className="space-y-1.5 px-6 pb-2 pt-3">
              <p className="text-sm leading-relaxed text-broadcast-text-secondary">
                <span className="font-bold text-broadcast-accent">{getPlayerPositions(slot.player).join(' / ')}</span>
                <span aria-hidden="true"> • </span>
                <span className="whitespace-nowrap" title="Height — taller players rebound and block better">{formatHeight(slot.player.heightIn, slot.player.position)}</span>
                {isFlex && (
                  <><span aria-hidden="true"> • </span><span className="font-bold text-broadcast-gold">FLEX</span></>
                )}
                <span aria-hidden="true"> • </span>
                <span className={cn('font-bold uppercase tracking-wide', slot.role === 'bench' ? 'text-broadcast-blue' : 'text-broadcast-accent')}>
                  {slot.role === 'bench' ? 'BENCH' : 'STARTER'}
                </span>
                {slot.isSixthMan && (
                  <><span aria-hidden="true"> • </span><span className="font-bold text-broadcast-gold">6TH MAN{sixthManAuto ? ' (AUTO)' : ''}</span></>
                )}
                {slot.optionRank && (
                  <><span aria-hidden="true"> • </span><span className="font-bold text-broadcast-purple">{slot.optionRank === 1 ? '1ST OPT' : slot.optionRank === 2 ? '2ND OPT' : '3RD OPT'}{optionAuto ? ' (AUTO)' : ''}</span></>
                )}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-broadcast-text-secondary">
                <span className="whitespace-nowrap font-semibold text-broadcast-text-primary">{slot.player.team.toUpperCase()}</span>
                <span aria-hidden="true" className="text-broadcast-text-muted">•</span>
                <span className="whitespace-nowrap">{slot.player.decade}</span>
                <span aria-hidden="true" className="text-broadcast-text-muted">•</span>
                <span className="break-words text-broadcast-gold">{slot.player.archetype}</span>
                <span aria-hidden="true" className="text-broadcast-text-muted">•</span>
                <span className="whitespace-nowrap font-medium text-broadcast-gold">{slot.player.stats.pts} PPG</span>
              </p>
            </div>

            <div className="mt-auto grid grid-cols-5 gap-2 border-t border-white/5 bg-black/20 px-6 pb-3 pt-4">
              <StatMini label="PTS" value={slot.player.stats.pts} color="text-broadcast-accent" />
              <StatMini label="REB" value={slot.player.stats.reb} color="text-broadcast-gold" />
              <StatMini label="AST" value={slot.player.stats.ast} color="#007aff" />
              <StatMini label="STL" value={slot.player.stats.stl} color="#34c759" />
              <StatMini label="BLK" value={slot.player.stats.blk} color="#af52de" />
            </div>
            {slot.role === 'bench' && (
              <div className="px-6 pb-4">
                <button
                  type="button"
                  onClick={() => onSetSixthMan(index)}
                  disabled={slot.isSixthMan}
                  className={cn(
                    'w-full rounded-lg border px-3 py-1.5 text-xs font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-gold',
                    slot.isSixthMan
                      ? 'border-broadcast-gold/60 bg-broadcast-gold/15 text-broadcast-gold'
                      : 'border-white/10 bg-white/5 text-broadcast-text-secondary hover:border-broadcast-gold/50 hover:text-broadcast-gold'
                  )}
                  aria-pressed={!!slot.isSixthMan}
                  title={slot.isSixthMan ? 'Your Sixth Man — first off the bench (~24 min)' : 'Make Sixth Man — first off the bench (~24 min)'}
                >
                  {slot.isSixthMan ? '★ 6TH MAN' : 'SET 6TH MAN'}
                </button>
              </div>
            )}
            <div className="px-6 pb-4">
              <div className="flex items-center gap-2" role="group" aria-label={`Offensive option for ${slot.player.name}`}>
                <span className="text-[11px] font-bold uppercase tracking-wider text-broadcast-text-muted">Option</span>
                {([1, 2, 3] as const).map(rank => (
                  <button
                    key={rank}
                    type="button"
                    onClick={() => onSetOption(index, slot.optionRank === rank ? null : rank)}
                    aria-pressed={slot.optionRank === rank}
                    title={rank === 1 ? '1st option — carries the offense (+8% scoring, top usage)' : rank === 2 ? '2nd option (+4% scoring)' : '3rd option (+2% scoring)'}
                    className={cn(
                      'h-7 w-7 rounded-lg border text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-purple',
                      slot.optionRank === rank
                        ? 'border-broadcast-purple/60 bg-broadcast-purple/20 text-broadcast-purple'
                        : 'border-white/10 bg-white/5 text-broadcast-text-secondary hover:border-broadcast-purple/50 hover:text-broadcast-purple'
                    )}
                  >
                    {rank}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onSwapClick(index)}
                  aria-pressed={isSwapPick}
                  title={swapMode ? (isSwapPick ? 'Cancel swap pick' : swapCompatible ? `Swap with selected player` : 'Cannot swap: positions do not fit both slots') : `Swap ${slot.player.name} with another slot (positions must fit both ways)`}
                  className={cn(
                    'ml-auto rounded-lg border px-2.5 py-1 text-[11px] font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent',
                    isSwapPick
                      ? 'border-broadcast-gold/60 bg-broadcast-gold/15 text-broadcast-gold'
                      : swapMode && swapCompatible === true
                        ? 'border-broadcast-accent/60 bg-broadcast-accent/10 text-broadcast-accent hover:bg-broadcast-accent/20'
                        : 'border-white/10 bg-white/5 text-broadcast-text-secondary hover:border-broadcast-accent/50 hover:text-white'
                  )}
                >
                  {isSwapPick ? 'PICKED ⇄' : '⇄ SWAP'}
                </button>
              </div>
              {swapMode && isSwapPick && (
                <p className="mt-1.5 text-[11px] font-medium text-broadcast-gold">Pick another highlighted card to swap — positions must fit both slots.</p>
              )}
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
            aria-label={`Select ${roleLabel} ${slot.position} slot (${getPositionLabel(slot.position)})${isSelected ? ', selected' : ''}`}
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
  sixthManExplicit: boolean;
  optionsExplicit: { 1: boolean; 2: boolean; 3: boolean };
  onSelectSlot: (index: number) => void;
  onDropPlayer: (player: Player, slotIndex: number) => void;
  onSetSixthMan: (index: number) => void;
  onSetOption: (index: number, rank: 1 | 2 | 3 | null) => void;
  onSwapPlayers: (indexA: number, indexB: number) => void;
}

export function LineupBuilder({ lineup, selectedSlot, draggedPlayer, sixthManExplicit, optionsExplicit, onSelectSlot, onDropPlayer, onSetSixthMan, onSetOption, onSwapPlayers }: LineupBuilderProps) {
  const [swapPick, setSwapPick] = useState<number | null>(null);
  const filled = lineup.filter(s => s.player).length;
  const total = lineup.length || 10;
  const starters = lineup.slice(0, 5);
  const bench = lineup.slice(5, 10);
  const sixthSet = lineup.some(s => s.isSixthMan && s.player);
  const optionsSet = [1, 2, 3].every(r => lineup.some(s => s.optionRank === r && s.player));
  const swapMode = swapPick !== null;

  const swappableWithPick = (index: number): boolean | null => {
    if (swapPick === null) return null;
    if (index === swapPick) return null;
    const a = lineup[swapPick];
    const b = lineup[index];
    if (!a?.player || !b?.player) return false;
    return canPlayPosition(a.player, b.position) && canPlayPosition(b.player, a.position);
  };

  const handleSwapClick = (index: number) => {
    if (!lineup[index]?.player) return;
    if (swapPick === null) {
      setSwapPick(index);
      return;
    }
    if (swapPick === index) {
      setSwapPick(null);
      return;
    }
    onSwapPlayers(swapPick, index);
    setSwapPick(null);
  };

  const renderSlot = (slot: LineupSlot, index: number) => (
    <Slot
      key={`${slot.position}-${slot.role ?? (index < 5 ? 'starter' : 'bench')}-${index}`}
      slot={slot}
      index={index}
      isSelected={selectedSlot === index}
      draggedPlayer={draggedPlayer}
      sixthManAuto={!!slot.isSixthMan && !sixthManExplicit}
      optionAuto={!!slot.optionRank && !(optionsExplicit?.[slot.optionRank] ?? false)}
      swapMode={swapMode}
      isSwapPick={swapPick === index}
      swapCompatible={swappableWithPick(index)}
      onSelect={onSelectSlot}
      onDropPlayer={onDropPlayer}
      onSetSixthMan={onSetSixthMan}
      onSetOption={onSetOption}
      onSwapClick={handleSwapClick}
    />
  );
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title font-display text-xl">YOUR LINEUP ({filled}/{total})</h2>
        {filled >= 5 && (!sixthSet || !optionsSet) && (
          <span className="text-xs font-bold text-broadcast-gold">
            {!sixthSet && !optionsSet ? 'PICK A 6TH MAN + OPTIONS ↓' : !sixthSet ? 'PICK A 6TH MAN ↓' : 'PICK OPTIONS 1-3 ↓'}
          </span>
        )}
      </div>
      {swapMode && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-broadcast-gold/40 bg-broadcast-gold/10 px-3 py-2">
          <span className="text-xs font-bold text-broadcast-gold">SWAP MODE — pick a highlighted card. Positions must fit both slots.</span>
          <button
            type="button"
            onClick={() => setSwapPick(null)}
            className="rounded-lg border border-broadcast-gold/40 px-2 py-1 text-[11px] font-bold text-broadcast-gold hover:bg-broadcast-gold/20"
          >
            CANCEL
          </button>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-broadcast-accent">Starters</h3>
        <div className="grid grid-cols-1 gap-5">
          {starters.map((slot, i) => renderSlot(slot, i))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-broadcast-blue">Bench</h3>
        <div className="grid grid-cols-1 gap-5">
          {bench.map((slot, i) => renderSlot(slot, i + 5))}
        </div>
      </div>
    </div>
  );
}
