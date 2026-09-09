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

const OVERRIDES = {
  'michael-jordan-90s': JORDAN,
  'stephen-curry-10s': {closeShot:88,drivingLayup:94,drivingDunk:62,standingDunk:25,postControl:48,midRangeShot:93,threePointShot:99,freeThrow:94,passAccuracy:90,ballHandle:96,speedWithBall:94,interiorDefense:55,perimeterDefense:80,steal:90,block:38,offensiveRebound:42,defensiveRebound:62,speed:92,agility:92,strength:45,vertical:80,stamina:97,shotIq:99,passPerception:92,defensiveConsistency:82,offensiveConsistency:99,helpDefenseIq:82,intangibles:99,potential:95},
  'stephen-curry-20s': {closeShot:90,drivingLayup:93,drivingDunk:60,standingDunk:25,postControl:52,midRangeShot:91,threePointShot:99,freeThrow:95,passAccuracy:89,ballHandle:95,speedWithBall:92,interiorDefense:58,perimeterDefense:80,steal:80,block:42,offensiveRebound:40,defensiveRebound:64,speed:88,agility:87,strength:48,vertical:78,stamina:93,shotIq:99,passPerception:90,defensiveConsistency:84,offensiveConsistency:97,helpDefenseIq:84,intangibles:99,potential:85},
  'stephen-curry-00s': {closeShot:80,drivingLayup:84,drivingDunk:55,standingDunk:25,postControl:35,midRangeShot:84,threePointShot:87,freeThrow:88,passAccuracy:82,ballHandle:84,speedWithBall:88,interiorDefense:45,perimeterDefense:68,steal:82,block:30,offensiveRebound:35,defensiveRebound:55,speed:88,agility:86,strength:32,vertical:75,stamina:88,shotIq:85,passPerception:78,defensiveConsistency:65,offensiveConsistency:82,helpDefenseIq:65,intangibles:80,potential:96},
  'james-harden-00s': {closeShot:72,drivingLayup:82,drivingDunk:70,standingDunk:40,postControl:45,midRangeShot:74,threePointShot:76,freeThrow:81,passAccuracy:62,ballHandle:78,speedWithBall:86,interiorDefense:55,perimeterDefense:62,steal:68,block:42,offensiveRebound:45,defensiveRebound:55,speed:82,agility:80,strength:58,vertical:78,stamina:80,shotIq:78,passPerception:70,defensiveConsistency:65,offensiveConsistency:78,helpDefenseIq:65,intangibles:75,potential:94},
  'demar-derozan-00s': {closeShot:74,drivingLayup:80,drivingDunk:82,standingDunk:45,postControl:40,midRangeShot:72,threePointShot:55,freeThrow:76,passAccuracy:55,ballHandle:68,speedWithBall:78,interiorDefense:55,perimeterDefense:62,steal:60,block:48,offensiveRebound:45,defensiveRebound:52,speed:86,agility:82,strength:48,vertical:88,stamina:80,shotIq:68,passPerception:60,defensiveConsistency:62,offensiveConsistency:72,helpDefenseIq:60,intangibles:70,potential:90},
  'demar-derozan-10s': {closeShot:88,drivingLayup:90,drivingDunk:88,standingDunk:50,postControl:72,midRangeShot:94,threePointShot:68,freeThrow:84,passAccuracy:72,ballHandle:84,speedWithBall:88,interiorDefense:62,perimeterDefense:78,steal:68,block:45,offensiveRebound:48,defensiveRebound:60,speed:86,agility:84,strength:62,vertical:86,stamina:92,shotIq:90,passPerception:78,defensiveConsistency:78,offensiveConsistency:92,helpDefenseIq:72,intangibles:90,potential:88},
  'luka-doncic-10s': {closeShot:82,drivingLayup:88,drivingDunk:70,standingDunk:40,postControl:68,midRangeShot:82,threePointShot:80,freeThrow:71,passAccuracy:88,ballHandle:90,speedWithBall:86,interiorDefense:60,perimeterDefense:68,steal:68,block:42,offensiveRebound:50,defensiveRebound:78,speed:80,agility:78,strength:68,vertical:72,stamina:86,shotIq:88,passPerception:90,defensiveConsistency:70,offensiveConsistency:88,helpDefenseIq:72,intangibles:88,potential:99},
  'jayson-tatum-10s': {closeShot:76,drivingLayup:80,drivingDunk:78,standingDunk:45,postControl:55,midRangeShot:78,threePointShot:80,freeThrow:82,passAccuracy:60,ballHandle:72,speedWithBall:80,interiorDefense:65,perimeterDefense:76,steal:68,block:62,offensiveRebound:45,defensiveRebound:62,speed:82,agility:82,strength:52,vertical:84,stamina:82,shotIq:80,passPerception:65,defensiveConsistency:74,offensiveConsistency:78,helpDefenseIq:72,intangibles:78,potential:97},
  'shai-gilgeous-alexander-10s': {closeShot:74,drivingLayup:82,drivingDunk:72,standingDunk:40,postControl:45,midRangeShot:76,threePointShot:72,freeThrow:80,passAccuracy:68,ballHandle:78,speedWithBall:84,interiorDefense:62,perimeterDefense:78,steal:74,block:58,offensiveRebound:42,defensiveRebound:52,speed:86,agility:86,strength:45,vertical:82,stamina:80,shotIq:78,passPerception:70,defensiveConsistency:72,offensiveConsistency:76,helpDefenseIq:72,intangibles:75,potential:97},
  'devin-booker-10s': {closeShot:74,drivingLayup:80,drivingDunk:72,standingDunk:40,postControl:45,midRangeShot:80,threePointShot:78,freeThrow:84,passAccuracy:62,ballHandle:76,speedWithBall:84,interiorDefense:52,perimeterDefense:65,steal:60,block:42,offensiveRebound:38,defensiveRebound:50,speed:82,agility:80,strength:45,vertical:80,stamina:80,shotIq:78,passPerception:65,defensiveConsistency:62,offensiveConsistency:78,helpDefenseIq:62,intangibles:75,potential:95},
  'donovan-mitchell-10s': {closeShot:78,drivingLayup:88,drivingDunk:88,standingDunk:45,postControl:45,midRangeShot:78,threePointShot:80,freeThrow:80,passAccuracy:68,ballHandle:82,speedWithBall:90,interiorDefense:58,perimeterDefense:74,steal:76,block:48,offensiveRebound:42,defensiveRebound:55,speed:90,agility:88,strength:52,vertical:92,stamina:86,shotIq:82,passPerception:72,defensiveConsistency:72,offensiveConsistency:84,helpDefenseIq:70,intangibles:82,potential:93},
  'trae-young-10s': {closeShot:76,drivingLayup:84,drivingDunk:50,standingDunk:25,postControl:38,midRangeShot:80,threePointShot:82,freeThrow:82,passAccuracy:88,ballHandle:88,speedWithBall:90,interiorDefense:45,perimeterDefense:60,steal:62,block:30,offensiveRebound:35,defensiveRebound:55,speed:88,agility:88,strength:35,vertical:75,stamina:86,shotIq:86,passPerception:90,defensiveConsistency:60,offensiveConsistency:86,helpDefenseIq:62,intangibles:84,potential:95},
  'chris-paul-20s': {closeShot:82,drivingLayup:84,drivingDunk:45,standingDunk:25,postControl:55,midRangeShot:90,threePointShot:84,freeThrow:90,passAccuracy:96,ballHandle:94,speedWithBall:86,interiorDefense:62,perimeterDefense:88,steal:88,block:35,offensiveRebound:35,defensiveRebound:60,speed:78,agility:78,strength:55,vertical:65,stamina:84,shotIq:96,passPerception:95,defensiveConsistency:88,offensiveConsistency:92,helpDefenseIq:88,intangibles:98,potential:70},
};

for (const p of ALL_PLAYERS) {
  let attrs;
  if (OVERRIDES[p.id]) {
    attrs = OVERRIDES[p.id];
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
