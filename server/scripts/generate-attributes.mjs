import { ALL_PLAYERS } from '../dist/data/players.js';
import { estimateAttributes, normalizedStatsFor } from '../dist/services/playerTraits.js';
import { getEraContext } from '../dist/services/eraConfig.js';
import { writeFileSync } from 'node:fs';

const JORDAN = {
  closeShot: 95, drivingLayup: 98, drivingDunk: 97, standingDunk: 60, postControl: 94,
  midRangeShot: 98, threePointShot: 82, freeThrow: 85, passAccuracy: 86, ballHandle: 92,
  speedWithBall: 89, interiorDefense: 78, perimeterDefense: 98, steal: 96, block: 68,
  offensiveRebound: 55, defensiveRebound: 72, speed: 92, agility: 95, strength: 82,
  vertical: 98, stamina: 99, shotIq: 98, passPerception: 96, defensiveConsistency: 98,
  offensiveConsistency: 98, helpDefenseIq: 92, intangibles: 99, potential: 99,
};

const KEYS = [
  'closeShot','drivingLayup','drivingDunk','standingDunk','postControl',
  'midRangeShot','threePointShot','freeThrow','passAccuracy','ballHandle',
  'speedWithBall','interiorDefense','perimeterDefense','steal','block',
  'offensiveRebound','defensiveRebound','speed','agility','strength',
  'vertical','stamina','shotIq','passPerception','defensiveConsistency',
  'offensiveConsistency','helpDefenseIq','intangibles','potential',
];

let out = "import type { PlayerAttributes } from '../types/player.js';\n\n";
out += "/** Explicit 2K blocks for all cards (60s-20s). Generated from estimateAttributes; Jordan 90s hand-tuned. */\n";
out += "export const PLAYER_ATTRIBUTES: Record<string, PlayerAttributes> = {\n";

for (const p of ALL_PLAYERS) {
  let attrs;
  if (p.id === 'michael-jordan-90s') {
    attrs = JORDAN;
  } else {
    const era = getEraContext(p.decade);
    attrs = estimateAttributes(p, normalizedStatsFor(p), era);
  }
  const vals = KEYS.map((k) => `${k}:${attrs[k]}`).join(',');
  out += `  '${p.id}':{${vals}},\n`;
}
out += "};\n";
writeFileSync('src/data/playerAttributes.ts', out);
console.log('wrote', ALL_PLAYERS.length, 'entries, bytes', out.length);
