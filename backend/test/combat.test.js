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

// 5. DEFAULT exchange is ONE strike each (A1, D1) when agility is even — no bonus second strikes.
const atk = mk({ id: 1, health: 100, defense: 0, resistance: 0 });
const def = mk({ id: 2, health: 100, defense: 0, resistance: 0 });
const r = combat.resolveExchange(atk, def, null, true, n, n, alwaysLow);
const steps = r.events.map((e) => e.step);
assert.deepStrictEqual(steps, ["A1", "D1"], `even agility -> A1,D1; got ${steps}`);

// 6. No counter when defenderCanCounter=false -> just A1 (no bonus strike at even agility).
const r2 = combat.resolveExchange(atk, def, null, false, n, n, alwaysLow);
assert.deepStrictEqual(r2.events.map((e) => e.step), ["A1"]);

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

// 12. Maiming: a landed attacker strike cancels the defender's counter (even agility -> A1, D1 default).
const maimer = mk({ id: 1, base_weapon: "axe", abilities: ["Dismember", "Tomahawk"], health: 1000, strength: 8, defense: 0, resistance: 0, luck: 0 });
const victim = mk({ id: 2, base_weapon: "sword", abilities: ["Sword Dance", "Evasion"], health: 1000, strength: 8, defense: 0, resistance: 0, luck: 0 });
const rMaim = combat.resolveExchange(maimer, victim, "Dismember", true, n, n, alwaysLow);
assert.deepStrictEqual(rMaim.events.map((e) => e.step), ["A1"], "Maiming cancels the counter when the attack lands");
const rDmg = combat.resolveExchange(maimer, victim, "Tomahawk", true, n, n, alwaysLow); // Damage type -> counter happens
assert.deepStrictEqual(rDmg.events.map((e) => e.step), ["A1", "D1"], "non-Maiming attack keeps the counter");

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

// 15. Brave: the attacker's two strikes land before the (single) counter -> A1, A2, D1.
const braveA = mk({ id: 1, base_weapon: "dagger", abilities: ["Blitz", "Puncture"], health: 1000, strength: 8, defense: 0, resistance: 0, speed: 4 });
const braveD = mk({ id: 2, base_weapon: "sword", abilities: ["Sword Dance", "Evasion"], health: 1000, strength: 8, defense: 0, resistance: 0, speed: 6 });
const rBrave = combat.resolveExchange(braveA, braveD, "Blitz", true, n, n, alwaysLow);
assert.deepStrictEqual(rBrave.events.map((e) => e.step), ["A1", "A2", "D1"], "Brave front-loads both attacker strikes, then one counter");
assert.deepStrictEqual(rBrave.events.map((e) => e.by), ["attacker", "attacker", "defender"], "Brave order: attacker, attacker, defender");

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

// 17. Agility edge grants a bonus strike (≥4 higher); Slowing cancels that bonus.
//     fast dagger (spd 8 -> agi ~12) vs slow sword (spd 4 -> agi 4): a clear ≥4 edge.
const fast = mk({ id: 1, base_weapon: "dagger", abilities: ["Throwing Knives"], health: 1000, strength: 8, defense: 0, resistance: 0, speed: 8 });
const slowU = mk({ id: 2, base_weapon: "sword", abilities: ["Sword Dance"], health: 1000, strength: 8, defense: 0, resistance: 0, speed: 4 });
assert.deepStrictEqual(combat.resolveExchange(fast, slowU, null, true, n, n, alwaysLow).events.map((e) => e.step), ["A1", "D1", "A2"], "agility-edge ATTACKER earns a 2nd strike (A1,D1,A2)");
assert.deepStrictEqual(combat.resolveExchange(slowU, fast, null, true, n, n, alwaysLow).events.map((e) => e.step), ["A1", "D1", "D2"], "agility-edge DEFENDER earns a 2nd counter (A1,D1,D2)");
const fastSlowed = mk({ id: 1, base_weapon: "dagger", abilities: ["Throwing Knives"], health: 1000, strength: 8, defense: 0, resistance: 0, speed: 8, statuses: [{ type: "slowed", turnsLeft: 1 }] });
assert.deepStrictEqual(combat.resolveExchange(fastSlowed, slowU, null, true, n, n, alwaysLow).events.map((e) => e.step), ["A1", "D1"], "Slowing cancels the attacker's agility bonus strike");
const fastDefSlowed = mk({ id: 2, base_weapon: "dagger", abilities: ["Throwing Knives"], health: 1000, strength: 8, defense: 0, resistance: 0, speed: 8, statuses: [{ type: "slowed", turnsLeft: 1 }] });
assert.deepStrictEqual(combat.resolveExchange(slowU, fastDefSlowed, null, true, n, n, alwaysLow).events.map((e) => e.step), ["A1", "D1"], "Slowing cancels the defender's agility bonus counter");

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

// 19. AoE (Radial/Meteor): one strike per target, NO counters; Meteor splash = floor(1/3 damage).
const mid2 = () => 0.5; // hits, no block/crit (target luck high)
const aoeAtk = mk({ id: 1, base_weapon: "fire", type: "mage", abilities: ["Eruption"], magick: 12, defense: 0, luck: 0 });
const tg = (id) => mk({ id, base_weapon: "sword", abilities: ["Sword Dance"], health: 1000, defense: 0, resistance: 0, luck: 20, speed: 0, skill: 0, knowledge: 0 });
const aoe = combat.resolveAoE(aoeAtk, "Eruption", [
  { unit: tg(2), tile: n, dmgMult: 1 },
  { unit: tg(3), tile: n, dmgMult: 1 / 3 },
], n, mid2);
assert.strictEqual(aoe.events.length, 2, "resolveAoE produces one event per target");
assert.ok(aoe.events.every((e) => e.targetId != null && e.by === undefined), "AoE events are target strikes with no counters");
const full = aoe.events[0].damage, splash = aoe.events[1].damage;
assert.ok(full > 0, "primary takes full damage");
assert.strictEqual(splash, Math.floor(full * (1 / 3)), `meteor splash = floor(1/3 full): expected ${Math.floor(full / 3)}, got ${splash}`);

// 20. Range as min-max, height-aware distance, and counter eligibility.
assert.deepStrictEqual(combat.parseRange(2), { min: 2, max: 2 }, "number 2 = exactly 2");
assert.deepStrictEqual(combat.parseRange("1-2"), { min: 1, max: 2 }, "'1-2' = 1..2");
assert.deepStrictEqual(combat.parseRange("2-4"), { min: 2, max: 4 }, "'2-4' = 2..4");
const N0 = { t: "normal", hg: false }, HG = { t: "normal", hg: true };
// Bow default = exactly 2: can't hit an adjacent foe, can hit at 2.
const bowRange = combat.getRange(mk({ base_weapon: "bow", abilities: ["Snipe", "Deadeye"] }), null);
assert.deepStrictEqual(bowRange, { min: 2, max: 2 }, "bow default = exactly 2");
assert.ok(!combat.inAttackRange({ r: 0, c: 0 }, { r: 0, c: 1 }, N0, N0, bowRange), "bow can't hit 1 tile away");
assert.ok(combat.inAttackRange({ r: 0, c: 0 }, { r: 0, c: 2 }, N0, N0, bowRange), "bow hits at 2 tiles");
// High ground adds +1 to distance.
assert.strictEqual(combat.combatDistance({ r: 0, c: 0 }, { r: 0, c: 1 }, HG, N0), 2, "adjacent high-vs-normal = distance 2");
assert.strictEqual(combat.combatDistance({ r: 0, c: 0 }, { r: 0, c: 1 }, N0, N0), 1, "adjacent same height = distance 1");
// Sword (range 1) on normal can't reach an adjacent foe on high ground (effective distance 2).
const swordRange = combat.getRange(mk({ base_weapon: "sword", abilities: ["Sword Dance"] }), null);
assert.ok(!combat.inAttackRange({ r: 0, c: 0 }, { r: 0, c: 1 }, N0, HG, swordRange), "sword can't reach an adjacent high-ground foe");
// A "1-2" mage move CAN reach that high-ground foe (effective distance 2 is within 1-2).
const fireMage = mk({ base_weapon: "fire", type: "mage" });
const scorchRange = combat.getRange(fireMage, combat.findAbility(fireMage, "Scorch"));
assert.deepStrictEqual(scorchRange, { min: 1, max: 2 }, "Scorch = 1-2 (synced from frontend)");
assert.ok(combat.inAttackRange({ r: 0, c: 0 }, { r: 0, c: 1 }, N0, HG, scorchRange), "a 1-2 mage move reaches the adjacent high-ground foe");
// Counter eligibility: a sword can't counter a bow attacking from 2 tiles away.
assert.ok(!combat.inAttackRange({ r: 0, c: 2 }, { r: 0, c: 0 }, N0, N0, swordRange), "sword (range 1) can't counter across 2 tiles");

console.log("All combat sanity checks passed ✓");
