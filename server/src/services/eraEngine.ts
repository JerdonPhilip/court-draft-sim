import type { EraContext, PlayerAttributes } from '../types/player.js';
import type { Position } from '../types/game.js';

const isBig = (pos: string): boolean => pos === 'C' || pos === 'PF';
const isGuard = (pos: string): boolean => pos === 'PG' || pos === 'SG';
const isPerimeter = (pos: string): boolean => pos === 'PG' || pos === 'SG' || pos === 'SF';

export interface EraModifierResult {
  modified: PlayerAttributes;
  /** Only keys that actually changed (unclamped — may exceed 99). */
  changed: Partial<Record<keyof PlayerAttributes, number>>;
  notes: string;
}

/**
 * Era-authentic attribute modifiers (spec Part 5, RULES 1-6).
 *
 * Returns simulation-ready attributes. Values are intentionally NOT clamped
 * to 99 — temporary boosts (e.g. 103 perimeterDefense) are used in
 * calculations and only clamped for display.
 */
export function applyEraModifiers(
  attributes: PlayerAttributes,
  era: EraContext,
  position: string,
): PlayerAttributes {
  const out: PlayerAttributes = { ...attributes };
  const add = (key: keyof PlayerAttributes, delta: number): void => {
    out[key] = Math.round(out[key] + delta);
  };

  // Order matters: physicality strength shift lands before the
  // hand-checking strength gate, so a bruising-era big/wing keeps its
  // driving game (e.g. 1990s Jordan 82 -> 87 clears the 85 bar).
  if (era.physicality >= 0.8) {
    add('strength', 5);
    add('defensiveConsistency', 3);
  } else if (era.physicality <= 0.5) {
    add('strength', -3);
  }

  // RULE 1: hand-checking.
  if (era.handChecking) {
    if (isPerimeter(position)) {
      const s = out.strength;
      if (s < 70) {
        add('drivingLayup', -8);
        add('drivingDunk', -10);
        add('speedWithBall', -8);
      } else if (s <= 85) {
        add('drivingLayup', -3);
        add('drivingDunk', -4);
        add('speedWithBall', -3);
      }
    }
    if (isGuard(position)) {
      add('perimeterDefense', 5);
      add('steal', 3);
    }
  } else {
    if (isGuard(position)) {
      if (out.speed > 80) add('drivingLayup', 5);
      if (out.agility > 80) add('speedWithBall', 5);
      add('steal', -3);
    }
  }

  // RULE 2: zone.
  if (era.zoneDefense) {
    add('passAccuracy', 5);
    add('passPerception', 5);
    add('helpDefenseIq', 5);
    // Slashers lose airspace when the zone clogs driving lanes.
    if (out.drivingDunk >= 80) add('drivingDunk', -5);
    if (isBig(position)) add('postControl', -5);
  } else {
    const athletic = out.vertical >= 70 || out.speed >= 80;
    if ((position === 'PG' || position === 'SG' || position === 'SF') && athletic) {
      add('drivingDunk', 5);
    }
    if (isBig(position)) add('postControl', 8);
  }

  // RULE 3: illegal defense (isolation era).
  if (era.illegalDefenseRules) {
    add('ballHandle', 5);
    add('midRangeShot', 5);
    add('postControl', 5);
    add('perimeterDefense', 5);
    add('interiorDefense', 5);
    add('helpDefenseIq', -10);
    add('passAccuracy', -3);
  }

  // RULE 4: paint density / physicality leftovers.
  if (era.paintDensity >= 0.7) {
    add('interiorDefense', 8);
    add('block', 5);
    add('standingDunk', 5);
  } else if (era.paintDensity <= 0.4) {
    add('interiorDefense', -5);
    if (isBig(position)) add('speed', 5);
    add('offensiveRebound', -5);
  }

  // RULE 5: three-point emphasis (attribute slice; attempt/efficiency
  // multipliers live in the helpers below for the scoring engine).
  // Pre-line eras halve the rating itself (dossier shows 82 -> 41 for 90s
  // Jordan); modern boosts stay in the scoring multipliers so the attribute
  // block remains comparable across eras.
  if (era.threePointEmphasis <= 0.2) {
    out.threePointShot = Math.round(out.threePointShot * 0.5);
  }
  if (era.threePointEmphasis >= 0.5) {
    add('passAccuracy', 3);
  }
  if (era.threePointEmphasis >= 0.8) {
    add('speed', 3);
    add('agility', 3);
  }

  // RULE 6: pace.
  if (era.paceFactor >= 1.1) {
    add('speed', 5);
    add('agility', 3);
    add('stamina', -5);
  } else if (era.paceFactor <= 0.9) {
    add('speed', -3);
    add('stamina', 5);
  }

  return out;
}

/** Full result with the changed-subset + notes for dossier output. */
export function applyEraModifiersDetailed(
  attributes: PlayerAttributes,
  era: EraContext,
  position: string,
): EraModifierResult {
  const modified = applyEraModifiers(attributes, era, position);
  const changed: Partial<Record<keyof PlayerAttributes, number>> = {};
  (Object.keys(attributes) as Array<keyof PlayerAttributes>).forEach((k) => {
    if (modified[k] !== attributes[k]) changed[k] = modified[k];
  });
  return { modified, changed, notes: describeEraModifiers(era, attributes, position) };
}

function describeEraModifiers(era: EraContext, attrs: PlayerAttributes, position: string): string {
  const bits: string[] = [];
  if (era.handChecking) {
    // Gate on the physicality-boosted strength actually used for the driving
    // check, so the note matches the applied modifier.
    const boosted = attrs.strength + (era.physicality >= 0.8 ? 5 : era.physicality <= 0.5 ? -3 : 0);
    const gate = boosted < 70 ? 'frail ball-handlers punished on drives' : boosted <= 85 ? 'average-strength drivers taxed' : `Strength ${attrs.strength} means no penalty to driving`;
    bits.push(`Hand-checking active. ${gate}. Perimeter defense boosted +5.`);
    void position;
  } else {
    bits.push('No hand-checking. Quick guards freed on drives.');
  }
  if (era.zoneDefense) bits.push('Zone legal. Passing/help boosted, post and slashing taxed.');
  else bits.push('No zone (illegal defense). Isolation offense boosted.');
  if (era.illegalDefenseRules) bits.push('Isolation scoring boosted, help rotations nerfed.');
  if (era.paintDensity >= 0.7) bits.push('Clogged paint boosts interior D/blocks.');
  else if (era.paintDensity <= 0.4) bits.push('Spread floor boosts driving, taxes interior D.');
  if (era.physicality >= 0.8) bits.push('Bruising physicality boosts strength, taxes FT.');
  else if (era.physicality <= 0.5) bits.push('Soft whistles boost FT, cut strength.');
  if (era.threePointEmphasis <= 0.2) bits.push('Three-point shot heavily de-emphasized.');
  else if (era.threePointEmphasis >= 0.8) bits.push('Analytics spacing boosts threes/athleticism.');
  else if (era.threePointEmphasis >= 0.5) bits.push('Modern spacing boosts threes.');
  if (era.paceFactor >= 1.1) bits.push('Track-meet pace boosts speed, taxes stamina.');
  else if (era.paceFactor <= 0.9) bits.push('Grind pace preserves stamina.');
  return bits.join(' ');
}

// ---------------------------------------------------------------------------
// Scoring / possession multipliers (Parts 6-9). Pure functions of era so the
// sim stays deterministic and testable without threading attributes everywhere.
// ---------------------------------------------------------------------------

export function threePointEffectivenessMultiplier(era: EraContext): number {
  let m = 1;
  if (era.threePointEmphasis <= 0.2) m *= 0.5;
  else if (era.threePointEmphasis >= 0.8) m *= 1.3;
  else if (era.threePointEmphasis >= 0.5) m *= 1.2;
  m *= era.zoneDefense ? 1.1 : 0.9;
  return m;
}

export function midRangeEffectivenessMultiplier(era: EraContext): number {
  if (era.threePointEmphasis <= 0.2) return 1.15;
  if (era.threePointEmphasis >= 0.8) return 0.8;
  if (era.threePointEmphasis >= 0.5) return 0.9;
  return 1;
}

export function postEffectivenessMultiplier(era: EraContext): number {
  return era.threePointEmphasis <= 0.2 ? 1.1 : 1;
}

export function rimSuccessMultiplier(era: EraContext): number {
  if (era.paintDensity >= 0.7) return 0.9;
  if (era.paintDensity <= 0.4) return 1.1;
  return 1;
}

export function threeAttemptMultiplier(era: EraContext): number {
  if (era.threePointEmphasis <= 0.2) return 0.2;
  if (era.threePointEmphasis >= 0.8) return 2.0;
  if (era.threePointEmphasis >= 0.5) return 1.5;
  return 1;
}

export function ftPctMultiplier(era: EraContext): number {
  if (era.physicality >= 0.8) return 0.97;
  if (era.physicality <= 0.5) return 1.02;
  return 1;
}

export function foulPronenessMultiplier(era: EraContext): number {
  if (era.physicality >= 0.8) return 1.1;
  if (era.physicality <= 0.5) return 0.95;
  return 1;
}

export function stealChanceMultiplier(era: EraContext): number {
  return era.handChecking ? 1.1 : 1;
}

export function blockChanceMultiplier(era: EraContext): number {
  return era.paintDensity >= 0.7 ? 1.15 : 1;
}

export function perimeterDefenseMultiplier(era: EraContext): number {
  return era.handChecking ? 1.1 : 1;
}

/** Share of helpDefenseIq folded into defensive effectiveness. */
export function helpDefenseContribution(era: EraContext): number {
  return era.zoneDefense ? 0.15 : 0;
}

export function possessionsMultiplier(era: EraContext): number {
  if (era.paceFactor >= 1.1) return 1.15;
  if (era.paceFactor <= 0.9) return 0.85;
  return 1;
}

export function turnoverMultiplier(
  attrs: Pick<PlayerAttributes, 'ballHandle' | 'passAccuracy'>,
  era: EraContext,
): number {
  let m = 1;
  if (era.handChecking && attrs.ballHandle < 70) m *= 1.1;
  if (era.zoneDefense && attrs.passAccuracy < 70) m *= 1.1;
  return m;
}

/** Shot-type mix from modified attributes + era attempt emphasis. */
export function shotDistribution(
  attrs: PlayerAttributes,
  era: EraContext,
): { rim: number; mid: number; three: number; post: number } {
  const rimW = (attrs.drivingLayup + attrs.drivingDunk) / 2;
  const midW = attrs.midRangeShot * midRangeEffectivenessMultiplier(era);
  const threeW = attrs.threePointShot * threeAttemptMultiplier(era);
  const postW = attrs.postControl * (era.zoneDefense ? 0.9 : 1.1);
  const total = rimW + midW + threeW + postW || 1;
  return { rim: rimW / total, mid: midW / total, three: threeW / total, post: postW / total };
}

/** Fatigue accumulation rate: fast + bruising eras wear players down. */
export function fatigueRateMultiplier(era: EraContext): number {
  let m = 1;
  if (era.paceFactor >= 1.1) m *= 1.25;
  else if (era.paceFactor <= 0.9) m *= 0.85;
  if (era.physicality >= 0.8) m *= 1.2;
  else if (era.physicality <= 0.5) m *= 0.9;
  return m;
}

/** Up-to-15% effectiveness cut for gassed low-stamina players. */
export function fatigueAttributePenalty(stamina: number, fatigue01: number): number {
  const lowStamina = stamina < 60 ? 1.25 : 1;
  return 1 - Math.min(0.15, fatigue01 * 0.15 * lowStamina);
}

export type { Position };
