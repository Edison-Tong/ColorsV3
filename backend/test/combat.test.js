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

// 5. Exchange order A1,D1,A2,D2 when both survive and can counter.
const atk = mk({ id: 1, health: 100, defense: 0, resistance: 0 });
const def = mk({ id: 2, health: 100, defense: 0, resistance: 0 });
const r = combat.resolveExchange(atk, def, null, true, alwaysLow);
const steps = r.events.map((e) => e.step);
assert.deepStrictEqual(steps, ["A1", "D1", "A2", "D2"], `expected A1,D1,A2,D2 got ${steps}`);

// 6. No counter when defenderCanCounter=false -> only A1, A2.
const r2 = combat.resolveExchange(atk, def, null, false, alwaysLow);
assert.deepStrictEqual(r2.events.map((e) => e.step), ["A1", "A2"]);

// 7. Always-high rng -> all misses, no damage.
const r3 = combat.resolveExchange(atk, def, null, true, alwaysHigh);
assert.ok(r3.events.every((e) => e.type === "miss"), "all should miss");
assert.strictEqual(r3.defenderHp, 100, "no damage on all-miss");

// 8. Exchange stops early when defender dies.
const glass = mk({ id: 3, health: 1, defense: 0, resistance: 0 });
const r4 = combat.resolveExchange(atk, glass, null, true, alwaysLow);
assert.strictEqual(r4.events[r4.events.length - 1].step, "A1", "should end after lethal A1");
assert.strictEqual(r4.defenderHp, 0);

console.log("All combat sanity checks passed ✓");
