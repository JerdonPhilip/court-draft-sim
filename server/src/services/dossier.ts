import type { Player } from '../types/game.js';
import type { EraContext, PlayerAttributes } from '../types/player.js';
import { getEraContext } from './eraConfig.js';
import { normalizedStatsFor, estimateAttributes } from './playerTraits.js';
import { applyEraModifiersDetailed } from './eraEngine.js';
import { SERVER_VERSION } from '../version.js';

export interface PlayerDossier {
  report: 'single-player dossier';
  gameVersion: string;
  playerId: string;
  card: {
    id: string;
    name: string;
    position: string;
    overall: number;
    attributes: PlayerAttributes;
  };
  engineTraits: {
    attributes: PlayerAttributes;
    eraContext: EraContext;
    appliedEraModifiers: {
      notes: string;
      modifiedAttributes: Partial<Record<keyof PlayerAttributes, number>>;
    };
  };
}

/**
 * Single-player dossier (spec Part 10): resolved 2K attributes (explicit
 * overrides win, otherwise formula-estimated), the era context in force,
 * and the simulation-ready modified attributes with notes.
 */
export function buildPlayerDossier(player: Player, decadeOverride?: string): PlayerDossier {
  const decade = decadeOverride ?? player.decade ?? '2020s';
  const era = getEraContext(decade);
  const normalized = normalizedStatsFor(player);
  const attributes = estimateAttributes(player, normalized, era);
  const { changed, notes, modified } = applyEraModifiersDetailed(attributes, era, player.position);

  void modified;
  // Dossier shows base resolved attributes under both card + engineTraits
  // (mirrored), with the era-modified subset broken out separately. The sim
  // itself uses the full modified block via applyEraModifiers.
  return {
    report: 'single-player dossier',
    gameVersion: SERVER_VERSION,
    playerId: player.id,
    card: {
      id: player.id,
      name: player.name,
      position: player.position,
      overall: player.overall,
      attributes,
    },
    engineTraits: {
      attributes,
      eraContext: era,
      appliedEraModifiers: {
        notes,
        modifiedAttributes: changed,
      },
    },
  };
}
