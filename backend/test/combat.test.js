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

console.log("All combat sanity checks passed ✓");
