import type { EraContext } from '../types/player.js';

const ERA_TABLE: Record<string, Omit<EraContext, 'decade'>> = {
  '1960s': {
    handChecking: true,
    zoneDefense: false,
    paintDensity: 0.9,
    physicality: 0.8,
    paceFactor: 1.15,
    threePointEmphasis: 0.0,
    illegalDefenseRules: true,
  },
  '1970s': {
    handChecking: true,
    zoneDefense: false,
    paintDensity: 0.8,
    physicality: 0.85,
    paceFactor: 1.05,
    threePointEmphasis: 0.0,
    illegalDefenseRules: true,
  },
  '1980s': {
    handChecking: true,
    zoneDefense: false,
    paintDensity: 0.7,
    physicality: 0.9,
    paceFactor: 1.1,
    threePointEmphasis: 0.1,
    illegalDefenseRules: true,
  },
  '1990s': {
    handChecking: true,
    zoneDefense: false,
    paintDensity: 0.8,
    physicality: 0.95,
    paceFactor: 0.95,
    threePointEmphasis: 0.2,
    illegalDefenseRules: true,
  },
  '2000s': {
    handChecking: false,
    zoneDefense: true,
    paintDensity: 0.7,
    physicality: 0.75,
    paceFactor: 0.9,
    threePointEmphasis: 0.4,
    illegalDefenseRules: false,
  },
  '2010s': {
    handChecking: false,
    zoneDefense: true,
    paintDensity: 0.4,
    physicality: 0.4,
    paceFactor: 1.05,
    threePointEmphasis: 0.85,
    illegalDefenseRules: false,
  },
  '2020s': {
    handChecking: false,
    zoneDefense: true,
    paintDensity: 0.3,
    physicality: 0.5,
    paceFactor: 0.98,
    threePointEmphasis: 0.95,
    illegalDefenseRules: false,
  },
};

const FALLBACK_DECADE = '2020s';

/**
 * Era-authentic rule context for a decade id.
 * Unknown decades fall back to the 2020s (modern) rules.
 */
export function getEraContext(decade: string): EraContext {
  const entry = ERA_TABLE[decade] ?? ERA_TABLE[FALLBACK_DECADE]!;
  return { ...entry, decade };
}

export const ERA_DECADES = Object.keys(ERA_TABLE);
