import { ALL_PLAYERS, getPlayerById } from '../dist/data/players.js';
import { buildPlayerDossier } from '../dist/services/dossier.js';

const EXPECTED_JORDAN = {
  closeShot: 95, drivingLayup: 98, drivingDunk: 97, standingDunk: 60, postControl: 94,
  midRangeShot: 98, threePointShot: 82, freeThrow: 85, passAccuracy: 86, ballHandle: 92,
  speedWithBall: 89, interiorDefense: 78, perimeterDefense: 98, steal: 96, block: 68,
  offensiveRebound: 55, defensiveRebound: 72, speed: 92, agility: 95, strength: 82,
  vertical: 98, stamina: 99, shotIq: 98, passPerception: 96, defensiveConsistency: 98,
  offensiveConsistency: 98, helpDefenseIq: 92, intangibles: 99, potential: 99,
};

console.log('total', ALL_PLAYERS.length);
const withAttrs = ALL_PLAYERS.filter((p) => p.attributes && Object.keys(p.attributes).length === 29);
console.log('with 29 attrs:', withAttrs.length);
const byDec = {};
for (const p of ALL_PLAYERS) byDec[p.decade] = (byDec[p.decade] || 0) + 1;
console.log(byDec);

// Jordan exact
const j = getPlayerById('michael-jordan-90s');
const mism = Object.entries(EXPECTED_JORDAN).filter(([k, v]) => j.attributes[k] !== v);
console.log('jordan stored mismatches:', mism.length, mism.slice(0, 5));
const d = buildPlayerDossier(j);
const dmism = Object.entries(EXPECTED_JORDAN).filter(([k, v]) => d.card.attributes[k] !== v);
console.log('jordan dossier mismatches:', dmism.length);
console.log('jordan dossier three->mod:', d.card.attributes.threePointShot, '->', d.engineTraits.appliedEraModifiers.modifiedAttributes.threePointShot);

// one sample per decade
for (const dec of ['1960s','1970s','1980s','1990s','2000s','2010s','2020s']) {
  const p = ALL_PLAYERS.find((x) => x.decade === dec);
  const dd = buildPlayerDossier(p);
  const n = Object.keys(dd.card.attributes).length;
  console.log(dec, p.id, 'keys=' + n, 'close=' + dd.card.attributes.closeShot, 'mid=' + dd.card.attributes.midRangeShot);
}
