// ColorsV3 — combat engine. Server-authoritative so neither client can cheat.
// Formulas ported from ColorsV2/frontend/BattleScreen.js (computeAllStats + the A1/D1/A2/D2 exchange).
// CommonJS for the backend; the frontend keeps an ESM copy in src/logic/combat.js for previews.

const { weaponsData } = require("./weaponsData");

const num = (v) => Number(v) || 0;

function getWeaponStats(character) {
  const key = String(character.base_weapon || "").toLowerCase();
  return (weaponsData.weapons[key] && weaponsData.weapons[key].stats) || {};
}

function isMage(character) {
  return String(character.type || "").toLowerCase() === "mage";
}

// Default movement: melee 5, mage 4 (+1 for wind), matching ColorsV2 char creation.
function getMoveValue(character) {
  if (typeof character.move_value === "number" && character.move_value > 0) return character.move_value;
  const base = isMage(character) ? 4 : 5;
  return String(character.base_weapon || "").toLowerCase() === "wind" ? base + 1 : base;
}

// Look up an ability object (weapon ability or mage special) by name for a character's weapon.
function findAbility(character, abilityName) {
  if (!abilityName) return null;
  const key = String(character.base_weapon || "").toLowerCase();
  const wepAb = (weaponsData.weaponAbilities[key] || []).find((a) => a.name === abilityName);
  if (wepAb) return wepAb;
  const sp = (weaponsData.mageSpecialAbilities[key] || []).find((a) => a.name === abilityName);
  return sp || null;
}

// Effective attack range: ability range if an ability is used, else weapon range (min 1).
function getAttackRange(character, ability) {
  if (ability && Number(ability.range)) return Math.max(1, Number(ability.range));
  const w = getWeaponStats(character);
  return Math.max(1, num(w.range) || 1);
}

function manhattan(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function inRange(fromPos, toPos, range) {
  if (!fromPos || !toPos) return false;
  const d = manhattan(fromPos, toPos);
  return d > 0 && d <= range;
}

// Terrain rule for a single orthogonal step from tile `a` to adjacent tile `b`
// (each is { hg, stairs }):
//   - Entering high ground (b.hg) is only allowed from a stair or high-ground tile.
//   - Leaving high ground (a.hg) is only allowed onto a stair or high-ground tile.
function stepAllowed(a, b) {
  if (a.hg && !(b.hg || b.stairs)) return false;
  if (b.hg && !(a.hg || a.stairs)) return false;
  return true;
}

// Breadth-first reachable cells from `start` within `budget` steps. Movement is
// 4-directional; each step costs 1; units block the path; terrain obeys stepAllowed.
// tileAt(r,c) -> { hg, stairs }; isBlocked(r,c) -> bool (an enemy/ally occupies it).
// Returns { cells: Set("r:c"), dist: Map("r:c" -> steps) } (excludes the start cell).
function reachable(start, budget, tileAt, isBlocked, rows, cols) {
  const k = (r, c) => r + ":" + c;
  const dist = new Map([[k(start.r, start.c), 0]]);
  const cells = new Set();
  const q = [{ r: start.r, c: start.c }];
  for (let head = 0; head < q.length; head++) {
    const cur = q[head];
    const d = dist.get(k(cur.r, cur.c));
    if (d >= budget) continue;
    const a = tileAt(cur.r, cur.c);
    const nbrs = [[cur.r - 1, cur.c], [cur.r + 1, cur.c], [cur.r, cur.c - 1], [cur.r, cur.c + 1]];
    for (const [nr, nc] of nbrs) {
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nk = k(nr, nc);
      if (dist.has(nk) || isBlocked(nr, nc)) continue;
      if (!stepAllowed(a, tileAt(nr, nc))) continue;
      dist.set(nk, d + 1);
      cells.add(nk);
      q.push({ r: nr, c: nc });
    }
  }
  return { cells, dist };
}

// Full stat block for a character. `ability` (optional) folds its stat deltas + hit% into the attack.
// `defMult` (default 1) scales the BASE defense stat — used for terrain "Def" effects so it
// propagates to everything defense feeds: melee protection AND block.
function computeAllStats(character, ability, defMult = 1) {
  const weapon = getWeaponStats(character);
  const mage = isMage(character);
  const ab = ability || {};

  const wStr = num(weapon.str) + num(ab.str);
  const wMgk = num(weapon.mgk) + num(ab.mgk);
  const wDef = num(weapon.def) + num(ab.def);
  const wRes = num(weapon.res) + num(ab.res);
  const wSpd = num(weapon.spd) + num(ab.spd);
  const wSkl = num(weapon.skl) + num(ab.skl);
  const wKnl = num(weapon.knl) + num(ab.knl);
  const wLck = num(weapon.lck) + num(ab.lck);

  const dfBase = num(character.defense) * defMult; // terrain Def multiplier hits the base defense stat
  const power = mage ? num(character.magick) + wMgk : num(character.strength) + wStr;
  const prot = {
    melee: dfBase + wDef,
    magic: num(character.resistance) + wRes,
  };

  const spd = num(character.speed) + wSpd;
  const skl = num(character.skill) + wSkl;
  const knl = num(character.knowledge) + wKnl;
  const lck = num(character.luck) + wLck;
  const def = dfBase + wDef;
  const res = num(character.resistance) + wRes;

  // Size modifiers (ColorsV2 BattleScreen.js:145-165)
  const size = num(character.size);
  let sizePower = 0, sizeAgility = 0, sizeAccuracy = 0, sizeEvasion = 0;
  if (size === 1) { sizeAgility = 1; sizeEvasion = 1; sizeAccuracy = -2; }
  else if (size === 2) { sizeEvasion = 2; sizePower = -1; }
  else if (size === 3) { sizePower = 1; sizeEvasion = -2; }
  else if (size === 4) { sizeAccuracy = 2; sizePower = 1; sizeAgility = -1; }

  // Weapon-type multipliers (ColorsV2 BattleScreen.js:167-196)
  const wepKey = String(character.base_weapon || "").toLowerCase();
  let wepPowerMult = 1, wepAgilityMult = 1, wepAccuracyMult = 1, wepEvasionMult = 1, wepProtMult = 1, wepLuckMult = 1;
  if (wepKey === "axe" || wepKey === "fire") wepPowerMult = 1.5;
  else if (wepKey === "sword" || wepKey === "water") wepEvasionMult = 1.5;
  else if (wepKey === "dagger" || wepKey === "lightning") wepAgilityMult = 1.5;
  else if (wepKey === "lance" || wepKey === "earth") wepProtMult = 1.5;
  else if (wepKey === "bow" || wepKey === "aether") wepAccuracyMult = 1.5;
  else if (wepKey === "wind") { wepAccuracyMult = 1.25; wepEvasionMult = 1.25; }
  else if (wepKey === "light") { wepProtMult = 1.25; wepAccuracyMult = 1.25; }
  else if (wepKey === "dark") { wepPowerMult = 1.25; wepProtMult = 1.25; }
  else if (wepKey === "gauntlets" || wepKey === "gray") wepLuckMult = 1.5;

  const adjLck = lck * wepLuckMult;
  const hitBase = ab["hit%"] != null ? num(ab["hit%"]) : num(weapon["hit%"]);

  return {
    isMage: mage,
    hitBase,
    power: Math.round((power + sizePower) * wepPowerMult),
    protection: {
      melee: Math.round(prot.melee * wepProtMult),
      magic: Math.round(prot.magic * wepProtMult),
    },
    agility: Math.round((spd + sizeAgility) * wepAgilityMult),
    accuracy: Math.round(Math.ceil(0.5 * spd + 0.5 * skl + 1 * knl + 0.5 * adjLck) * wepAccuracyMult + sizeAccuracy),
    evasion: Math.round(Math.ceil(0.5 * spd + 1 * skl + 0.5 * knl + 0.5 * adjLck) * wepEvasionMult + sizeEvasion),
    critical: Math.ceil(0.5 * spd + 0.5 * skl + 0.5 * knl + 1 * adjLck),
    block: def + res + adjLck,
    luck: lck,
  };
}

// Resolve a single strike from src -> tgt. Returns { type, damage }.
// type: "miss" | "block" | "hit" | "crit"
function strike(srcStats, tgtStats, rng) {
  const prot = srcStats.isMage ? tgtStats.protection.magic : tgtStats.protection.melee;
  const baseDamage = Math.max(0, Math.round(srcStats.power - prot));

  const hitPct = Math.max(0, Math.min(100, Math.round(srcStats.hitBase + (srcStats.accuracy - tgtStats.evasion))));
  if (rng() * 100 >= hitPct || baseDamage <= 0) return { type: "miss", damage: 0, hitPct };

  const blkPct = Math.max(0, Math.floor(tgtStats.block - srcStats.accuracy));
  if (rng() * 100 < blkPct) return { type: "block", damage: 0, hitPct, blkPct };

  // Critical: V2 computed this but only displayed it; V3 applies a 1.5x multiplier on crit.
  const critPct = Math.max(0, Math.round(srcStats.critical - tgtStats.luck));
  if (rng() * 100 < critPct) return { type: "crit", damage: Math.round(baseDamage * 1.5), hitPct, critPct };

  return { type: "hit", damage: baseDamage, hitPct };
}

// ── Terrain combat effects ──────────────────────────────────────────────────
// Per-terrain stat multipliers (applied to the unit standing on that tile during combat).
// def multiplies melee protection (the defense base stat); acc/eva multiply the derived stats.
const TERRAIN_FX = {
  town: { def: 1.1, acc: 0.85, eva: 1.15 },
  castle: { def: 1.15, acc: 1.15, eva: 1.15 },
  forest: { eva: 1.2 },
  fort: { def: 1.1, acc: 1.1, eva: 1.15 },
  water: { acc: 0.85, eva: 0.85 },
  desert: { acc: 0.8, eva: 0.8 },
  mountain: { acc: 1.15, eva: 0.85 },
};
const NORMAL_TILE = { t: "normal", hg: false };

// High ground is a relative ACCURACY edge: the high unit ×1.15, the low foe ×0.85 — only when
// exactly one of them is on high ground.
function highGroundAcc(ownTile, oppTile) {
  if (ownTile.hg && !oppTile.hg) return 1.15;
  if (!ownTile.hg && oppTile.hg) return 0.85;
  return 1;
}

// Terrain Def multiplier for a tile (scales the BASE defense stat via computeAllStats,
// so it reaches both melee protection and block).
function defMultFor(tile) {
  return (TERRAIN_FX[(tile || NORMAL_TILE).t] || {}).def || 1;
}

// Apply the DERIVED-stat terrain effects (accuracy, evasion) + high-ground accuracy edge.
// (The Def multiplier is applied earlier, inside computeAllStats, on the base defense stat.)
function applyTerrain(stats, ownTile, oppTile) {
  ownTile = ownTile || NORMAL_TILE;
  oppTile = oppTile || NORMAL_TILE;
  const fx = TERRAIN_FX[ownTile.t] || {};
  const hgAcc = highGroundAcc(ownTile, oppTile);
  return {
    ...stats,
    accuracy: Math.round(stats.accuracy * (fx.acc || 1) * hgAcc),
    evasion: Math.round(stats.evasion * (fx.eva || 1)),
  };
}

// Resolve the full exchange: A1 -> D1 -> A2 -> D2, stopping when someone reaches 0 HP.
// attacker/defender are character rows (with current `health`). `abilityName` optional for the attacker.
// atkTile/defTile are { t, hg } for terrain effects. rng defaults to Math.random (pass seeded for tests).
function resolveExchange(attacker, defender, abilityName, defenderCanCounter, atkTile = NORMAL_TILE, defTile = NORMAL_TILE, rng = Math.random) {
  const ability = findAbility(attacker, abilityName);
  const atk = applyTerrain(computeAllStats(attacker, ability, defMultFor(atkTile)), atkTile, defTile);
  const def = applyTerrain(computeAllStats(defender, null, defMultFor(defTile)), defTile, atkTile);

  const type = ability ? ability.type : "Damage";
  const isMaiming = type === "Maiming";     // a landed attacker strike cancels the matching counter
  const isObscuring = type === "Obscuring"; // once the attacker lands, all later counters get acc x0.5

  let atkHp = num(attacker.health);
  let defHp = num(defender.health);
  let attackerLanded = false; // has any attacker strike connected? (drives obscuring)
  const events = [];
  const landed = (r) => r.type === "hit" || r.type === "crit";

  // returns whether the attacker's strike landed (used by Maiming to cancel the next counter)
  const doAtk = (label) => {
    const r = strike(atk, def, rng);
    if (landed(r)) attackerLanded = true;
    defHp = Math.max(0, defHp - r.damage);
    events.push({ step: label, by: "attacker", attackerId: attacker.id, targetId: defender.id, ...r, defenderHp: defHp, attackerHp: atkHp });
    return { alive: defHp > 0, landed: landed(r) };
  };
  const doDef = (label) => {
    // Obscuring: the defender's counter accuracy is halved once the attacker has landed a hit.
    const defStats = isObscuring && attackerLanded ? { ...def, accuracy: Math.round(def.accuracy * 0.5) } : def;
    const r = strike(defStats, atk, rng);
    atkHp = Math.max(0, atkHp - r.damage);
    events.push({ step: label, by: "defender", attackerId: defender.id, targetId: attacker.id, ...r, defenderHp: defHp, attackerHp: atkHp });
    return atkHp > 0;
  };

  // A1
  const a1 = doAtk("A1");
  if (!a1.alive) return finish();
  // D1 — skipped if Maiming and A1 connected
  if (defenderCanCounter && !(isMaiming && a1.landed)) { if (!doDef("D1")) return finish(); }
  // A2
  const a2 = doAtk("A2");
  if (!a2.alive) return finish();
  // D2 — skipped if Maiming and A2 connected
  if (defenderCanCounter && !(isMaiming && a2.landed)) { doDef("D2"); }
  return finish();

  function finish() {
    // attackerHit lets the caller apply on-hit effects (e.g. Injuring) only when an attack connected.
    return { events, attackerHp: atkHp, defenderHp: defHp, attackerHit: attackerLanded };
  }
}

module.exports = {
  getWeaponStats,
  isMage,
  getMoveValue,
  findAbility,
  getAttackRange,
  manhattan,
  inRange,
  stepAllowed,
  reachable,
  computeAllStats,
  applyTerrain,
  TERRAIN_FX,
  strike,
  resolveExchange,
};
