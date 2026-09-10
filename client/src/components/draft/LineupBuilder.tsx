import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronDown } from 'lucide-react';
import { cn, getPositionColor, bestTextOn, getPositionLabel, formatHeight } from '../../utils/helpers';
import { useIsSmallScreen } from '../../utils/useIsSmallScreen';
import { DraftedPlayerModal } from './DraftedPlayerModal';
import { canPlayPosition, getPlayerPositions } from '../../types/game';
import type { LineupSlot, Player } from '../../types/game';

/** "Michael Jordan" -> "M. Jordan" for compact rows. */
function compactName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0]!.charAt(0)}. ${parts.slice(1).join(' ')}`;
}

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
  expanded: boolean;
  isSmallScreen: boolean;
  onToggleExpand: (index: number) => void;
  onShowDetails: (index: number) => void;
  onSelect: (index: number) => void;
  onDropPlayer: (player: Player, slotIndex: number) => void;
  onSetSixthMan: (index: number) => void;
  onSetOption: (index: number, rank: 1 | 2 | 3 | null) => void;
  onSwapClick: (index: number) => void;
}

function Slot({ slot, index, isSelected, draggedPlayer, sixthManAuto, optionAuto, swapMode, isSwapPick, swapCompatible, expanded, isSmallScreen, onToggleExpand, onShowDetails, onSelect, onDropPlayer, onSetSixthMan, onSetOption, onSwapClick }: SlotProps) {
  const hasPlayer = !!slot.player;
  const expectedPos = slot.position;
  const roleLabel = slot.role === 'bench' ? 'Bench' : 'Starter';
  const [isDragOver, setIsDragOver] = useState(false);

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

  const slotColor = getPositionColor(hasPlayer && slot.player ? slot.player.position : expectedPos);
  const ring = swapMode && hasPlayer
    ? isSwapPick
      ? 'border-broadcast-gold shadow-glow-gold'
      : swapCompatible === true
        ? 'border-broadcast-accent/70 shadow-glow-accent'
        : swapCompatible === false
          ? 'border-broadcast-red/40 opacity-60'
          : 'border-white/10'
    : hasPlayer
      ? expanded
        ? 'border-broadcast-accent/60 shadow-glow-accent'
        : 'border-white/10'
      : isSelected
        ? 'border-broadcast-gold shadow-glow-gold'
        : dropEligible
          ? 'border-dashed border-broadcast-accent shadow-glow-accent'
          : dropBlocked
            ? 'border-broadcast-red/40 opacity-60'
            : 'border-white/10';

  // --- Empty slot: single compact row (select / drop target) ---
  if (!slot.player) {
    return (
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
        aria-label={`Select ${roleLabel} ${slot.position} slot (${getPositionLabel(slot.position)})${isSelected ? ', selected' : ''}`}
        aria-pressed={isSelected}
        className={cn(
          'flex w-full items-center gap-2 overflow-hidden rounded-xl border bg-broadcast-card/90 px-2.5 py-2 text-left backdrop-blur-sm transition-[border-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-gold',
          ring,
        )}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ring-1 ring-white/25"
          style={{ backgroundColor: slotColor, color: bestTextOn(slotColor) }}
          aria-hidden="true"
        >
          {expectedPos}
        </span>
        <Plus className="h-3.5 w-3.5 shrink-0 text-broadcast-text-muted" aria-hidden="true" />
        <span className="truncate text-xs font-medium text-broadcast-text-secondary">
          {roleLabel} {getPositionLabel(expectedPos)}
        </span>
        {isSelected && !draggedPlayer && (
          <span className="ml-auto shrink-0 text-[10px] font-bold text-broadcast-gold">SELECTED</span>
        )}
        {dropEligible && (
          <span className="ml-auto shrink-0 text-[10px] font-bold text-broadcast-accent">
            {isDragOver ? 'RELEASE' : 'DROP'}
          </span>
        )}
        {dropBlocked && (
          <span className="ml-auto shrink-0 text-[10px] font-medium text-broadcast-red">NO FIT</span>
        )}
      </button>
    );
  }

  // --- Filled slot: compact row (POS | name | rating), tap to expand ---
  const p = slot.player;
  const optLabel = slot.optionRank === 1 ? '1ST' : slot.optionRank === 2 ? '2ND' : slot.optionRank === 3 ? '3RD' : null;
  const hoverTitle = `${p.name} • ${getPlayerPositions(p).join('/')} • ${p.overall} • ${p.stats.pts}/${p.stats.reb}/${p.stats.ast} • ${p.team} ${p.decade}`;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-broadcast-card/90 backdrop-blur-sm transition-[border-color,box-shadow] duration-200',
        ring,
      )}
    >
      <div className="flex w-full items-center gap-2 px-2.5 py-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ring-1 ring-white/25"
          style={{ backgroundColor: slotColor, color: bestTextOn(slotColor) }}
          aria-hidden="true"
          title={`Plays ${getPlayerPositions(p).join(' / ')}`}
        >
          {expectedPos}
        </span>
        <button
          type="button"
          onClick={() => (swapMode ? onSwapClick(index) : isSmallScreen ? onShowDetails(index) : onToggleExpand(index))}
          aria-expanded={isSmallScreen ? undefined : expanded}
          aria-label={swapMode ? `Swap ${p.name}` : isSmallScreen ? `Show ${p.name} details` : `${expanded ? 'Collapse' : 'Expand'} ${p.name} details`}
          title={hoverTitle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent"
        >
          <span className="truncate text-sm font-semibold text-white" title={p.name}>{compactName(p.name)}</span>
          {slot.isSixthMan && (
            <span className="shrink-0 rounded-full border border-broadcast-gold/50 bg-broadcast-gold/15 px-1.5 py-px text-[10px] font-bold text-broadcast-gold">
              6TH{sixthManAuto ? '*' : ''}
            </span>
          )}
          {optLabel && (
            <span className="shrink-0 rounded-full border border-broadcast-purple/50 bg-broadcast-purple/15 px-1.5 py-px text-[10px] font-bold text-broadcast-purple">
              {optLabel}{optionAuto ? '*' : ''}
            </span>
          )}
          <span className="ml-auto shrink-0 font-display text-lg font-bold leading-none text-broadcast-accent" title={`Overall ${p.overall}`}>
            {p.overall}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-broadcast-text-muted transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onSwapClick(index)}
          aria-pressed={isSwapPick}
          aria-label={isSwapPick ? `Cancel swap pick for ${p.name}` : `Swap ${p.name} with another player`}
          title={swapMode ? (isSwapPick ? 'Cancel swap pick' : swapCompatible ? 'Swap with selected player' : 'Cannot swap: positions must fit both slots') : `Swap ${p.name} (positions must fit both slots)`}
          className={cn(
            'shrink-0 rounded-md border px-1.5 py-1 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent',
            isSwapPick
              ? 'border-broadcast-gold/60 bg-broadcast-gold/15 text-broadcast-gold'
              : 'border-white/10 bg-white/5 text-broadcast-text-secondary hover:border-broadcast-accent/50 hover:text-white'
          )}
        >
          ⇄
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="border-t border-white/5 bg-black/20 px-3 pb-3 pt-2.5">
              <p className="text-xs leading-relaxed text-broadcast-text-secondary">
                <span className="font-bold text-broadcast-accent">{getPlayerPositions(p).join(' / ')}</span>
                <span aria-hidden="true"> • </span>
                <span className="whitespace-nowrap">{formatHeight(p.heightIn, p.position)}</span>
                <span aria-hidden="true"> • </span>
                <span className="font-semibold text-broadcast-text-primary">{p.team.toUpperCase()}</span>
                <span aria-hidden="true"> • </span>
                <span className="whitespace-nowrap">{p.decade}</span>
                <span aria-hidden="true"> • </span>
                <span className="text-broadcast-gold">{p.archetype}</span>
              </p>
              <div className="mt-2 grid grid-cols-5 gap-1.5">
                <StatMini label="PTS" value={p.stats.pts} color="text-broadcast-accent" />
                <StatMini label="REB" value={p.stats.reb} color="text-broadcast-gold" />
                <StatMini label="AST" value={p.stats.ast} color="#007aff" />
                <StatMini label="STL" value={p.stats.stl} color="#34c759" />
                <StatMini label="BLK" value={p.stats.blk} color="#af52de" />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {slot.role === 'bench' && (
                  <button
                    type="button"
                    onClick={() => onSetSixthMan(index)}
                    disabled={slot.isSixthMan}
                    aria-pressed={!!slot.isSixthMan}
                    title={slot.isSixthMan ? 'Your Sixth Man. First off the bench.' : 'Make Sixth Man. First off the bench.'}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[11px] font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-gold',
                      slot.isSixthMan
                        ? 'border-broadcast-gold/60 bg-broadcast-gold/15 text-broadcast-gold'
                        : 'border-white/10 bg-white/5 text-broadcast-text-secondary hover:border-broadcast-gold/50 hover:text-broadcast-gold'
                    )}
                  >
                    {slot.isSixthMan ? '★ 6TH' : 'SET 6TH'}
                  </button>
                )}
                <div className="flex items-center gap-1.5" role="group" aria-label={`Offensive option for ${p.name}`}>
                  {([1, 2, 3] as const).map(rank => (
                    <button
                      key={rank}
                      type="button"
                      onClick={() => onSetOption(index, slot.optionRank === rank ? null : rank)}
                      aria-pressed={slot.optionRank === rank}
                      title={rank === 1 ? '1st option (+8% scoring, top usage)' : rank === 2 ? '2nd option (+4%)' : '3rd option (+2%)'}
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
                </div>
              </div>
              {swapMode && isSwapPick && (
                <p className="mt-1.5 text-[11px] font-medium text-broadcast-gold">Pick another highlighted row to swap. Positions must fit both slots.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] py-1 text-center">
      <div className="font-bold font-mono text-sm" style={{ color }}>{value}</div>
      <div className="text-[9px] text-broadcast-text-muted uppercase tracking-wide">{label}</div>
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
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  // Phone-only drafted-player sheet: row taps open the modal below lg so the
  // list never gets pushed down; desktop keeps the inline expand (no duplication).
  const isSmallScreen = useIsSmallScreen();
  const [detailsIdx, setDetailsIdx] = useState<number | null>(null);
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

  const handleToggleExpand = (index: number) => {
    setExpandedIdx(prev => (prev === index ? null : index));
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
      expanded={expandedIdx === index}
      isSmallScreen={isSmallScreen}
      onToggleExpand={handleToggleExpand}
      onShowDetails={(idx) => { if (isSmallScreen) setDetailsIdx(idx); }}
      onSelect={onSelectSlot}
      onDropPlayer={onDropPlayer}
      onSetSixthMan={onSetSixthMan}
      onSetOption={onSetOption}
      onSwapClick={handleSwapClick}
    />
  );
  const detailsSlot = detailsIdx !== null ? lineup[detailsIdx] ?? null : null;
  // Belt-and-suspenders: the sheet is phone-only. If the viewport grows to
  // desktop while it is open (rotate, resize, devtools), close it so a
  // desktop click can never leave a modal on screen.
  useEffect(() => {
    if (!isSmallScreen && detailsIdx !== null) setDetailsIdx(null);
  }, [isSmallScreen, detailsIdx]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title font-display text-xl">YOUR LINEUP ({filled}/{total})</h2>
        {filled >= 5 && (!sixthSet || !optionsSet) && (
          <span className="shrink-0 text-xs font-bold text-broadcast-gold">
            {!sixthSet && !optionsSet ? 'PICK 6TH + OPTIONS ↓' : !sixthSet ? 'PICK 6TH ↓' : 'PICK 1-3 ↓'}
          </span>
        )}
      </div>
      {filled > 0 && (sixthSet && optionsSet) && (
        <p className="-mt-2 text-[11px] text-broadcast-text-muted">Tap a row for details (sheet on phones, expand on desktop). ⇄ swaps starters ↔ bench (positions must fit).</p>
      )}
      {swapMode && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-broadcast-gold/40 bg-broadcast-gold/10 px-3 py-2">
          <span className="text-xs font-bold text-broadcast-gold">SWAP: pick a highlighted row.</span>
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
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-broadcast-accent">Starters</h3>
        <div className="space-y-1.5">
          {starters.map((slot, i) => renderSlot(slot, i))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-broadcast-blue">Bench</h3>
        <div className="space-y-1.5">
          {bench.map((slot, i) => renderSlot(slot, i + 5))}
        </div>
      </div>

      <AnimatePresence>
        {isSmallScreen && detailsSlot?.player && detailsIdx !== null && (
          <DraftedPlayerModal
            slotIndex={detailsIdx}
            slot={detailsSlot}
            slots={lineup}
            sixthManAuto={!!detailsSlot.isSixthMan && !sixthManExplicit}
            optionAuto={!!detailsSlot.optionRank && !(optionsExplicit?.[detailsSlot.optionRank] ?? false)}
            onSetSixthMan={onSetSixthMan}
            onSetOption={onSetOption}
            onSwapPlayers={onSwapPlayers}
            onClose={() => setDetailsIdx(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
