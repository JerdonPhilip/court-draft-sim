import { ALL_PLAYERS } from '../dist/data/players.js';

const issues = [];
const stats = { total: ALL_PLAYERS.length, with29: 0, rangeBad: 0 };

// Known elite shooters who must have elite three (2K 95+ in prime)
const ELITE_SHOOTERS = {
  'stephen-curry-10s': 99, 'stephen-curry-20s': 99, 'stephen-curry-00s': 87,
  'klay-thompson-10s': 97, 'klay-thompson-20s': 96,
  'ray-allen-00s': 97, 'reggie-miller-90s': 97, 'damian-lillard-10s': 94,
};

for (const p of ALL_PLAYERS) {
  const a = p.attributes;
  if (!a || Object.keys(a).length !== 29) {
    issues.push(`${p.id}: missing/partial attributes (${a ? Object.keys(a).length : 0})`);
    continue;
  }
  stats.with29++;
  for (const [k, v] of Object.entries(a)) {
    if (!Number.isInteger(v) || v < 25 || v > 99) {
      stats.rangeBad++;
      issues.push(`${p.id}: ${k}=${v} out of [25,99]`);
    }
  }
  const isBig = p.position === 'C' || p.position === 'PF';
  const isGuard = p.position === 'PG' || p.position === 'SG';
  // Position inversions
  if (isBig && a.ballHandle > 80) issues.push(`${p.id} (${p.position} ovr${p.overall}): big with ballHandle ${a.ballHandle} > 80`);
  if (isGuard && a.standingDunk > 70) issues.push(`${p.id} (${p.position}): guard with standingDunk ${a.standingDunk} > 70`);
  if (!isBig && a.drivingDunk > 90 && a.vertical < 80) issues.push(`${p.id}: dunk ${a.drivingDunk} with vert ${a.vertical}`);
  // Non-dunkers with high dunk: small guards with elite dunk need elite vert
  if ((p.position === 'PG') && a.drivingDunk > 80 && a.vertical < 85) issues.push(`${p.id} (PG): drivingDunk ${a.drivingDunk} suspicious without vert ${a.vertical}`);
  // Era: pre-1980 three must be <=45
  if ((p.decade === '1960s' || p.decade === '1970s') && a.threePointShot > 45)
    issues.push(`${p.id} (${p.decade}): three ${a.threePointShot} > 45 cap`);
  // Overall consistency: 95+ overall should not have key attr < 70 (except specialist weaknesses)
  if (p.overall >= 95) {
    const keys = ['closeShot', 'midRangeShot', 'shotIq', 'offensiveConsistency', 'stamina'];
    for (const k of keys) if (a[k] < 65) issues.push(`${p.id} ovr${p.overall}: ${k}=${a[k]} < 65`);
  }
  if (p.overall <= 78 && a.potential < 70) issues.push(`${p.id} ovr${p.overall}: low potential ${a.potential} for young depth? (info)`);
  // Stocks consistency
  if (p.stats.stl >= 2.0 && a.steal < 75) issues.push(`${p.id}: ${p.stats.stl} stl but steal ${a.steal}`);
  if (p.stats.blk >= 2.0 && a.block < 75) issues.push(`${p.id}: ${p.stats.blk} blk but block ${a.block}`);
  if (p.stats.reb >= 12 && (a.offensiveRebound < 75 || a.defensiveRebound < 75)) issues.push(`${p.id}: ${p.stats.reb} reb but oreb ${a.offensiveRebound}/dreb ${a.defensiveRebound}`);
  if (p.stats.ast >= 8 && a.passAccuracy < 75) issues.push(`${p.id}: ${p.stats.ast} ast but passAcc ${a.passAccuracy}`);
  // Scoring consistency: 27+ ppg should have close+mid 75+
  if (p.stats.pts >= 27 && (a.closeShot < 70 || a.midRangeShot < 65)) issues.push(`${p.id}: ${p.stats.pts} ppg but close ${a.closeShot}/mid ${a.midRangeShot}`);
}

// Elite shooter check
for (const [id, minThree] of Object.entries(ELITE_SHOOTERS)) {
  const p = ALL_PLAYERS.find((x) => x.id === id);
  if (!p) { issues.push(`ELITE missing card ${id}`); continue; }
  if (p.attributes.threePointShot < minThree - 5)
    issues.push(`ELITE ${id}: three ${p.attributes.threePointShot} < expected ~${minThree}`);
}

// Stats plausibility
for (const p of ALL_PLAYERS) {
  const s = p.stats;
  if (s.pts < 0 || s.pts > 40) issues.push(`${p.id}: pts ${s.pts} implausible`);
  if (s.reb < 0 || s.reb > 28) issues.push(`${p.id}: reb ${s.reb} implausible`);
  if (s.ast < 0 || s.ast > 14) issues.push(`${p.id}: ast ${s.ast} implausible`);
  if (s.stl < 0 || s.stl > 4) issues.push(`${p.id}: stl ${s.stl} implausible`);
  if (s.blk < 0 || s.blk > 6) issues.push(`${p.id}: blk ${s.blk} implausible`);
  if (p.overall < 70 || p.overall > 99) issues.push(`${p.id}: overall ${p.overall} out of range`);
  if (p.heightIn < 68 || p.heightIn > 90) issues.push(`${p.id}: height ${p.heightIn}in suspicious`);
}

console.log(`Players: ${stats.total}, with29: ${stats.with29}, rangeBad: ${stats.rangeBad}`);
console.log(`Issues: ${issues.length}`);
// Group by pattern
const groups = {};
for (const i of issues) {
  const tag = i.includes('dunk') ? 'dunk' : i.includes('three') || i.includes('THREE') ? 'three' : i.includes('ELITE') ? 'elite' : i.includes('ballHandle') ? 'handle' : i.includes('standingDunk') ? 'standDunk' : 'other';
  (groups[tag] = groups[tag] || []).push(i);
}
for (const [k, v] of Object.entries(groups)) console.log(`\n== ${k} (${v.length}) ==\n` + v.slice(0, 30).join('\n') + (v.length > 30 ? `\n... +${v.length - 30} more` : ''));
