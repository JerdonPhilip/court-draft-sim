import { ALL_PLAYERS } from '../dist/data/players.js';
import { writeFileSync } from 'node:fs';

const KEYS = [
  'closeShot','drivingLayup','drivingDunk','standingDunk','postControl',
  'midRangeShot','threePointShot','freeThrow','passAccuracy','ballHandle',
  'speedWithBall','interiorDefense','perimeterDefense','steal','block',
  'offensiveRebound','defensiveRebound','speed','agility','strength',
  'vertical','stamina','shotIq','passPerception','defensiveConsistency',
  'offensiveConsistency','helpDefenseIq','intangibles','potential',
];

let out = "import type { PlayerAttributes } from '../types/player.js';\n\n";
out += "/** Exact 2K blocks for all cards — single source of truth for the player builder. */\n";
out += "export const PLAYER_ATTRIBUTES: Record<string, PlayerAttributes> = {\n";
for (const p of ALL_PLAYERS) {
  const a = p.attributes;
  if (!a || Object.keys(a).length !== 29) throw new Error(`Bad attrs for ${p.id}`);
  out += `  '${p.id}':{${KEYS.map((k) => `${k}:${a[k]}`).join(',')}},\n`;
}
out += "};\n";
writeFileSync('src/data/playerAttributes.ts', out);
console.log('baked', ALL_PLAYERS.length, 'exact entries, bytes', out.length);
