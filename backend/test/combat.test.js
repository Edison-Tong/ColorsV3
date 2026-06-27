// Minimal sanity checks for the combat engine. Run: npm test
const assert = require("assert");
const combat = require("../combat");

function mk(over) {
  return {
    id: 1, name: "T", type: "melee", size: 3, base_weapon: "axe", move_value: 5,
    abilities: ["Ragnarok", "Tomahawk"], specials: [],
    health: 20, strength: 10, defense: 6, magick: 4, resistance: 6, speed: 6, skill: 6, knowledge: 6, luck: 6,
    ...over,
  };
}

// Deterministic RNG: always rolls 0 -> always hits, never blocks, always... crit if critPct>0.
const alwaysLow = () => 0;
// Always rolls high -> always misses.
const alwaysHigh = () => 0.999999;

// 1. Stat computation: axe gives 1.5x power. melee power = str(10)+axe.str(3)=13, +size3(+1)=14, *1.5=21.
const stats = combat.computeAllStats(mk());
assert.strictEqual(stats.power, 21, `axe power expected 21, got ${stats.power}`);

// 2. Mage uses magick + magic protection.
const mageStats = combat.computeAllStats(mk({ type: "mage", base_weapon: "fire", magick: 10 }));
assert.ok(mageStats.isMage, "fire user should be a mage");
// fire power = magick(10)+fire.mgk(4)=14, *1.5 (fire) =21, +size3 power(+1 before mult) -> (14+1)*1.5=22.5->23
assert.strictEqual(mageStats.power, 23, `fire power expected 23, got ${mageStats.power}`);

// 3. Range: bow base range 2, Snipe ability range 3.
assert.strictEqual(combat.getAttackRange(mk({ base_weapon: "bow", abilities: ["Snipe", "Deadeye"] }), null), 2);
const snipe = combat.findAbility(mk({ base_weapon: "bow" }), "Snipe");
assert.strictEqual(combat.getAttackRange(mk({ base_weapon: "bow" }), snipe), 3);

// 4. Manhattan / no-diagonal: (0,0)->(1,1) is distance 2, not adjacent.
assert.strictEqual(combat.manhattan({ r: 0, c: 0 }, { r: 1, c: 1 }), 2);
assert.ok(!combat.inRange({ r: 0, c: 0 }, { r: 1, c: 1 }, 1), "diagonal should be out of range 1");
assert.ok(combat.inRange({ r: 0, c: 0 }, { r: 0, c: 1 }, 1), "orthogonal adjacent should be in range 1");

const n = { t: "normal", hg: false }; // neutral tile (no terrain effect)

// 5. Exchange order A1,D1,A2,D2 when both survive and can counter.
const atk = mk({ id: 1, health: 100, defense: 0, resistance: 0 });
const def = mk({ id: 2, health: 100, defense: 0, resistance: 0 });
const r = combat.resolveExchange(atk, def, null, true, n, n, alwaysLow);
const steps = r.events.map((e) => e.step);
assert.deepStrictEqual(steps, ["A1", "D1", "A2", "D2"], `expected A1,D1,A2,D2 got ${steps}`);

// 6. No counter when defenderCanCounter=false -> only A1, A2.
const r2 = combat.resolveExchange(atk, def, null, false, n, n, alwaysLow);
assert.deepStrictEqual(r2.events.map((e) => e.step), ["A1", "A2"]);

// 7. Always-high rng -> all misses, no damage.
const r3 = combat.resolveExchange(atk, def, null, true, n, n, alwaysHigh);
assert.ok(r3.events.every((e) => e.type === "miss"), "all should miss");
assert.strictEqual(r3.defenderHp, 100, "no damage on all-miss");

// 8. Exchange stops early when defender dies.
const glass = mk({ id: 3, health: 1, defense: 0, resistance: 0 });
const r4 = combat.resolveExchange(atk, glass, null, true, n, n, alwaysLow);
assert.strictEqual(r4.events[r4.events.length - 1].step, "A1", "should end after lethal A1");
assert.strictEqual(r4.defenderHp, 0);

// 9. Terrain DEF multiplier hits the base defense stat -> BOTH melee protection AND block rise,
//    but magic protection (resistance) and accuracy are untouched.
const cdef = mk({ defense: 10, resistance: 6, luck: 4 });
const base = combat.computeAllStats(cdef);
const fortDef = combat.computeAllStats(cdef, null, 1.1); // fort Def x1.1 on the base defense stat
assert.ok(fortDef.protection.melee > base.protection.melee, "fort raises melee protection");
assert.ok(fortDef.block > base.block, "fort raises block (block uses defense)");
assert.strictEqual(fortDef.protection.magic, base.protection.magic, "def mult leaves magic protection alone");
assert.strictEqual(fortDef.accuracy, base.accuracy, "def mult leaves accuracy alone");

// 10. Derived-stat terrain effects via applyTerrain (acc/eva).
const onMountain = combat.applyTerrain(base, { t: "mountain", hg: false }, { t: "normal", hg: false });
assert.strictEqual(onMountain.accuracy, Math.round(base.accuracy * 1.15), "mountain acc x1.15");
assert.strictEqual(onMountain.evasion, Math.round(base.evasion * 0.85), "mountain eva x0.85");

// 11. High ground is a relative accuracy edge (only when one side is high), stacks with terrain.
const highVsLow = combat.applyTerrain(base, { t: "normal", hg: true }, { t: "normal", hg: false });
assert.strictEqual(highVsLow.accuracy, Math.round(base.accuracy * 1.15), "high-ground attacker acc x1.15");
const lowVsHigh = combat.applyTerrain(base, { t: "normal", hg: false }, { t: "normal", hg: true });
assert.strictEqual(lowVsHigh.accuracy, Math.round(base.accuracy * 0.85), "low-ground attacker acc x0.85");
const bothHigh = combat.applyTerrain(base, { t: "normal", hg: true }, { t: "normal", hg: true });
assert.strictEqual(bothHigh.accuracy, base.accuracy, "both high -> no relative acc change");
const fortHigh = combat.applyTerrain(base, { t: "fort", hg: true }, { t: "normal", hg: false });
assert.strictEqual(fortHigh.accuracy, Math.round(base.accuracy * 1.1 * 1.15), "fort+highground acc stacks");

// 12. Maiming: a landed attacker strike cancels the matching counter (A1->no D1, A2->no D2).
const maimer = mk({ id: 1, base_weapon: "axe", abilities: ["Dismember", "Tomahawk"], health: 1000, strength: 8, defense: 0, resistance: 0, luck: 0 });
const victim = mk({ id: 2, base_weapon: "sword", abilities: ["Sword Dance", "Evasion"], health: 1000, strength: 8, defense: 0, resistance: 0, luck: 0 });
const rMaim = combat.resolveExchange(maimer, victim, "Dismember", true, n, n, alwaysLow);
assert.deepStrictEqual(rMaim.events.map((e) => e.step), ["A1", "A2"], "Maiming cancels both counters when both attacks land");
const rDmg = combat.resolveExchange(maimer, victim, "Tomahawk", true, n, n, alwaysLow); // Damage type -> counters happen
assert.deepStrictEqual(rDmg.events.map((e) => e.step), ["A1", "D1", "A2", "D2"], "non-Maiming attack keeps counters");

// 13. Obscuring: once the attacker lands, the defender's counters get accuracy x0.5 -> fewer land.
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function counterLandings(abilityName, trials) {
  let landed = 0;
  for (let i = 0; i < trials; i++) {
    const A = mk({ id: 1, base_weapon: "sword", abilities: ["Foul Play", "Sword Dance"], health: 1000, strength: 8 });
    const D = mk({ id: 2, base_weapon: "sword", abilities: ["Sword Dance", "Evasion"], health: 1000, strength: 8, speed: 10, skill: 12, knowledge: 12, luck: 8 });
    const r = combat.resolveExchange(A, D, abilityName, true, n, n, mulberry32(i + 1));
    for (const e of r.events) if (e.by === "defender" && (e.type === "hit" || e.type === "crit")) landed++;
  }
  return landed;
}
const normalLands = counterLandings("Sword Dance", 2000); // Damage type
const obscLands = counterLandings("Foul Play", 2000);     // Obscuring type
assert.ok(obscLands < normalLands, `obscuring should reduce landed counters (normal ${normalLands} vs obscuring ${obscLands})`);

// 14. Piercing: attacker ignores the target's protection (full power as damage).
//     Armor Cleaver (axe, Piercing) vs a high-defense target -> A1 deals full power; a normal
//     axe attack vs the same target deals power - protection. (mid roll: hits, no block/crit —
//     piercing zeroes protection but NOT block, so a clean hit isolates the protection effect.)
const mid = () => 0.5;
const pierceTgt = mk({ id: 2, base_weapon: "lance", abilities: ["Impale", "Pierce"], health: 1000, defense: 12, resistance: 12, luck: 0 });
const piercer = mk({ id: 1, base_weapon: "axe", abilities: ["Armor Cleaver", "Tomahawk"], health: 1000, strength: 8, luck: 0 });
const pierceStats = combat.computeAllStats(piercer, combat.findAbility(piercer, "Armor Cleaver"));
const rPierce = combat.resolveExchange(piercer, pierceTgt, "Armor Cleaver", false, n, n, mid);
assert.strictEqual(rPierce.events[0].damage, pierceStats.power, `piercing A1 should deal full power (${pierceStats.power}), got ${rPierce.events[0].damage}`);
const rNormalP = combat.resolveExchange(piercer, pierceTgt, "Tomahawk", false, n, n, mid);
assert.ok(rNormalP.events[0].damage < pierceStats.power, "non-piercing attack is reduced by protection");

// 15. Brave: both attacker strikes land before the defender counters (A1,A2,D1,D2).
const braveA = mk({ id: 1, base_weapon: "dagger", abilities: ["Blitz", "Puncture"], health: 1000, strength: 8, defense: 0, resistance: 0 });
const braveD = mk({ id: 2, base_weapon: "sword", abilities: ["Sword Dance", "Evasion"], health: 1000, strength: 8, defense: 0, resistance: 0 });
const rBrave = combat.resolveExchange(braveA, braveD, "Blitz", true, n, n, alwaysLow);
assert.deepStrictEqual(rBrave.events.map((e) => e.step), ["A1", "A2", "D1", "D2"], "Brave front-loads both attacker strikes");
assert.deepStrictEqual(rBrave.events.map((e) => e.by), ["attacker", "attacker", "defender", "defender"], "Brave order: attacker, attacker, defender, defender");

// 16. Absorption: attacker heals 50% (floored) of damage dealt, capped at maxHealth.
const leecher = mk({ id: 1, base_weapon: "grass", type: "mage", abilities: ["Leech Life"], magick: 10, health: 100, maxHealth: 100 });
leecher.health = 50; // hurt, so heal isn't capped
const leechTgt = mk({ id: 2, base_weapon: "sword", abilities: ["Sword Dance", "Evasion"], health: 1000, defense: 0, resistance: 0, luck: 0, speed: 0, skill: 0, knowledge: 0 });
const rLeech = combat.resolveExchange(leecher, leechTgt, "Leech Life", false, n, n, alwaysLow);
const dealt = rLeech.events.filter((e) => e.by === "attacker").reduce((s, e) => s + e.damage, 0);
const expectedHeal = rLeech.events.filter((e) => e.by === "attacker").reduce((s, e) => s + Math.floor(e.damage * 0.5), 0);
assert.strictEqual(rLeech.attackerHp, 50 + expectedHeal, `absorption heal: expected ${50 + expectedHeal}, got ${rLeech.attackerHp}`);
assert.ok(dealt > 0 && expectedHeal > 0, "leech test should actually deal damage");
// Heal cap: a full-HP leecher never exceeds maxHealth.
const fullLeech = mk({ id: 1, base_weapon: "dark", type: "mage", abilities: ["Leech Life"], magick: 10, health: 100, maxHealth: 100 });
const rCap = combat.resolveExchange(fullLeech, leechTgt, "Leech Life", false, n, n, alwaysLow);
assert.strictEqual(rCap.attackerHp, 100, "absorption never heals past maxHealth");

// 17. Slowing: a slowed attacker forfeits its second strike (A2); a slowed defender forfeits D2.
const slowAtk = mk({ id: 1, base_weapon: "sword", abilities: ["Sword Dance", "Evasion"], health: 1000, strength: 8, defense: 0, resistance: 0, statuses: [{ type: "slowed", turnsLeft: 1 }] });
const slowFoe = mk({ id: 2, base_weapon: "sword", abilities: ["Sword Dance", "Evasion"], health: 1000, strength: 8, defense: 0, resistance: 0 });
const rSlowA = combat.resolveExchange(slowAtk, slowFoe, null, true, n, n, alwaysLow);
assert.deepStrictEqual(rSlowA.events.map((e) => e.step), ["A1", "D1", "D2"], "slowed attacker forfeits A2 only — the (un-slowed) defender still gets both counters");
const rSlowD = combat.resolveExchange(slowFoe, slowAtk, null, true, n, n, alwaysLow); // now the slowed unit defends
assert.deepStrictEqual(rSlowD.events.map((e) => e.step), ["A1", "D1", "A2"], "slowed defender forfeits its D2 counter only");
// Both slowed: each forfeits its second strike -> A1, D1.
const slowBoth = mk({ id: 3, base_weapon: "sword", abilities: ["Sword Dance", "Evasion"], health: 1000, strength: 8, defense: 0, resistance: 0, statuses: [{ type: "slowed", turnsLeft: 1 }] });
const rBoth = combat.resolveExchange(slowAtk, slowBoth, null, true, n, n, alwaysLow);
assert.deepStrictEqual(rBoth.events.map((e) => e.step), ["A1", "D1"], "both slowed -> one strike each");

// 18. Blinding: a blinded unit's accuracy is halved, so it lands fewer attacker hits over many trials.
function atkLandings(blinded, trials) {
  let landed = 0;
  for (let i = 0; i < trials; i++) {
    const A = mk({ id: 1, base_weapon: "sword", abilities: ["Sword Dance", "Evasion"], health: 1000, strength: 8, statuses: blinded ? [{ type: "blinded", turnsLeft: 1 }] : [] });
    const D = mk({ id: 2, base_weapon: "sword", abilities: ["Sword Dance", "Evasion"], health: 1000, strength: 8, speed: 10, skill: 12, knowledge: 12, luck: 8 });
    const r = combat.resolveExchange(A, D, null, false, n, n, mulberry32(i + 1));
    for (const e of r.events) if (e.by === "attacker" && (e.type === "hit" || e.type === "crit")) landed++;
  }
  return landed;
}
const sightedLands = atkLandings(false, 2000);
const blindLands = atkLandings(true, 2000);
assert.ok(blindLands < sightedLands, `blinding should reduce landed hits (sighted ${sightedLands} vs blind ${blindLands})`);

console.log("All combat sanity checks passed ✓");
