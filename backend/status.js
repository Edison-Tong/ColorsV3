// ColorsV3 — lingering status effects (DoTs + control debuffs). Pure helpers over a battle
// object `b` ({ units, positions, turnUserId }); no socket/io concerns so they're unit-testable.
// The combat engine (combat.js) reads "blinded"/"slowed" off a unit's `statuses` during an
// exchange; this module owns applying, ticking, and expiring statuses across turns.

const hasStatus = (u, type) => Array.isArray(u.statuses) && u.statuses.some((s) => s.type === type);

// Add or refresh a status on a unit. Re-applying the same type refreshes its fields (duration).
const addStatus = (u, type, extra = {}) => {
  u.statuses = u.statuses || [];
  const cur = u.statuses.find((s) => s.type === type);
  if (cur) Object.assign(cur, extra);
  else u.statuses.push({ type, ...extra });
};

// Attack types that land a lingering status on a struck, surviving defender.
// dot:true → ticks damage each of the victim's own turns; others are control effects.
// Durations come from the ability flavor text (DoTs "2 turns", control effects "one turn").
const ON_HIT_STATUS = {
  Burning:      { status: "burned",      turns: 2, dot: true },
  Poisoning:    { status: "poisoned",    turns: 2, dot: true },
  Freezing:     { status: "frozen",      turns: 2, dot: true },
  Crushing:     { status: "crushed",     turns: 2, dot: true },
  Shocking:     { status: "shocked",     turns: 2, dot: true },
  Silencing:    { status: "silenced",    turns: 1 },
  Slowing:      { status: "slowed",      turns: 1 },
  Blinding:     { status: "blinded",     turns: 1 },
  Immobilizing: { status: "immobilized", turns: 1 },
};

// At the START of a player's turn, damage-over-time statuses on that player's units tick:
// each deals 12.5% of the unit's CURRENT health (min 1, so a DoT can still finish a unit off).
// Returns [{ unitId, type, damage, hp }] for client feedback. Mutates HP / alive / positions.
const tickDots = (b) => {
  const ticks = [];
  for (const u of Object.values(b.units)) {
    if (!u.alive || u.ownerId !== b.turnUserId || !Array.isArray(u.statuses)) continue;
    for (const s of u.statuses) {
      if (!s.dot) continue;
      const damage = Math.max(1, Math.round(u.health * 0.125));
      u.health = Math.max(0, u.health - damage);
      ticks.push({ unitId: u.id, type: s.type, damage, hp: u.health });
      if (u.health <= 0) { u.alive = false; delete b.positions[u.id]; break; } // dead — stop further ticks
    }
  }
  return ticks;
};

// At the END of a player's turn, count down every turn-scoped status on that player's units and
// drop the expired ones. (Debuffs are applied on the opponent's turn, so they count down on the
// afflicted owner's own turns.)
const decrementStatuses = (b) => {
  for (const u of Object.values(b.units)) {
    if (u.ownerId !== b.turnUserId || !Array.isArray(u.statuses)) continue;
    u.statuses = u.statuses.filter((s) => {
      if (s.turnsLeft == null) return true; // non-turn-scoped (e.g. injured, handled separately)
      s.turnsLeft -= 1;
      return s.turnsLeft > 0;
    });
  }
};

// Drop statuses that expire at the end of the current turn (e.g. Injured).
const clearTurnEndStatuses = (b) => {
  for (const u of Object.values(b.units)) {
    if (Array.isArray(u.statuses)) u.statuses = u.statuses.filter((s) => s.clearOn !== "turnEnd");
  }
};

module.exports = { hasStatus, addStatus, ON_HIT_STATUS, tickDots, decrementStatuses, clearTurnEndStatuses };
