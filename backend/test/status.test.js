// Unit checks for the lingering-status engine (status.js): DoT ticking, duration countdown,
// refresh-on-reapply, stacking, and DoT lethality. Run via `npm test`.
const assert = require("assert");
const { hasStatus, addStatus, ON_HIT_STATUS, tickDots, decrementStatuses, clearTurnEndStatuses } = require("../status");

const P1 = 1, P2 = 2;
// Minimal battle scaffold: one unit per owner, current turn = P1 by default.
function mkBattle(over) {
  const u1 = { id: 11, ownerId: P1, alive: true, health: 40, statuses: [] };
  const u2 = { id: 22, ownerId: P2, alive: true, health: 40, statuses: [] };
  return {
    turnUserId: P1,
    units: { 11: u1, 22: u2 },
    positions: { 11: { r: 0, c: 0 }, 22: { r: 1, c: 1 } },
    u1, u2, ...over,
  };
}

// 1. ON_HIT_STATUS maps every batch-B attack type to a status with a duration.
for (const t of ["Burning", "Poisoning", "Freezing", "Crushing", "Shocking", "Silencing", "Slowing", "Blinding", "Immobilizing"]) {
  assert.ok(ON_HIT_STATUS[t] && ON_HIT_STATUS[t].turns >= 1, `${t} should map to a status with a duration`);
}
assert.ok(["burned", "poisoned", "frozen", "crushed", "shocked"].every((s) => {
  const e = Object.values(ON_HIT_STATUS).find((x) => x.status === s);
  return e && e.dot === true;
}), "the five DoT statuses must be flagged dot:true");
assert.ok(!ON_HIT_STATUS.Slowing.dot && !ON_HIT_STATUS.Blinding.dot, "control effects are not DoTs");

// 2. addStatus refreshes duration instead of stacking duplicates.
const u = { health: 40, statuses: [] };
addStatus(u, "poisoned", { turnsLeft: 2, dot: true });
addStatus(u, "poisoned", { turnsLeft: 2, dot: true }); // re-applied
assert.strictEqual(u.statuses.filter((s) => s.type === "poisoned").length, 1, "no duplicate poisoned entry");
addStatus(u, "poisoned", { turnsLeft: 5 });
assert.strictEqual(u.statuses.find((s) => s.type === "poisoned").turnsLeft, 5, "re-apply refreshes turnsLeft");

// 3. DoT tick = 12.5% of CURRENT health (min 1), only on the current player's units.
const b = mkBattle();
addStatus(b.u1, "poisoned", { turnsLeft: 2, dot: true });
addStatus(b.u2, "burned", { turnsLeft: 2, dot: true }); // P2 unit — should NOT tick on P1's turn
const ticks = tickDots(b);
assert.strictEqual(b.u1.health, 35, "40 HP poisoned -> 12.5% = 5 dmg -> 35");
assert.strictEqual(b.u2.health, 40, "opponent's unit doesn't tick on this player's turn");
assert.deepStrictEqual(ticks, [{ unitId: 11, type: "poisoned", damage: 5, hp: 35 }], "tick event reported");

// 4. Stacking: two distinct DoTs both tick (second on the already-reduced HP).
const b2 = mkBattle();
b2.u1.health = 100;
addStatus(b2.u1, "poisoned", { turnsLeft: 2, dot: true });
addStatus(b2.u1, "burned", { turnsLeft: 2, dot: true });
const ticks2 = tickDots(b2);
assert.strictEqual(ticks2.length, 2, "both DoTs tick");
// 100 -> -13 (round 12.5) -> 87 -> -11 (round 10.875) -> 76
assert.strictEqual(b2.u1.health, 76, `stacked DoTs: expected 76, got ${b2.u1.health}`);

// 5. DoT can kill: a 1-HP unit dies and is removed from the board.
const b3 = mkBattle();
b3.u1.health = 1;
addStatus(b3.u1, "shocked", { turnsLeft: 2, dot: true });
tickDots(b3);
assert.strictEqual(b3.u1.health, 0, "DoT reduces to 0");
assert.strictEqual(b3.u1.alive, false, "DoT kills");
assert.strictEqual(b3.positions[11], undefined, "dead unit removed from positions");

// 6. decrementStatuses counts down only the current player's statuses; expired ones drop.
const b4 = mkBattle();
addStatus(b4.u1, "poisoned", { turnsLeft: 2, dot: true }); // -> 1, kept
addStatus(b4.u1, "slowed", { turnsLeft: 1 });              // -> 0, removed
addStatus(b4.u1, "injured", { clearOn: "turnEnd" });        // no turnsLeft -> untouched here
addStatus(b4.u2, "blinded", { turnsLeft: 1 });              // P2 unit -> untouched on P1's turn
decrementStatuses(b4);
assert.strictEqual(b4.u1.statuses.find((s) => s.type === "poisoned").turnsLeft, 1, "poisoned counts down to 1");
assert.ok(!hasStatus(b4.u1, "slowed"), "1-turn slow expires");
assert.ok(hasStatus(b4.u1, "injured"), "turn-end status not consumed by decrement");
assert.strictEqual(b4.u2.statuses.find((s) => s.type === "blinded").turnsLeft, 1, "opponent's status unchanged");

// 7. A full DoT lifecycle ticks exactly twice over the victim's two turns (apply -> tick,tick -> gone).
const b5 = mkBattle();
addStatus(b5.u1, "poisoned", { turnsLeft: 2, dot: true }); // applied during opponent's turn
let totalTicks = 0;
// victim's 1st turn
totalTicks += tickDots(b5).length; decrementStatuses(b5); // tick, -> 1
// victim's 2nd turn
totalTicks += tickDots(b5).length; decrementStatuses(b5); // tick, -> 0 removed
// victim's 3rd turn — gone
totalTicks += tickDots(b5).length;
assert.strictEqual(totalTicks, 2, "a 2-turn DoT ticks exactly twice");
assert.ok(!hasStatus(b5.u1, "poisoned"), "DoT expired after two ticks");

// 8. clearTurnEndStatuses still drops only clearOn:turnEnd statuses (Injured), leaving the rest.
const b6 = mkBattle();
addStatus(b6.u1, "injured", { clearOn: "turnEnd" });
addStatus(b6.u1, "poisoned", { turnsLeft: 2, dot: true });
clearTurnEndStatuses(b6);
assert.ok(!hasStatus(b6.u1, "injured"), "injured cleared at turn end");
assert.ok(hasStatus(b6.u1, "poisoned"), "DoT survives turn-end clear");

console.log("All status-engine checks passed ✓");
