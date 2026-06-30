// ColorsV3 — mage-special effect system. Maps each special's `effect` code to (a) which side it can
// target, and (b) how it applies (Tier 1 = enemy-facing effects so far). The cast handler uses this;
// the frontend keeps an ESM mirror for targeting highlights. Built in tiers: enemy → ally/self → board.

// Buff / nerf multiplier for the "Applies Multiplier" stat effects. Tunable in one place.
const BUFF_MULT = 1.3;
const NERF_MULT = 0.7;

// Target side for EVERY effect code (drives target validation + UI highlighting, even before the
// effect itself is implemented). enemy | ally | self | allyOrSelf | board
const EFFECT_SIDE = {
  // Enemy debuffs / DoTs / control
  Brn: "enemy", Frz: "enemy", Shck: "enemy", Psn: "enemy", Crsh: "enemy",
  Blnd: "enemy", Slnc: "enemy", Slw: "enemy", Immob: "enemy",
  "Pwr-": "enemy", Prc: "enemy", Curse: "enemy", Poss: "enemy",
  // Ally / self buffs & utility
  "Pwr+": "allyOrSelf", "Prt+": "allyOrSelf", "Eva+": "allyOrSelf", "Lck+": "allyOrSelf", "Mve+": "allyOrSelf",
  Rgn: "allyOrSelf", Mrcy: "allyOrSelf", Inv: "allyOrSelf", Invis: "allyOrSelf",
  Rflct: "allyOrSelf", Absrb: "allyOrSelf", Cnto: "allyOrSelf", Cntr: "allyOrSelf",
  Brv: "allyOrSelf", Hst: "allyOrSelf", Swft: "allyOrSelf", Time: "allyOrSelf",
  Swap: "ally",
  // Board (target a tile, not a unit — not castable yet)
  Wall: "board", Prtl: "board",
};

// Implemented effects. Each fn mutates the target unit's statuses via `add` (= addStatus).
// Tier 1 covers the enemy-facing effects; ally/self and board effects fill in later tiers.
const APPLY = {
  // DoTs (−12.5% HP/turn, ticking handled by the status engine)
  Brn: (t, sp, add) => add(t, "burned", { turnsLeft: sp.turns || 2, dot: true }),
  Frz: (t, sp, add) => add(t, "frozen", { turnsLeft: sp.turns || 2, dot: true }),
  Shck: (t, sp, add) => add(t, "shocked", { turnsLeft: sp.turns || 2, dot: true }),
  Psn: (t, sp, add) => add(t, "poisoned", { turnsLeft: sp.turns || 2, dot: true }),
  Crsh: (t, sp, add) => add(t, "crushed", { turnsLeft: sp.turns || 2, dot: true }),
  // Control
  Blnd: (t, sp, add) => add(t, "blinded", { turnsLeft: sp.turns || 1 }),
  Slnc: (t, sp, add) => add(t, "silenced", { turnsLeft: sp.turns || 1 }),
  Slw: (t, sp, add) => add(t, "slowed", { turnsLeft: sp.turns || 1 }),
  Immob: (t, sp, add) => add(t, "immobilized", { turnsLeft: sp.turns || 1 }),
  // Stat nerf (a timed multiplier the combat engine reads from statuses)
  "Pwr-": (t, sp, add) => add(t, "Pwr-", { modStat: "power", mult: NERF_MULT, turnsLeft: sp.turns || 1 }),
  // Pierced — the unit's protection is treated as 0 while it lasts
  Prc: (t, sp, add) => add(t, "pierced", { turnsLeft: sp.turns || 1 }),
  // Curse — all actions blocked (no move, no attack, no cast, no counter)
  Curse: (t, sp, add) => add(t, "cursed", { turnsLeft: sp.turns || 1 }),
};

function effectSide(code) { return EFFECT_SIDE[code] || "allyOrSelf"; }
function effectImplemented(code) { return !!APPLY[code]; }
function applyEffect(code, target, special, addStatus) {
  const fn = APPLY[code];
  if (!fn) return false;
  fn(target, special, addStatus);
  return true;
}

module.exports = { BUFF_MULT, NERF_MULT, EFFECT_SIDE, effectSide, effectImplemented, applyEffect };
