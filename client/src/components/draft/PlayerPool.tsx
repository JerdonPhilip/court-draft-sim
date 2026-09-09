import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, getPositionColor, formatHeight, splitPlayerName, fitNameSize } from '../../utils/helpers';
import { FRANCHISES, DECADES } from '../../data/constants';
import { canPlayPosition, getPlayerPositions, personKeyOf } from '../../types/game';
import type { LineupSlot, Player, Position } from '../../types/game';

interface PlayerPoolProps {
  pool: {
    players: Player[];
    franchise: string;
    decade: string;
  } | null;
  draftedPlayerIds: string[];
  /** Same-person keys of drafted players — hides other-era versions. */
  draftedPersonKeys?: string[];
  onDraftPlayer: (player: Player) => void;
  onDragStartPlayer: (player: Player) => void;
  onDragEndPlayer: () => void;
  /** Currently unfilled slots — a card is draftable if it fits ANY of these. */
  emptyPositions: Position[];
  lineupSlots: LineupSlot[];
  selectedSlotPosition: Position | null;
}

function fittingEmptySlots(player: Player, slots: LineupSlot[]): Position[] {
  return slots
    .filter(s => !s.player)
    .map(s => s.position)
    .filter(pos => canPlayPosition(player, pos));
}

const POSITION_ORDER: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

type SortKey = 'overall' | 'pts' | 'name';

/** "Michael Jordan" -> "M. Jordan" for the compact drag ghost. */
function compactName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0]!.charAt(0)}. ${parts.slice(1).join(' ')}`;
}

/**
 * Compact drag preview (POS | name | OVR) so the ghost never covers the
 * lineup drop targets. Built with textContent (no HTML injection) and
 * removed on drag end.
 */
let dragGhost: HTMLElement | null = null;

function makeDragGhost(player: Player): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:-1000px;left:0;display:flex;align-items:center;gap:8px;'
    + 'padding:8px 12px;background:#141b26;border:1px solid rgba(0,212,170,.55);border-radius:12px;'
    + 'pointer-events:none;width:230px;box-shadow:0 10px 36px rgba(0,0,0,.5);'
    + "font-family:system-ui,sans-serif;";
  const badge = document.createElement('span');
  badge.textContent = player.position;
  badge.style.cssText = `display:flex;align-items:center;justify-content:center;width:28px;height:28px;flex-shrink:0;`
    + `border-radius:8px;font-size:11px;font-weight:800;color:#fff;background-color:${getPositionColor(player.position)};`;
  const name = document.createElement('span');
  name.textContent = compactName(player.name);
  name.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
    + 'font-size:13px;font-weight:600;color:#fff;';
  const ovr = document.createElement('span');
  ovr.textContent = String(player.overall);
  ovr.style.cssText = 'flex-shrink:0;font-size:16px;font-weight:800;color:#00d4aa;';
  el.append(badge, name, ovr);
  document.body.appendChild(el);
  return el;
}

function clearDragGhost(): void {
  dragGhost?.remove();
  dragGhost = null;
}

export function PlayerPool({ pool, draftedPlayerIds, draftedPersonKeys, onDraftPlayer, onDragStartPlayer, onDragEndPlayer, emptyPositions, lineupSlots, selectedSlotPosition }: PlayerPoolProps) {
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('overall');

  // New pool = fresh filter; keep the chosen sort.
  useEffect(() => {
    setPosFilter('ALL');
  }, [pool?.franchise, pool?.decade]);

  const availablePlayers = useMemo(
    () => (pool ? pool.players.filter((p: Player) => !draftedPlayerIds.includes(p.id) && !(draftedPersonKeys ?? []).includes(personKeyOf(p))) : []),
    [pool, draftedPlayerIds, draftedPersonKeys]
  );

  const presentPositions = useMemo(
    () => POSITION_ORDER.filter(pos => availablePlayers.some(p => getPlayerPositions(p).includes(pos))),
    [availablePlayers]
  );

  const visiblePlayers = useMemo(() => {
    const filtered = posFilter === 'ALL'
      ? [...availablePlayers]
      : availablePlayers.filter(p => getPlayerPositions(p).includes(posFilter));
    switch (sortKey) {
      case 'pts':
        return filtered.sort((a, b) => b.stats.pts - a.stats.pts || b.overall - a.overall);
      case 'name':
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
      case 'overall':
      default:
        return filtered.sort((a, b) => b.overall - a.overall);
    }
  }, [availablePlayers, posFilter, sortKey]);

  if (!pool) return null;

  const franchiseName = FRANCHISES.find(f => f.id === pool.franchise)?.name ?? pool.franchise;
  const decadeLabel = DECADES.find(d => d.id === pool.decade)?.label ?? pool.decade;

  const draftableCount = availablePlayers.filter(p => fittingEmptySlots(p, lineupSlots).length > 0).length;
  const isFiltered = posFilter !== 'ALL';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pool.franchise + pool.decade}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title font-display text-lg">AVAILABLE PLAYERS • {franchiseName} • {decadeLabel}</h3>
          <div className="flex items-center gap-2 text-sm text-broadcast-text-secondary" aria-live="polite">
            <span className="px-2 py-1 bg-broadcast-accent/20 text-broadcast-accent rounded border border-broadcast-accent/30">
              {draftableCount}/{availablePlayers.length} DRAFTABLE
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter available players">
          <button
            type="button"
            onClick={() => setPosFilter('ALL')}
            aria-pressed={posFilter === 'ALL'}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent',
              posFilter === 'ALL'
                ? 'border-broadcast-accent/50 bg-broadcast-accent/15 text-broadcast-accent'
                : 'border-white/10 bg-white/5 text-broadcast-text-secondary hover:border-broadcast-accent/30 hover:text-white'
            )}
          >
            ALL
          </button>
          {presentPositions.map(pos => (
            <button
              key={pos}
              type="button"
              onClick={() => setPosFilter(posFilter === pos ? 'ALL' : pos)}
              aria-pressed={posFilter === pos}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent',
                posFilter === pos
                  ? 'border-broadcast-accent/50 bg-broadcast-accent/15 text-broadcast-accent'
                  : 'border-white/10 bg-white/5 text-broadcast-text-secondary hover:border-broadcast-accent/30 hover:text-white'
              )}
            >
              {pos}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {isFiltered && (
              <span className="text-xs text-broadcast-text-muted" aria-live="polite">
                {visiblePlayers.length} of {availablePlayers.length}
              </span>
            )}
            <label htmlFor="pool-sort" className="sr-only">Sort players</label>
            <select
              id="pool-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-lg border border-white/10 bg-broadcast-card px-2 py-1 text-xs font-medium text-broadcast-text-secondary focus:border-broadcast-accent/50 focus:outline-none"
            >
              <option value="overall">Best overall</option>
              <option value="pts">Most points</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 [grid-auto-rows:1fr] 2xl:grid-cols-3" role="list">
          {visiblePlayers.map((player: Player, index: number) => {
            const fits = fittingEmptySlots(player, lineupSlots);
            const isDraftable = fits.length > 0;
            const isFlex = (player.secondaryPositions?.length ?? 0) > 0;
            const fitsSelected = selectedSlotPosition !== null && canPlayPosition(player, selectedSlotPosition);
            const posColor = getPositionColor(player.position);
            return (
              <motion.div
                key={player.id}
                role="listitem"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3) }}
                className="h-full min-w-0"
              >
              <button
                type="button"
                draggable={isDraftable}
                onDragStart={(e: React.DragEvent<HTMLButtonElement>) => {
                  e.dataTransfer.setData('application/json', JSON.stringify(player));
                  e.dataTransfer.effectAllowed = 'move';
                  // Shrink the drag ghost to a compact chip so drop targets stay visible.
                  try {
                    clearDragGhost();
                    dragGhost = makeDragGhost(player);
                    e.dataTransfer.setDragImage(dragGhost, 115, 22);
                  } catch {
                    /* fall back to the default drag image */
                  }
                  onDragStartPlayer(player);
                }}
                onDragEnd={() => { clearDragGhost(); onDragEndPlayer(); }}
                className={cn(
                  'group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border text-left',
                  'bg-broadcast-card/90 shadow-[0_10px_36px_rgb(0,0,0,0.38)] backdrop-blur-sm',
                  'transition-[transform,border-color,box-shadow,opacity] duration-200 hover:-translate-y-1',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-broadcast-accent focus-visible:ring-offset-2 focus-visible:ring-offset-broadcast-dark',
                  'cursor-grab active:cursor-grabbing disabled:cursor-not-allowed',
                  isDraftable
                    ? 'border-white/10 hover:border-broadcast-accent/50 hover:shadow-glow-accent'
                    : 'border-white/5 opacity-40',
                  selectedSlotPosition && isDraftable && !fitsSelected && 'border-broadcast-red/40',
                  selectedSlotPosition && fitsSelected && 'border-broadcast-gold/60 shadow-glow-gold'
                )}
                onClick={() => onDraftPlayer(player)}
                disabled={!isDraftable}
                aria-disabled={!isDraftable}
                aria-label={
                  isDraftable
                    ? `Draft ${player.name}, ${formatHeight(player.heightIn, player.position)}, plays ${getPlayerPositions(player).join('/')}${selectedSlotPosition ? `, selected slot ${selectedSlotPosition}${fitsSelected ? ' fits' : ' does not fit'}` : `, fits ${fits.join(', ')}`}. Drag to a slot or click to draft.`
                    : `${player.name}, ${formatHeight(player.heightIn, player.position)}, plays ${getPlayerPositions(player).join('/')} (doesn't fit open slots ${emptyPositions.join(', ')})`
                }
                title={
                  !isDraftable
                    ? `No open slot for ${getPlayerPositions(player).join('/')}`
                    : selectedSlotPosition && !fitsSelected
                      ? `${player.name} doesn't fit the selected ${selectedSlotPosition} slot. Pick another slot or player.`
                      : `Draft ${player.name} → ${selectedSlotPosition ?? fits.join(' or ')} (or drag)`
                }
              >
                {/* gradient hairline tinted by position — in normal flow, can't overlap */}
                <div
                  className="h-1 w-full shrink-0"
                  style={{ backgroundImage: `linear-gradient(90deg, transparent, ${posColor}, transparent)` }}
                  aria-hidden="true"
                />
                <div className="flex items-center gap-3 px-5 pt-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold text-white ring-1 ring-white/25 [box-shadow:inset_0_2px_8px_rgb(0,0,0,0.35)]"
                    style={{ backgroundImage: `linear-gradient(135deg, ${posColor}, ${posColor}55 130%)` }}
                    aria-hidden="true"
                    title={`Plays ${getPlayerPositions(player).join(' / ')}`}
                  >
                    {player.position}
                  </span>
                  <div className="min-w-0 flex-1 overflow-hidden leading-tight" title={player.name}>
                    <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-broadcast-text-secondary">{splitPlayerName(player.name).first}</div>
                    <h4 className="whitespace-nowrap font-display font-bold leading-tight text-white" style={{ fontSize: fitNameSize(splitPlayerName(player.name).last || player.name) }}>{splitPlayerName(player.name).last || splitPlayerName(player.name).first}</h4>
                  </div>
                  <span className="shrink-0 whitespace-nowrap font-display text-2xl font-bold leading-none text-broadcast-accent" title={`Overall rating ${player.overall}`}>
                    {player.overall}
                    <span className="ml-1 align-middle text-[11px] font-semibold uppercase tracking-[0.18em] text-broadcast-text-muted">OVR</span>
                  </span>
                </div>

                <div className="space-y-1.5 px-5 pb-1.5 pt-2">
                  <p className="text-sm leading-relaxed text-broadcast-text-secondary">
                    <span className="font-bold text-broadcast-accent">{getPlayerPositions(player).join(' / ')}</span>
                    <span aria-hidden="true"> • </span>
                    <span className="whitespace-nowrap" title="Height — taller players rebound and block better">{formatHeight(player.heightIn, player.position)}</span>
                    {isFlex && (
                      <><span aria-hidden="true"> • </span><span className="font-bold text-broadcast-gold">FLEX</span></>
                    )}
                    <span aria-hidden="true"> • </span>
                    <span className="font-semibold text-broadcast-text-primary">{FRANCHISES.find(f => f.id === player.team)?.abbreviation ?? player.team}</span>
                    <span aria-hidden="true"> • </span>
                    <span className="whitespace-nowrap">{DECADES.find(d => d.id === player.decade)?.label ?? player.decade}</span>
                    <span aria-hidden="true"> • </span>
                    <span className="text-broadcast-gold">{player.archetype}</span>
                    <span aria-hidden="true"> • </span>
                    <span className="whitespace-nowrap font-medium text-broadcast-gold">{player.stats.pts} PPG</span>
                  </p>
                </div>

                <div className="mt-auto grid grid-cols-5 gap-2 border-t border-white/5 bg-black/20 px-5 pb-3 pt-2.5">
                  <StatMini label="PTS" value={player.stats.pts} color="text-broadcast-accent" />
                  <StatMini label="REB" value={player.stats.reb} color="text-broadcast-gold" />
                  <StatMini label="AST" value={player.stats.ast} color="text-broadcast-blue" />
                  <StatMini label="STL" value={player.stats.stl} color="text-broadcast-green" />
                  <StatMini label="BLK" value={player.stats.blk} color="text-broadcast-purple" />
                </div>
              </button>
              </motion.div>
            );
          })}
        </div>

        {availablePlayers.length === 0 && (
          <div className="text-center py-8 text-broadcast-text-muted">
            <p>All players from this pool have been drafted</p>
          </div>
        )}
        {availablePlayers.length > 0 && draftableCount === 0 && (
          <div className="text-center p-6 card border-broadcast-gold/30" role="alert">
            <p className="text-broadcast-text-secondary mb-3">
              Nobody in this pool fits your open slots ({emptyPositions.join(', ')}). Re-spin for free. This pool should have been filtered, so this is unexpected.
            </p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center py-1">
      <div className={cn('font-bold font-mono text-lg', color)}>{value}</div>
      <div className="text-[11px] text-broadcast-text-muted uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}
