/**
 * 2K-style attribute system + era context (spec v1.4.0).
 *
 * - Any explicitly defined rating on `attributes` takes priority.
 * - Missing keys fall back to formula estimates in
 *   services/playerTraits.ts (`estimateAttributes`), derived from position,
 *   overall, pace-normalized stats and era context.
 * - All resolved attributes are integers clamped to [25, 99].
 */

export interface PlayerAttributes {
  // Finishing
  closeShot: number;
  drivingLayup: number;
  drivingDunk: number;
  standingDunk: number;
  postControl: number;
  // Shooting
  midRangeShot: number;
  threePointShot: number;
  freeThrow: number;
  // Playmaking
  passAccuracy: number;
  ballHandle: number;
  speedWithBall: number;
  // Defense / Rebounding
  interiorDefense: number;
  perimeterDefense: number;
  steal: number;
  block: number;
  offensiveRebound: number;
  defensiveRebound: number;
  // Physicals
  speed: number;
  agility: number;
  strength: number;
  vertical: number;
  stamina: number;
  // Mental
  shotIq: number;
  passPerception: number;
  defensiveConsistency: number;
  offensiveConsistency: number;
  helpDefenseIq: number;
  intangibles: number;
  potential: number;
}

export type AttributeKey = keyof PlayerAttributes;

export const ATTRIBUTE_KEYS: AttributeKey[] = [
  'closeShot',
  'drivingLayup',
  'drivingDunk',
  'standingDunk',
  'postControl',
  'midRangeShot',
  'threePointShot',
  'freeThrow',
  'passAccuracy',
  'ballHandle',
  'speedWithBall',
  'interiorDefense',
  'perimeterDefense',
  'steal',
  'block',
  'offensiveRebound',
  'defensiveRebound',
  'speed',
  'agility',
  'strength',
  'vertical',
  'stamina',
  'shotIq',
  'passPerception',
  'defensiveConsistency',
  'offensiveConsistency',
  'helpDefenseIq',
  'intangibles',
  'potential',
];

export interface EraContext {
  handChecking: boolean;
  zoneDefense: boolean;
  /** 0.0 = spread floor, 1.0 = clogged paint. */
  paintDensity: number;
  /** 0.0 = soft, 1.0 = bruising. */
  physicality: number;
  paceFactor: number;
  /** 0.0 = no threes, 1.0 = analytics era. */
  threePointEmphasis: number;
  illegalDefenseRules: boolean;
  /** Decade id these rules were derived from (e.g. "1990s"). Optional so
   * hand-built contexts stay valid; dossier output always sets it. */
  decade?: string;
}

/** Resolved per-player engine view: 2K attributes + era rules in force. */
export interface EngineTraits {
  attributes: PlayerAttributes;
  eraContext: EraContext;
  appliedEraModifiers?: {
    notes: string;
    /** Subset of attributes that changed (unclamped — may exceed 99). */
    modifiedAttributes: Partial<Record<AttributeKey, number>>;
  };
}

/**
 * Pace-normalized scoring/possession inputs for the attribute estimator.
 * Counting stats should already be pace-normalized (per-36 style); rate
 * stats are 0-1 except where noted.
 */
export interface NormalizedStats {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  /** Turnovers per game. */
  tov: number;
  /** True shooting 0-1. */
  tsPct: number;
  /** Free-throw percentage 0-1. */
  ftPct: number;
  /** 3PT attempt rate 0-1. */
  threePar: number;
  /** Defensive rating 0-100. */
  defRating: number;
  /** Clutch rating 0-100. */
  clutch: number;
  /** Usage rate 0-100. */
  usageRate: number;
  /** Minutes per game (for stamina). Falls back to an overall-derived estimate. */
  mpg?: number;
}
