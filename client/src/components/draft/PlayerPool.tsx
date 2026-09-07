'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Star, Trophy } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { Player, Position } from '../../types/game';
import { getPositionColor } from '../../utils/helpers';

interface PlayerPoolProps {
  pool: {
    players: Player[];
    franchise: string;
    decade: string;
  } | null;
  draftedPlayerIds: string[];
  onDraftPlayer: (player: Player) => void;
  currentPosition: Position | null;
}

const positionLabels: Record<Position, string> = {
  PG: 'Point Guard',
  SG: 'Shooting Guard',
  SF: 'Small Forward',
  PF: 'Power Forward',
  C: 'Center',
};

const positionIcons: Record<Position, string> = {
  PG: '🎯',
  SG: '🏀',
  SF: '⚡',
  PF: '💪',
  C: '🛡️',
};

export function PlayerPool({ pool, draftedPlayerIds, onDraftPlayer, currentPosition }: PlayerPoolProps) {
  if (!pool) return null;

  const availablePlayers = pool.players.filter((p: Player) => !draftedPlayerIds.includes(p.id));

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
          <h3 className="section-title font-display text-lg">AVAILABLE PLAYERS</h3>
          <div className="flex items-center gap-2 text-sm text-broadcast-text-secondary">
            <span className="px-2 py-1 bg-broadcast-accent/20 text-broadcast-accent rounded border border-broadcast-accent/30">
              {pool.players.length} TOTAL
            </span>
            <span className="px-2 py-1 bg-broadcast-gold/20 text-broadcast-gold rounded border border-broadcast-gold/30">
              {availablePlayers.length} AVAILABLE
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {availablePlayers.map((player: Player, index: number) => (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={cn(
                'player-card relative overflow-hidden group',
                currentPosition && player.position !== currentPosition && 'opacity-40 pointer-events-none'
              )}
              onClick={() => onDraftPlayer(player)}
            >
              <div
                className="absolute top-0 left-0 w-1 h-full"
                style={{ backgroundColor: getPositionColor(player.position) }}
              />
              <div className="flex items-start gap-3 p-3">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center font-display font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: getPositionColor(player.position) }}
                >
                  <span className="text-2xl">{positionIcons[player.position]}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-white truncate">{player.name}</h4>
                    <span
                      className={cn(
                        'px-2 py-0.5 text-xs font-medium rounded-full',
                        player.position === currentPosition
                          ? 'bg-broadcast-accent/20 text-broadcast-accent border border-broadcast-accent/30'
                          : 'bg-broadcast-border text-broadcast-text-muted'
                      )}
                    >
                      {positionLabels[player.position]}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-broadcast-text-secondary mb-2">
                    <span className="font-medium">{FRANCHISE_LABELS[player.team] || player.team}</span>
                    <span>•</span>
                    <span>{DECADE_LABELS[player.decade] || player.decade}</span>
                    <span>•</span>
                    <span className="text-broadcast-gold">{player.archetype}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1 text-broadcast-accent">
                      <Star className="w-3 h-3" />
                      <span className="font-bold">{player.overall}</span>
                      <span className="text-broadcast-text-muted">OVR</span>
                    </div>
                    <div className="flex items-center gap-1 text-broadcast-gold">
                      <Trophy className="w-3 h-3" />
                      <span className="font-medium">{player.stats.pts} PPG</span>
                    </div>
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-broadcast-text-muted group-hover:text-broadcast-accent transition-colors" />
              </div>

              <div className="grid grid-cols-5 gap-1 px-3 pb-3 border-t border-broadcast-border">
                <StatMini label="PTS" value={player.stats.pts} color="text-broadcast-accent" />
                <StatMini label="REB" value={player.stats.reb} color="text-broadcast-gold" />
                <StatMini label="AST" value={player.stats.ast} color="text-broadcast-blue" />
                <StatMini label="STL" value={player.stats.stl} color="text-broadcast-green" />
                <StatMini label="BLK" value={player.stats.blk} color="text-broadcast-purple" />
              </div>
            </motion.div>
          ))}
        </div>

        {availablePlayers.length === 0 && (
          <div className="text-center py-8 text-broadcast-text-muted">
            <p>All players from this pool have been drafted</p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={cn('font-bold font-mono text-sm', color)}>{value}</div>
      <div className="text-[10px] text-broadcast-text-muted uppercase">{label}</div>
    </div>
  );
}

const FRANCHISE_LABELS: Record<string, string> = {
  lakers: 'LAL', celtics: 'BOS', bulls: 'CHI', warriors: 'GSW',
  heat: 'MIA', spurs: 'SAS', nets: 'BKN', knicks: 'NYK',
  mavericks: 'DAL', suns: 'PHX', bucks: 'MIL', nuggets: 'DEN',
  clippers: 'LAC', sixers: 'PHI', raptors: 'TOR', pistons: 'DET',
  cavaliers: 'CLE', rockets: 'HOU', thunder: 'OKC', jazz: 'UTA',
  kings: 'SAC', hawks: 'ATL', wizards: 'WAS', pacers: 'IND',
  magic: 'ORL', hornets: 'CHA', grizzlies: 'MEM', pelicans: 'NOP',
  trailblazers: 'POR', timberwolves: 'MIN',
};

const DECADE_LABELS: Record<string, string> = {
  '1960s': '60s', '1970s': '70s', '1980s': '80s',
  '1990s': '90s', '2000s': '00s', '2010s': '10s', '2020s': '20s',
};