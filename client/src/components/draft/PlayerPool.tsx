import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Star, Trophy } from 'lucide-react';
import { cn, getPositionColor, getPositionLabel } from '../../utils/helpers';
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
  /** Currently unfilled slots — a card is draftable if it fits ANY of these. */
  emptyPositions: Position[];
  lineupSlots: LineupSlot[];
}

function fittingEmptySlots(player: Player, slots: LineupSlot[]): Position[] {
  return slots
    .filter(s => !s.player)
    .map(s => s.position)
    .filter(pos => canPlayPosition(player, pos));
}

export function PlayerPool({ pool, draftedPlayerIds, onDraftPlayer, emptyPositions, lineupSlots }: PlayerPoolProps) {
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
            Open slots: <span className="font-bold text-broadcast-accent">{emptyPositions.join(', ')}</span>
            {' '}— anyone who fits a highlighted slot can be picked, any order. Flex players show all their spots.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" role="list">
          {availablePlayers.map((player: Player, index: number) => {
            const fits = fittingEmptySlots(player, lineupSlots);
            const isDraftable = fits.length > 0;
            const isFlex = (player.secondaryPositions?.length ?? 0) > 0;
            return (
              <motion.button
                key={player.id}
                type="button"
                role="listitem"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3) }}
                className={cn(
                  'player-card relative overflow-hidden group text-left w-full',
                  !isDraftable && 'opacity-40'
                )}
                onClick={() => onDraftPlayer(player)}
                disabled={!isDraftable}
                aria-disabled={!isDraftable}
                aria-label={
                  isDraftable
                    ? `Draft ${player.name}, plays ${getPlayerPositions(player).join('/')}, fits ${fits.join(', ')}`
                    : `${player.name}, plays ${getPlayerPositions(player).join('/')} — doesn't fit open slots ${emptyPositions.join(', ')}`
                }
                title={isDraftable ? `Draft ${player.name} → ${fits.join(' or ')}` : `No open slot for ${getPlayerPositions(player).join('/')}`}
              >
                <div
                  className="absolute top-0 left-0 w-1 h-full"
                  style={{ backgroundColor: getPositionColor(player.position) }}
                  aria-hidden="true"
                />
                <div className="flex items-start gap-4 p-5">
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center font-display font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: getPositionColor(player.position) }}
                    aria-hidden="true"
                  >
                    <span className="text-sm text-center leading-tight px-1 break-words">{getPlayerPositions(player).join('/')}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-white text-lg leading-snug break-words">{player.name}</h4>
                    <div className="flex items-center gap-1.5 mt-1.5 mb-2 flex-wrap">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-broadcast-accent/20 text-broadcast-accent border border-broadcast-accent/30 whitespace-nowrap">
                        {getPlayerPositions(player).join(' / ')}
                      </span>
                      {isFlex && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-broadcast-gold/20 text-broadcast-gold border border-broadcast-gold/30 whitespace-nowrap">
                          FLEX
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-x-2 gap-y-1 text-sm text-broadcast-text-secondary mb-1.5 flex-wrap">
                      <span className="font-medium whitespace-nowrap">{FRANCHISES.find(f => f.id === player.team)?.abbreviation ?? player.team}</span>
                      <span aria-hidden="true">•</span>
                      <span className="whitespace-nowrap">{DECADES.find(d => d.id === player.decade)?.label ?? player.decade}</span>
                      <span aria-hidden="true">•</span>
                      <span className="text-broadcast-gold break-words">{player.archetype}</span>
                    </div>

                    <div className="text-xs mb-2.5">
                      {isDraftable ? (
                        <span className="text-broadcast-accent font-medium">Fits: {fits.join(', ')}</span>
                      ) : (
                        <span className="text-broadcast-text-muted">Needs: {getPositionLabel(player.position)} — no open slot</span>
                      )}
                    </div>

                    <div className="flex items-center gap-5 text-xs">
                      <div className="flex items-center gap-1.5 text-broadcast-accent">
                        <Star className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="font-bold text-sm">{player.overall}</span>
                        <span className="text-broadcast-text-muted">OVR</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-broadcast-gold">
                        <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="font-medium text-sm">{player.stats.pts} PPG</span>
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 flex-shrink-0 mt-1 text-broadcast-text-muted group-hover:text-broadcast-accent transition-colors" aria-hidden="true" />
                </div>

                <div className="grid grid-cols-5 gap-2 px-5 pb-4 pt-3 border-t border-broadcast-border">
                  <StatMini label="PTS" value={player.stats.pts} color="text-broadcast-accent" />
                  <StatMini label="REB" value={player.stats.reb} color="text-broadcast-gold" />
                  <StatMini label="AST" value={player.stats.ast} color="text-broadcast-blue" />
                  <StatMini label="STL" value={player.stats.stl} color="text-broadcast-green" />
                  <StatMini label="BLK" value={player.stats.blk} color="text-broadcast-purple" />
                </div>
              </motion.button>
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
