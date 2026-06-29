// Battle SIMULATION harness. Runs the REAL combat engine (../combat.js) and the REAL status
// engine (../status.js) over many trials with live RNG, and reports how each implemented attack
// type actually behaves. The only thing mirrored (not imported) is the server's tiny turn-sequencing
// glue, copied faithfully from server.js:
//   • attack:  resolveExchange -> set hp/alive -> Injuring (server.js:451) -> ON_HIT_STATUS (server.js:460-463)
//   • endTurn: decrementStatuses -> clearTurnEndStatuses -> flip turn -> tickDots  (server.js:519-...)
// Run:  node test/simulate.js
const combat = require("../combat");
const status = require("../status");

const N = 100;
const TILE = { t: "normal", hg: false };
const round = Math.round;

// ── unit + battle scaffold (tank statline: health 38, everything else at the 4 floor) ──
function mkUnit(id, owner, base_weapon, abilities, over = {}) {
  const melee = ["sword", "axe", "dagger", "lance", "bow", "gauntlets"].includes(base_weapon);
  const base = { health: 38, strength: 4, defense: 4, magick: 4, resistance: 4, speed: 4, skill: 4, knowledge: 4, luck: 4 };
  const u = { id, ownerId: owner, name: `U${id}`, type: melee ? "melee" : "mage", size: 3,
    base_weapon, abilities, specials: [], alive: true, statuses: [], ...base };
  Object.assign(u, over);
  u.maxHealth = over.maxHealth != null ? over.maxHealth : u.health;
  return u;
}
function mkBattle(units, turnOwner = 1) {
  const b = { units: {}, positions: {}, turnUserId: turnOwner };
  units.forEach((u, i) => { b.units[u.id] = u; b.positions[u.id] = { r: 0, c: i }; });
  return b;
}
// Mirror of server.js attack handler (the parts that change state).
function doAttack(b, atkId, defId, abilityName) {
  const attacker = b.units[atkId], defender = b.units[defId];
  const ability = combat.findAbility(attacker, abilityName);
  const defenderCanCounter = !status.hasStatus(defender, "injured"); // (range assumed in-reach for the sim)
  const result = combat.resolveExchange(attacker, defender, abilityName, defenderCanCounter, TILE, TILE);
  if (ability && ability.type === "Injuring" && result.attackerHit) status.addStatus(defender, "injured", { clearOn: "turnEnd" });
  attacker.health = result.attackerHp; defender.health = result.defenderHp;
  if (attacker.health <= 0) { attacker.alive = false; delete b.positions[atkId]; }
  if (defender.health <= 0) { defender.alive = false; delete b.positions[defId]; }
  if (ability && result.attackerHit && defender.alive) {
    const eff = status.ON_HIT_STATUS[ability.type];
    if (eff) status.addStatus(defender, eff.status, { turnsLeft: eff.turns, dot: !!eff.dot });
  }
  return result;
}
// Mirror of server.js endTurn handler. Returns the DoT ticks that fired at the new turn's start.
function endTurn(b) {
  status.decrementStatuses(b);
  status.clearTurnEndStatuses(b);
  b.turnUserId = b.turnUserId === 1 ? 2 : 1;
  return status.tickDots(b);
}

// ── reporting helpers ──
const steps = (r) => r.events.map((e) => e.step).join(",");
const bySeq = (rs) => { const m = {}; for (const r of rs) { const k = steps(r) || "(none)"; m[k] = (m[k] || 0) + 1; } return m; };
const outcomeTally = (rs, who) => {
  const t = { hit: 0, crit: 0, miss: 0, block: 0 };
  for (const r of rs) for (const e of r.events) if (e.by === who) t[e.type]++;
  return t;
};
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) : "0.0") + "%";
const hr = (s) => console.log("\n" + "═".repeat(78) + "\n" + s + "\n" + "─".repeat(78));
const showSeqs = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${String(v).padStart(3)}×  ${k}`));

let PASS = 0, FAIL = 0;
const check = (cond, label) => { console.log(`    [${cond ? "PASS" : "FAIL"}] ${label}`); cond ? PASS++ : FAIL++; };

console.log(`\nColorsV3 — attack-type simulations (${N} trials each, live RNG, real combat+status engine)`);

// ───────────────────────── WITHIN-EXCHANGE TYPES ─────────────────────────

// DAMAGE
hr("DAMAGE — standard A1/D1/A2/D2 exchange (sword Sword Dance vs sword)");
{
  const rs = [];
  for (let i = 0; i < N; i++) {
    const b = mkBattle([mkUnit(1, 1, "sword", ["Sword Dance", "Evasion"]), mkUnit(2, 2, "sword", ["Sword Dance", "Evasion"])]);
    rs.push(doAttack(b, 1, 2, "Sword Dance"));
  }
  console.log("  event-sequence distribution:"); showSeqs(bySeq(rs));
  const okOrder = rs.every((r) => { const s = r.events.map((e) => e.step); const order = ["A1", "D1", "A2", "D2"]; let j = 0; return s.every((x) => { while (j < order.length && order[j] !== x) j++; return j++ < order.length; }); });
  const at = outcomeTally(rs, "attacker"), dt = outcomeTally(rs, "defender");
  console.log(`  attacker strikes: hit ${at.hit} / crit ${at.crit} / miss ${at.miss} / block ${at.block}`);
  console.log(`  defender strikes: hit ${dt.hit} / crit ${dt.crit} / miss ${dt.miss} / block ${dt.block}`);
  check(okOrder, "every trial follows A1→D1→A2→D2 ordering (subset allowed)");
  check(rs.every((r) => r.events.length <= 4), "never more than 4 strikes per exchange");
}

// MAIMING
hr("MAIMING — a landed attacker strike cancels its matching counter (axe Dismember vs sword)");
{
  const rs = [];
  for (let i = 0; i < N; i++) {
    const b = mkBattle([mkUnit(1, 1, "axe", ["Dismember", "Tomahawk"]), mkUnit(2, 2, "sword", ["Sword Dance", "Evasion"])]);
    rs.push(doAttack(b, 1, 2, "Dismember"));
  }
  console.log("  event-sequence distribution:"); showSeqs(bySeq(rs));
  let cancels = 0, viol = 0;
  for (const r of rs) {
    const ev = r.events; const a1 = ev.find((e) => e.step === "A1"); const d1 = ev.find((e) => e.step === "D1");
    const a2 = ev.find((e) => e.step === "A2"); const d2 = ev.find((e) => e.step === "D2");
    const a1Land = a1 && (a1.type === "hit" || a1.type === "crit");
    const a2Land = a2 && (a2.type === "hit" || a2.type === "crit");
    if (a1Land && d1) viol++;            // a landed A1 must mean NO D1
    if (a2Land && d2) viol++;            // a landed A2 must mean NO D2
    if (a1Land && !d1) cancels++;
    if (a2Land && !d2) cancels++;
  }
  console.log(`  counters cancelled by a landed strike: ${cancels}`);
  check(viol === 0, "no counter ever follows a landed maiming strike");
}

// OBSCURING (statistical — compare defender counter land-rate vs a Damage baseline)
hr("OBSCURING — once the attacker lands, the defender's counters get accuracy ×0.5 (sword Foul Play)");
{
  function counterLandRate(ability) {
    let counters = 0, landed = 0;
    for (let i = 0; i < N * 5; i++) {
      const A = mkUnit(1, 1, "sword", ["Foul Play", "Sword Dance"], { skill: 10 });
      const D = mkUnit(2, 2, "sword", ["Sword Dance", "Evasion"]);
      const b = mkBattle([A, D]);
      const r = doAttack(b, 1, 2, ability);
      for (const e of r.events) if (e.by === "defender") { counters++; if (e.type === "hit" || e.type === "crit") landed++; }
    }
    return { counters, landed, rate: landed / counters };
  }
  const base = counterLandRate("Sword Dance");
  const obsc = counterLandRate("Foul Play");
  console.log(`  baseline (Damage):   counters ${base.counters}, landed ${base.landed} (${pct(base.landed, base.counters)})`);
  console.log(`  obscuring (Foul Play): counters ${obsc.counters}, landed ${obsc.landed} (${pct(obsc.landed, obsc.counters)})`);
  check(obsc.rate < base.rate, "obscuring lowers the defender's counter land-rate");
}

// PIERCING (compare damage vs a high-protection target)
hr("PIERCING — ignores the target's protection (axe Armor Cleaver vs a defense-12 lance, vs basic axe)");
{
  function dmgFirstLanded(ability) {
    const vals = [];
    for (let i = 0; i < N; i++) {
      const A = mkUnit(1, 1, "axe", ["Armor Cleaver", "Tomahawk"], { strength: 6 });
      const D = mkUnit(2, 2, "lance", ["Javelin", "Guard"], { defense: 12, health: 9999, maxHealth: 9999 });
      const b = mkBattle([A, D]);
      const r = doAttack(b, 1, 2, ability);
      const a1 = r.events.find((e) => e.step === "A1");
      if (a1 && (a1.type === "hit" || a1.type === "crit")) vals.push(a1.damage);
    }
    return vals;
  }
  const pierce = dmgFirstLanded("Armor Cleaver");
  const basic = dmgFirstLanded(null);
  const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const rng = (a) => a.length ? `min ${Math.min(...a)} max ${Math.max(...a)}` : "never penetrated";
  console.log(`  Armor Cleaver (Piercing): landed ${pierce.length}, mean damage ${mean(pierce).toFixed(2)}  [${rng(pierce)}]`);
  console.log(`  Basic axe (Damage):       landed ${basic.length}, mean damage ${mean(basic).toFixed(2)}  [${rng(basic)}]  ← protection 20 ≥ power 15, so basic can't hurt it`);
  check(pierce.length > 0 && mean(pierce) > mean(basic), "piercing penetrates (full power) where the basic attack does 0 vs the tanky target");
}

// BRAVE
hr("BRAVE — both attacker strikes land before the defender counters (dagger Blitz vs sword)");
{
  const rs = [];
  for (let i = 0; i < N; i++) {
    const b = mkBattle([mkUnit(1, 1, "dagger", ["Blitz", "Throwing Knives"]), mkUnit(2, 2, "sword", ["Sword Dance", "Evasion"])]);
    rs.push(doAttack(b, 1, 2, "Blitz"));
  }
  console.log("  event-sequence distribution:"); showSeqs(bySeq(rs));
  const orderOk = rs.every((r) => {
    const idxLastAtk = Math.max(...r.events.map((e, i) => (e.by === "attacker" ? i : -1)));
    const idxFirstDef = Math.min(...r.events.map((e, i) => (e.by === "defender" ? i : 999)));
    return idxFirstDef === 999 || idxFirstDef > idxLastAtk;
  });
  check(orderOk, "every defender counter comes AFTER both attacker strikes");
}

// ABSORPTION
hr("ABSORPTION — attacker heals 50% (floored) of damage dealt, capped at max HP (grass Leech Life)");
{
  // Isolate the heal: disable the defender's counter so counter-damage can't mask the leech.
  let healViol = 0, totalHeal = 0, capped = 0;
  for (let i = 0; i < N; i++) {
    const A = mkUnit(1, 1, "grass", ["Leech Life"], { type: "mage", magick: 8, health: 20, maxHealth: 38 });
    const D = mkUnit(2, 2, "sword", ["Sword Dance"], { health: 9999, maxHealth: 9999 });
    const r = combat.resolveExchange(A, D, "Leech Life", false, TILE, TILE); // no counter
    const dealtHalved = r.events.filter((e) => e.by === "attacker").reduce((s, e) => s + Math.floor(e.damage * 0.5), 0);
    const expected = Math.min(38, 20 + dealtHalved);
    if (r.attackerHp !== expected) healViol++;
    if (20 + dealtHalved > 38) capped++;
    totalHeal += r.attackerHp - 20;
  }
  // And a capped case: a full-HP leecher never overheals past max.
  const full = mkUnit(1, 1, "grass", ["Leech Life"], { type: "mage", magick: 8, health: 38, maxHealth: 38 });
  const rFull = combat.resolveExchange(full, mkUnit(2, 2, "sword", ["Sword Dance"], { health: 9999, maxHealth: 9999 }), "Leech Life", false, TILE, TILE);
  console.log(`  mean heal per attack: ${(totalHeal / N).toFixed(2)} HP (started 20/38, counter isolated); ${capped} trials hit the max-HP cap`);
  console.log(`  full-HP (38/38) leecher after a damaging attack: ${rFull.attackerHp}/38 (no overheal)`);
  check(healViol === 0, "healed HP == floor(50% of damage dealt), capped at max, in every trial");
  check(rFull.attackerHp === 38, "absorption never heals past max HP");
}

// ───────────────────────── DAMAGE-OVER-TIME TYPES ─────────────────────────
const DOTS = [
  { name: "BURNING", weapon: "fire", ability: "Scorch", status: "burned" },
  { name: "POISONING", weapon: "bow", ability: "Poison Arrow", status: "poisoned" },
  { name: "FREEZING", weapon: "water", ability: "Ice Spear", status: "frozen" },
  { name: "CRUSHING", weapon: "earth", ability: "Crush", status: "crushed" },
  { name: "SHOCKING", weapon: "lightning", ability: "Thunder", status: "shocked" },
];
for (const d of DOTS) {
  hr(`${d.name} — applies "${d.status}" (−12.5% current HP/turn, 2 turns) [${d.weapon} ${d.ability}]`);
  // Application: status applies iff the hit dealt damage AND left the defender alive.
  const isMage = ["fire", "water", "earth", "lightning"].includes(d.weapon);
  let appliedSurv = 0, dmgSurvived = 0, killed = 0, appliedOnWhiff = 0;
  for (let i = 0; i < N; i++) {
    const A = mkUnit(1, 1, d.weapon, [d.ability], { type: isMage ? "mage" : "melee", magick: 8, strength: 8 });
    const D = mkUnit(2, 2, "sword", ["Sword Dance", "Evasion"]);
    const b = mkBattle([A, D]);
    const r = doAttack(b, 1, 2, d.ability);
    const dealtDmg = r.events.some((e) => e.by === "attacker" && e.damage > 0);
    const has = status.hasStatus(D, d.status);
    if (dealtDmg && !D.alive) killed++;
    else if (dealtDmg) { dmgSurvived++; if (has) appliedSurv++; }
    else if (has) appliedOnWhiff++;
  }
  console.log(`  of ${N} attacks: ${dmgSurvived} damaged a surviving defender, ${killed} were lethal (no status to a corpse), rest missed/0-dmg`);
  console.log(`  "${d.status}" applied on ${appliedSurv}/${dmgSurvived} surviving-damaged hits, ${appliedOnWhiff} on misses`);
  check(appliedSurv === dmgSurvived, "status applied on EVERY damaging hit that left the defender alive");
  check(appliedOnWhiff === 0, "status NEVER applied on a miss / 0-damage hit");

  // Duration + amount: canonical lifecycle from a known starting HP.
  const D = mkUnit(2, 2, "sword", ["Sword Dance"], { health: 40, maxHealth: 40 });
  status.addStatus(D, d.status, { turnsLeft: 2, dot: true });
  const b = { units: { 2: D }, positions: { 2: { r: 0, c: 0 } }, turnUserId: 1 }; // victim is owner 2, attacker's turn
  const trace = [];
  let hp = D.health;
  for (let turn = 1; turn <= 3; turn++) {            // step through 3 of the victim's turns
    const ticks = endTurn(b);                         // flip 1->2: victim turn-start tick
    const t = ticks.find((x) => x.unitId === 2);
    trace.push({ turn, before: hp, dmg: t ? t.damage : 0, after: D.health, has: status.hasStatus(D, d.status) });
    hp = D.health;
    endTurn(b);                                       // flip 2->1: victim ends its turn (status counts down)
  }
  console.log("  victim lifecycle (start 40 HP):");
  trace.forEach((t) => console.log(`    victim turn ${t.turn}: ${t.before} → ${t.after}  (tick ${t.dmg}, expected ${t.dmg ? Math.max(1, round(t.before * 0.125)) : 0})  still afflicted after: ${t.has}`));
  const tickedTurns = trace.filter((t) => t.dmg > 0).length;
  check(tickedTurns === 2, "ticks on exactly 2 of the victim's turns");
  check(trace[0].dmg === Math.max(1, round(40 * 0.125)) && trace[1].dmg === Math.max(1, round(trace[1].before * 0.125)), "each tick = max(1, 12.5% of CURRENT HP)");
  check(trace[2].dmg === 0 && !trace[2].has, "expired by the 3rd turn");
}

// DoT stacking + lethality
hr("DoT STACKING + LETHALITY");
{
  const D = mkUnit(2, 2, "sword", ["Sword Dance"], { health: 100, maxHealth: 100 });
  status.addStatus(D, "poisoned", { turnsLeft: 2, dot: true });
  status.addStatus(D, "burned", { turnsLeft: 2, dot: true });
  const b = { units: { 2: D }, positions: { 2: { r: 0, c: 0 } }, turnUserId: 1 };
  const ticks = endTurn(b);
  console.log(`  100 HP with poison+burn → first turn ticks: ${ticks.map((t) => t.type + " " + t.damage).join(", ")} → HP ${D.health}`);
  check(ticks.length === 2, "two distinct DoTs both tick in one turn (they stack)");

  const dying = mkUnit(3, 2, "sword", ["Sword Dance"], { health: 2, maxHealth: 2 });
  status.addStatus(dying, "poisoned", { turnsLeft: 2, dot: true });
  const b2 = { units: { 3: dying }, positions: { 3: { r: 0, c: 0 } }, turnUserId: 1 };
  endTurn(b2); const hp1 = dying.health; endTurn(b2); endTurn(b2);
  console.log(`  2 HP poisoned → tick1 leaves ${hp1} → tick2 leaves ${dying.health}, alive=${dying.alive}, on board=${!!b2.positions[3]}`);
  check(dying.health === 0 && !dying.alive && !b2.positions[3], "DoT can kill (min-1 tick) and removes the unit from the board");
}

// ───────────────────────── CONTROL TYPES ─────────────────────────

// SLOWING (incl. the bug we fixed: a slowed attacker must NOT rob the defender of its 2nd counter)
hr("SLOWING — afflicted unit loses ONLY its own 2nd strike; lasts 1 turn (dagger Stagnate)");
{
  // Apply via attack, then verify lifecycle.
  const victim = mkUnit(2, 2, "sword", ["Sword Dance", "Evasion"], { health: 9999, maxHealth: 9999 });
  const slower = mkUnit(1, 1, "dagger", ["Stagnate", "Pin"], { strength: 8 });
  let b = mkBattle([slower, victim]);
  let r = doAttack(b, 1, 2, "Stagnate");
  // attacker keeps hitting until it lands so the status surely applies
  let guard = 0; while (!status.hasStatus(victim, "slowed") && guard++ < 50) { victim.statuses = []; r = doAttack(mkBattle([slower, victim]), 1, 2, "Stagnate"); }
  check(status.hasStatus(victim, "slowed"), "Stagnate applies 'slowed' on a landing hit");

  // Victim's turn: victim (slowed) ATTACKS a fresh foe -> should forfeit A2, but foe keeps BOTH counters.
  const foe = mkUnit(3, 1, "sword", ["Sword Dance", "Evasion"], { health: 9999, maxHealth: 9999 });
  const bSlowAtk = mkBattle([foe, victim], 2); // victim's turn (owner 2)
  // force a clean all-land read by sampling sequences across trials
  const seqSlowed = {};
  for (let i = 0; i < N; i++) {
    const v = mkUnit(2, 2, "sword", ["Sword Dance"], { health: 9999, maxHealth: 9999, statuses: [{ type: "slowed", turnsLeft: 1 }] });
    const f = mkUnit(3, 1, "sword", ["Sword Dance"], { health: 9999, maxHealth: 9999 });
    const rr = doAttack(mkBattle([v, f], 2), 2, 3, "Sword Dance");
    const k = steps(rr); seqSlowed[k] = (seqSlowed[k] || 0) + 1;
  }
  console.log("  slowed unit ATTACKING (it is owner-2's turn) — sequence distribution:"); showSeqs(seqSlowed);
  const noA2 = Object.keys(seqSlowed).every((k) => !k.split(",").includes("A2"));
  const defKeepsD2 = Object.keys(seqSlowed).some((k) => k.split(",").includes("D2"));
  check(noA2, "slowed attacker NEVER makes a 2nd strike (no A2)");
  check(defKeepsD2, "the un-slowed defender STILL gets its 2nd counter (D2) — the fixed bug");

  // Lifecycle: present on the victim's next turn, gone after.
  const v = mkUnit(2, 2, "sword", ["Sword Dance"], { statuses: [{ type: "slowed", turnsLeft: 1 }] });
  const lb = { units: { 2: v }, positions: { 2: { r: 0, c: 0 } }, turnUserId: 1 };
  endTurn(lb); const duringTurn = status.hasStatus(v, "slowed"); // victim's turn now
  endTurn(lb); const afterTurn = status.hasStatus(v, "slowed");  // victim ended its turn
  console.log(`  lifecycle: slowed during victim's next turn = ${duringTurn}; still slowed after that turn = ${afterTurn}`);
  check(duringTurn && !afterTurn, "slow is active for exactly the victim's next turn, then clears");
}

// BLINDING (statistical accuracy halving + 1-turn duration)
hr("BLINDING — afflicted unit's accuracy halved on its strikes; lasts 1 turn (sword Gouge)");
{
  function landRate(blinded) {
    let strikes = 0, landed = 0;
    for (let i = 0; i < N * 5; i++) {
      const A = mkUnit(1, 1, "sword", ["Sword Dance"], { statuses: blinded ? [{ type: "blinded", turnsLeft: 1 }] : [] });
      const D = mkUnit(2, 2, "sword", ["Sword Dance", "Evasion"], { speed: 10, skill: 12, knowledge: 12, luck: 8, health: 9999, maxHealth: 9999 });
      const r = doAttack(mkBattle([A, D]), 1, 2, "Sword Dance");
      for (const e of r.events) if (e.by === "attacker") { strikes++; if (e.type === "hit" || e.type === "crit") landed++; }
    }
    return { strikes, landed, rate: landed / strikes };
  }
  const clear = landRate(false), blind = landRate(true);
  console.log(`  sighted attacker: ${clear.landed}/${clear.strikes} landed (${pct(clear.landed, clear.strikes)})`);
  console.log(`  blinded attacker: ${blind.landed}/${blind.strikes} landed (${pct(blind.landed, blind.strikes)})`);
  check(blind.rate < clear.rate, "blinding reduces the afflicted unit's hit-rate");
  const v = mkUnit(2, 2, "sword", ["Sword Dance"], { statuses: [{ type: "blinded", turnsLeft: 1 }] });
  const lb = { units: { 2: v }, positions: { 2: { r: 0, c: 0 } }, turnUserId: 1 };
  endTurn(lb); const during = status.hasStatus(v, "blinded"); endTurn(lb); const after = status.hasStatus(v, "blinded");
  console.log(`  lifecycle: blinded during next turn = ${during}; after = ${after}`);
  check(during && !after, "blind lasts exactly the victim's next turn");
}

// SILENCING + IMMOBILIZING (handler-guard flags — verify the flag the server guard reads, and its duration)
for (const c of [
  { name: "SILENCING", weapon: "bow", ability: "Tome Breaker", status: "silenced", guard: "blocks ability use / casting (server.js attack+cast handlers)" },
  { name: "IMMOBILIZING", weapon: "dagger", ability: "Pin", status: "immobilized", guard: "blocks movement (server.js move handler) and empties move-tiles client-side" },
]) {
  hr(`${c.name} — applies "${c.status}" for 1 turn; ${c.guard}`);
  let applied = 0, dmgHits = 0;
  for (let i = 0; i < N; i++) {
    const A = mkUnit(1, 1, c.weapon, [c.ability, "Snipe"].slice(0, 2), { strength: 8 });
    const D = mkUnit(2, 2, "sword", ["Sword Dance", "Evasion"]);
    const r = doAttack(mkBattle([A, D]), 1, 2, c.ability);
    const dealt = r.events.some((e) => e.by === "attacker" && e.damage > 0);
    if (dealt) { dmgHits++; if (status.hasStatus(D, c.status)) applied++; }
  }
  console.log(`  ${dmgHits}/${N} attacks dealt damage; "${c.status}" applied on ${applied} of those`);
  check(applied === dmgHits, `"${c.status}" applied on every damaging hit (so the guard will fire next turn)`);
  const v = mkUnit(2, 2, "sword", ["Sword Dance"], { statuses: [{ type: c.status, turnsLeft: 1 }] });
  const lb = { units: { 2: v }, positions: { 2: { r: 0, c: 0 } }, turnUserId: 1 };
  endTurn(lb); const during = status.hasStatus(v, c.status); endTurn(lb); const after = status.hasStatus(v, c.status);
  console.log(`  lifecycle: ${c.status} present during victim's next turn = ${during}; after = ${after}`);
  check(during && !after, `${c.status} active for exactly the victim's next turn, then clears`);
}

// INJURED (intentionally turn-scoped: disables the target's counters for the REST OF THE APPLYING TURN)
hr("INJURING — a connecting hit stops the target countering your OTHER units this turn; clears at turn end (axe Bludgeon)");
{
  // Two attackers (owner 1), one defender (owner 2).
  const A1 = mkUnit(1, 1, "axe", ["Bludgeon", "Tomahawk"], { strength: 8 });
  const A2 = mkUnit(3, 1, "sword", ["Sword Dance", "Evasion"], { strength: 8 });
  const D = mkUnit(2, 2, "sword", ["Sword Dance", "Evasion"], { health: 9999, maxHealth: 9999 });
  const b = mkBattle([A1, D]); b.units[3] = A2; b.positions[3] = { r: 0, c: 2 };

  let r1 = doAttack(b, 1, 2, "Bludgeon");
  let guard = 0; while (!status.hasStatus(D, "injured") && guard++ < 50) { r1 = doAttack(b, 1, 2, "Bludgeon"); }
  const counteredOnInjuringHit = r1.events.some((e) => e.by === "defender");
  console.log(`  Bludgeon landed → 'injured' applied = ${status.hasStatus(D, "injured")}; defender DID counter the injuring hit itself = ${counteredOnInjuringHit}`);
  check(status.hasStatus(D, "injured"), "injuring hit applies 'injured'");

  const r2 = doAttack(b, 3, 2, "Sword Dance"); // second attacker, SAME turn
  const counteredSecond = r2.events.some((e) => e.by === "defender");
  console.log(`  second attacker (same turn) → defender counters = ${counteredSecond} (should be false)`);
  check(!counteredSecond, "an injured defender does NOT counter your other units this turn");

  endTurn(b); // owner 1 ends turn -> clearTurnEndStatuses
  console.log(`  after end of turn: still injured = ${status.hasStatus(D, "injured")} (should be false)`);
  check(!status.hasStatus(D, "injured"), "'injured' clears at the end of the turn it was applied (does NOT carry to later turns)");
}

// ───────────────────────── MULTI-TARGET (RADIAL / METEOR) ─────────────────────────
hr("RADIAL — one strike per enemy in range, NO counters (fire Eruption, 3 targets)");
{
  let totalEvents = 0, counters = 0, anyDamaged = 0, hits = 0;
  for (let i = 0; i < N; i++) {
    const A = mkUnit(1, 1, "fire", ["Eruption"], { type: "mage", magick: 10 });
    const targets = [2, 3, 4].map((id) => ({ unit: mkUnit(id, 2, "sword", ["Sword Dance", "Evasion"], { health: 999, maxHealth: 999 }), tile: TILE, dmgMult: 1 }));
    const r = combat.resolveAoE(A, "Eruption", targets, TILE);
    totalEvents += r.events.length;
    counters += r.events.filter((e) => e.by !== undefined).length;
    for (const e of r.events) { if (e.damage > 0) anyDamaged++; if (e.type === "hit" || e.type === "crit") hits++; }
  }
  console.log(`  ${N} casts × 3 targets = ${totalEvents} strikes; landed ${hits}, dealt damage ${anyDamaged}; counter events: ${counters}`);
  check(totalEvents === N * 3, "exactly one strike per target, every cast");
  check(counters === 0, "Radial never produces a counterattack");
}

hr("METEOR — primary full + ⅓ splash to adjacent (each splash = floor(1/3 of its own strike))");
{
  let viol = 0, splashLT = 0, samples = [];
  for (let i = 0; i < N; i++) {
    const A = mkUnit(1, 1, "bow", ["Explosive Volley"], { strength: 10 });
    const prim = { unit: mkUnit(2, 2, "sword", ["Sword Dance"], { health: 999, maxHealth: 999, luck: 30, speed: 0, skill: 0, knowledge: 0 }), tile: TILE, dmgMult: 1 };
    const spl = { unit: mkUnit(3, 2, "sword", ["Sword Dance"], { health: 999, maxHealth: 999, luck: 30, speed: 0, skill: 0, knowledge: 0 }), tile: TILE, dmgMult: 1 / 3 };
    const r = combat.resolveAoE(A, "Explosive Volley", [prim, spl], TILE, () => 0.5); // deterministic: identical targets
    const p = r.events[0].damage, s = r.events[1].damage;
    if (s !== Math.floor(p * (1 / 3))) viol++;
    if (s < p) splashLT++;
    if (i < 3) samples.push(`primary ${p} → splash ${s} (= floor(${p}/3) = ${Math.floor(p / 3)})`);
  }
  samples.forEach((x) => console.log("  " + x));
  check(viol === 0, "splash damage == floor(1/3 of the same strike) every time");
  check(splashLT === N, "splash always less than the primary's full damage");
}

console.log("\n" + "═".repeat(78));
console.log(`SIMULATION SUMMARY:  ${PASS} checks passed, ${FAIL} failed.`);
console.log("═".repeat(78) + "\n");
process.exit(FAIL ? 1 : 0);
