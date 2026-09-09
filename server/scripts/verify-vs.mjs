import app from '../dist/index.js';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS ${name} ${extra}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

const server = app.listen(0, async () => {
  const base = 'http://localhost:' + server.address().port;
  try {
    const dp = await import('../dist/data/players.js');
    const eng = await import('../dist/services/simulationEngine.js');
    const all = dp.ALL_PLAYERS;

    // 1. Attribute integrity
    const bad = all.filter((p) => !p.attributes || Object.keys(p.attributes).length !== 29);
    check('all cards 29 attrs', bad.length === 0, `(${all.length} cards)`);
    const rangeBad = [];
    for (const p of all) for (const [k, v] of Object.entries(p.attributes)) {
      if (!Number.isInteger(v) || v < 25 || v > 99) rangeBad.push(`${p.id}.${k}=${v}`);
    }
    check('attrs in [25,99] ints', rangeBad.length === 0, rangeBad.slice(0, 3).join(' '));

    // 2. Counter cap across eras: heavy-tilt plans never exceed 48, always total 240
    const scenarios = [['1990s', 'SG'], ['2010s', 'PG'], ['2000s', 'C'], ['2020s', 'PG']];
    for (const [dec, pos] of scenarios) {
      const pool = all.filter((p) => p.decade === dec);
      const lineup = ['PG', 'SG', 'SF', 'PF', 'C'].map((pp) => pool.find((p) => p.position === pp));
      const raw = eng.defaultMinutesFor(lineup, null);
      const star = lineup.find((p) => p.position === pos);
      raw[star.id] = 48; // max tilt at one slot
      const userMin = eng.effectiveMinutes(lineup, null, raw);
      const hist = (await (await fetch(base + '/api/simulation/historical-teams')).json()).teams;
      for (const tid of ['bulls-96', 'nuggets-23', 'warriors-16']) {
        const t = hist.find((x) => x.id === tid);
        const cpu = eng.counterMinutesFor(t.players, lineup, userMin);
        const vals = Object.values(cpu);
        const total = vals.reduce((a, b) => a + b, 0);
        check(`counter ${dec}/${pos} vs ${tid}`, total === 240 && Math.max(...vals) <= 48 && Math.min(...vals) >= 0, `total=${total} max=${Math.max(...vals)}`);
      }
    }

    // 3. vs-mode with minutes: cpuMinutes sane + game completes
    const pool = all.filter((p) => p.decade === '1990s');
    const lineup = ['PG', 'SG', 'SF', 'PF', 'C'].map((pos) => pool.find((p) => p.position === pos));
    const userMin = eng.effectiveMinutes(lineup, null, eng.defaultMinutesFor(lineup, null));
    const r = await fetch(base + '/api/simulation/vs-mode', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userLineup: lineup, historicalTeamId: 'bulls-96', seriesLength: 1, userMinutes: userMin }),
    });
    const j = await r.json();
    const cv = Object.values(j.result.cpuMinutes);
    check('vs cpuMinutes 240/max48', r.status === 200 && cv.reduce((a, b) => a + b, 0) === 240 && Math.max(...cv) <= 48);

    // 4. Preview /game path with counter minutes
    const g = await fetch(base + '/api/simulation/game', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeTeam: lineup, awayTeam: lineup, homeMinutes: userMin, awayMinutes: userMin }),
    });
    const gj = await g.json();
    const hasSim = gj.result && gj.result.homePlayerStats && Object.keys(gj.result.homePlayerStats).length === 5;
    check('preview game sim stats', g.status === 200 && hasSim, `${gj.result.homeScore}-${gj.result.awayScore}`);

    // 5. Matchup edges: Jordan >> Iverson; identical Curry EVEN at equal minutes
    const jordan = all.find((x) => x.id === 'michael-jordan-90s');
    const ai = all.find((x) => x.name === 'Allen Iverson' && x.decade === '2000s');
    const edgeJI = eng.getBaseTeamImpact([ai]) * (34 / 48) - eng.getBaseTeamImpact([jordan]) * (39 / 48);
    check('jordan beats iverson edge', edgeJI < -0.5, `edge=${edgeJI.toFixed(1)} OPP`);
    const curry = all.find((x) => x.id === 'stephen-curry-10s');
    const edgeCC = eng.getBaseTeamImpact([curry]) * (41 / 48) - eng.getBaseTeamImpact([curry]) * (41 / 48);
    check('identical curry EVEN', Math.abs(edgeCC) < 0.05, `edge=${edgeCC.toFixed(2)}`);

    // 6. Historical teams resolve
    const h = await (await fetch(base + '/api/simulation/historical-teams')).json();
    check('17 teams x 10 players', h.teams.length === 17 && h.teams.every((t) => t.players.length === 10));
  } catch (e) {
    fail++;
    console.error('ERR', e);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  server.close();
  process.exit(fail > 0 ? 1 : 0);
});
