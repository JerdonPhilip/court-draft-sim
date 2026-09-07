import { motion, AnimatePresence } from 'framer-motion';
import { cn, getPositionColor, getPositionLabel, formatHeight, heightEdgeLabel } from '../../utils/helpers';
import { FRANCHISES, DECADES } from '../../data/constants';
import { canPlayPosition, getPlayerPositions } from '../../types/game';
import type { LineupSlot, Player, Position } from '../../types/game';

interface PlayerPoolProps {
  pool: {
    players: Player[];
    franchise: string;
    decade: string;
  } | null;
  draftedPlayerIds: string[];
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

export function PlayerPool({ pool, draftedPlayerIds, onDraftPlayer, onDragStartPlayer, onDragEndPlayer, emptyPositions, lineupSlots, selectedSlotPosition }: PlayerPoolProps) {
  if (!pool) return null;

  const availablePlayers = pool.players.filter((p: Player) => !draftedPlayerIds.includes(p.id));
  const franchiseName = FRANCHISES.find(f => f.id === pool.franchise)?.name ?? pool.franchise;
  const decadeLabel = DECADES.find(d => d.id === pool.decade)?.label ?? pool.decade;

  const draftableCount = availablePlayers.filter(p => fittingEmptySlots(p, lineupSlots).length > 0).length;

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
          <h3 className="section-title font-display text-lg">AVAILABLE PLAYERS — {franchiseName} • {decadeLabel}</h3>
          <div className="flex items-center gap-2 text-sm text-broadcast-text-secondary" aria-live="polite">
            <span className="px-2 py-1 bg-broadcast-accent/20 text-broadcast-accent rounded border border-broadcast-accent/30">
              {draftableCount}/{availablePlayers.length} DRAFTABLE
            </span>
          </div>
        </div>

        {emptyPositions.length > 0 && (
          <p className="text-sm text-broadcast-text-secondary" aria-live="polite">
            {selectedSlotPosition ? (
              <><span className="font-bold text-broadcast-gold">{selectedSlotPosition} slot selected</span> — click a fitting player or drag one onto a glowing slot.</>
            ) : (
              <><span className="font-bold text-broadcast-accent">Open: {emptyPositions.join(', ')}</span> — pick a slot first, then a player.</>
            )}
            {' '}Flex players show all their spots and can be dragged to any of them.
          </p>
        )}

        <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 [grid-auto-rows:1fr] 2xl:grid-cols-3" role="list">
          {availablePlayers.map((player: Player, index: number) => {
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
                  onDragStartPlayer(player);
                }}
                onDragEnd={onDragEndPlayer}
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
                    : `${player.name}, ${formatHeight(player.heightIn, player.position)}, plays ${getPlayerPositions(player).join('/')} — doesn't fit open slots ${emptyPositions.join(', ')}`
                }
                title={
                  !isDraftable
                    ? `No open slot for ${getPlayerPositions(player).join('/')}`
                    : selectedSlotPosition && !fitsSelected
                      ? `${player.name} doesn't fit the selected ${selectedSlotPosition} slot — pick another slot or player`
                      : `Draft ${player.name} → ${selectedSlotPosition ?? fits.join(' or ')} (or drag)`
                }
              >
                {/* gradient hairline tinted by position — in normal flow, can't overlap */}
                <div
                  className="h-1 w-full shrink-0"
                  style={{ backgroundImage: `linear-gradient(90deg, transparent, ${posColor}, transparent)` }}
                  aria-hidden="true"
                />
                <div className="flex items-start gap-4 p-5">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-display text-sm font-bold text-white ring-1 ring-white/25 [box-shadow:inset_0_2px_10px_rgb(0,0,0,0.35)]"
                    style={{ backgroundImage: `linear-gradient(135deg, ${posColor}, ${posColor}55 130%)` }}
                    aria-hidden="true"
                  >
                    <span className="px-1 text-center leading-tight [overflow-wrap:anywhere]">{getPlayerPositions(player).join('/')}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="min-w-0 flex-1 break-words font-display text-xl font-bold leading-snug text-white">{player.name}</h4>
                      <div className="shrink-0 text-right">
                        <div className="font-display text-2xl font-bold leading-none text-broadcast-accent">{player.overall}</div>
                        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-broadcast-text-muted">OVR</div>
                      </div>
                    </div>
                    <div className="mb-2 mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="whitespace-nowrap rounded-full border border-broadcast-accent/30 bg-broadcast-accent/10 px-2.5 py-0.5 text-xs font-semibold text-broadcast-accent">
                        {getPlayerPositions(player).join(' / ')}
                      </span>
                      <span className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-broadcast-text-secondary" title="Height — taller players rebound and block better">
                        {formatHeight(player.heightIn, player.position)}
                      </span>
                      {isFlex && (
                        <span className="whitespace-nowrap rounded-full border border-broadcast-gold/30 bg-broadcast-gold/10 px-2.5 py-0.5 text-xs font-semibold text-broadcast-gold">
                          FLEX
                        </span>
                      )}
                    </div>

                    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-broadcast-text-secondary">
                      <span className="whitespace-nowrap font-semibold text-broadcast-text-primary">{FRANCHISES.find(f => f.id === player.team)?.abbreviation ?? player.team}</span>
                      <span aria-hidden="true" className="text-broadcast-text-muted">•</span>
                      <span className="whitespace-nowrap">{DECADES.find(d => d.id === player.decade)?.label ?? player.decade}</span>
                      <span aria-hidden="true" className="text-broadcast-text-muted">•</span>
                      <span className="break-words text-broadcast-gold">{player.archetype}</span>
                      <span aria-hidden="true" className="text-broadcast-text-muted">•</span>
                      <span className="whitespace-nowrap font-medium text-broadcast-gold">{player.stats.pts} PPG</span>
                    </div>

                    <div className="mt-2 text-xs">
                      {isDraftable ? (
                        <span className="font-medium text-broadcast-accent">
                          Fits: {fits.join(', ')}
                          {selectedSlotPosition && (
                            fitsSelected
                              ? ` • fits selected ${selectedSlotPosition}`
                              : ` • not ${selectedSlotPosition} — change slot`
                          )}
                          {heightEdgeLabel(player.heightIn, fits[0] ?? player.position) && (
                            <> • {heightEdgeLabel(player.heightIn, fits[0] ?? player.position)}</>
                          )}
                        </span>
                      ) : (
                        <span className="text-broadcast-text-muted">Needs: {getPositionLabel(player.position)} — no open slot</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-5 gap-2 border-t border-white/5 bg-black/20 px-5 pb-4 pt-3">
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
              Nobody in this pool fits your open slots ({emptyPositions.join(', ')}). Re-spin for free — this pool was supposed to be filtered, so this is unexpected.
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
      <div className={cn('font-bold font-mono text-base', color)}>{value}</div>
      <div className="text-[10px] text-broadcast-text-muted uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}
