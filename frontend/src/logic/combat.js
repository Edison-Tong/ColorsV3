// ColorsV3 frontend — client-side mirror of the combat stat math, for previews only.
// The SERVER is authoritative for actual battle resolution; this is just for showing
// computed stats / estimated damage in the UI. Formulas match backend/combat.js.

import { weaponsData } from "../data/weaponsData";

const num = (v) => Number(v) || 0;

export function getWeaponStats(character) {
  const key = String(character.base_weapon || "").toLowerCase();
  return (weaponsData.weapons[key] && weaponsData.weapons[key].stats) || {};
}

export function isMage(character) {
  return String(character.type || "").toLowerCase() === "mage";
}

export function getMoveValue(character) {
  if (typeof character.move_value === "number" && character.move_value > 0) return character.move_value;
  const base = isMage(character) ? 4 : 5;
  return String(character.base_weapon || "").toLowerCase() === "wind" ? base + 1 : base;
}

export function findAbility(character, abilityName) {
  if (!abilityName) return null;
  const key = String(character.base_weapon || "").toLowerCase();
  const wepAb = (weaponsData.weaponAbilities[key] || []).find((a) => a.name === abilityName);
  if (wepAb) return wepAb;
  return (weaponsData.mageSpecialAbilities[key] || []).find((a) => a.name === abilityName) || null;
}

// A range value is a number N (EXACTLY N tiles) or a string "min-max" ("1-2", "2-4"). → { min, max }.
export function parseRange(val) {
  if (typeof val === "number") return { min: val, max: val };
  if (typeof val === "string") {
    const parts = val.split("-").map((x) => parseInt(x, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return { min: parts[0], max: parts[1] };
    const n = parseInt(val, 10);
    if (!isNaN(n)) return { min: n, max: n };
  }
  return { min: 1, max: 1 };
}

export function getRange(character, ability) {
  if (ability && ability.range != null) return parseRange(ability.range);
  const w = getWeaponStats(character);
  return parseRange(w.range != null ? w.range : 1);
}

export function getAttackRange(character, ability) {
  return Math.max(1, getRange(character, ability).max);
}

// Distance for attack/counter: Manhattan + 1 when crossing a height boundary (adjacent high-vs-normal
// reads as distance 2). Mirrors backend/combat.js.
export function combatDistance(aPos, dPos, aTile, dTile) {
  const base = manhattan(aPos, dPos);
  const hgA = !!(aTile && aTile.hg), hgD = !!(dTile && dTile.hg);
  return base + (hgA !== hgD ? 1 : 0);
}

export function withinRange(rangeObj, dist) {
  return dist >= rangeObj.min && dist <= rangeObj.max;
}

export function inAttackRange(aPos, dPos, aTile, dTile, rangeObj) {
  if (!aPos || !dPos) return false;
  return withinRange(rangeObj, combatDistance(aPos, dPos, aTile, dTile));
}

// Max enemies a Radial ability strikes (mirrors backend/combat.js). Infinity = all in range.
export const RADIAL_TARGETS = {
  "Crescent Slash": Infinity, "Rend": 3, "Flurry": 4, "Spear Sweep": 3, "Vault": 3,
  "Eruption": 4, "Torrent": 3, "Quake": 3, "Discharge": 4, "Natures Grasp": 3,
  "Gust": 3, "Ostracism": 2, "Tentatio": 3, "Fortuna's Choice": 3,
};

export function manhattan(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

export function inRange(fromPos, toPos, range) {
  if (!fromPos || !toPos) return false;
  const d = manhattan(fromPos, toPos);
  return d > 0 && d <= range;
}

// Terrain rule for one orthogonal step from tile `a` to adjacent `b` (each { hg, stairs }):
// high ground may only be entered from / left onto a stair or another high-ground tile.
export function stepAllowed(a, b) {
  if (a.hg && !(b.hg || b.stairs)) return false;
  if (b.hg && !(a.hg || a.stairs)) return false;
  return true;
}

// BFS reachable cells within `budget` steps (4-directional; units block; terrain via stepAllowed).
// tileAt(r,c) -> { hg, stairs }; isBlocked(r,c) -> bool. Returns { cells:Set("r:c"), dist:Map }.
export function reachable(start, budget, tileAt, isBlocked, rows, cols) {
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

export function computeAllStats(character, ability, defMult = 1, efficient = false) {
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
  const prot = { melee: dfBase + wDef, magic: num(character.resistance) + wRes };

  const spd = num(character.speed) + wSpd;
  const skl = num(character.skill) + wSkl;
  const knl = num(character.knowledge) + wKnl;
  const lck = num(character.luck) + wLck;
  const def = dfBase + wDef;
  const res = num(character.resistance) + wRes;

  const size = num(character.size);
  let sizePower = 0, sizeAgility = 0, sizeAccuracy = 0, sizeEvasion = 0;
  if (size === 1) { sizeAgility = 1; sizeEvasion = 1; sizeAccuracy = -2; }
  else if (size === 2) { sizeEvasion = 2; sizePower = -1; }
  else if (size === 3) { sizePower = 1; sizeEvasion = -2; }
  else if (size === 4) { sizeAccuracy = 2; sizePower = 1; sizeAgility = -1; }

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

  // Efficiency: ×1.3 to this melee weapon's signature stat (mirrors backend/combat.js).
  if (efficient) {
    if (wepKey === "axe") wepPowerMult *= 1.3;
    else if (wepKey === "sword") wepEvasionMult *= 1.3;
    else if (wepKey === "dagger") wepAgilityMult *= 1.3;
    else if (wepKey === "lance") wepProtMult *= 1.3;
    else if (wepKey === "bow") wepAccuracyMult *= 1.3;
    else if (wepKey === "gauntlets") wepLuckMult *= 1.3;
  }

  // Timed stat modifiers from mage specials (mirrors backend/combat.js).
  const mods = Array.isArray(character.statuses) ? character.statuses : [];
  const modMult = (stat) => mods.reduce((m, s) => (s.modStat === stat ? m * (Number(s.mult) || 1) : m), 1);

  const adjLck = lck * wepLuckMult * modMult("luck");
  const hitBase = ab["hit%"] != null ? num(ab["hit%"]) : num(weapon["hit%"]);

  return {
    isMage: mage,
    hitBase,
    power: Math.round((power + sizePower) * wepPowerMult * modMult("power")),
    protection: { melee: Math.round(prot.melee * wepProtMult * modMult("protection")), magic: Math.round(prot.magic * wepProtMult * modMult("protection")) },
    agility: Math.round((spd + sizeAgility) * wepAgilityMult * modMult("agility")),
    accuracy: Math.round(Math.ceil(0.5 * spd + 0.5 * skl + 1 * knl + 0.5 * adjLck) * wepAccuracyMult * modMult("accuracy") + sizeAccuracy),
    evasion: Math.round(Math.ceil(0.5 * spd + 1 * skl + 0.5 * knl + 0.5 * adjLck) * wepEvasionMult * modMult("evasion") + sizeEvasion),
    critical: Math.round(Math.ceil(0.5 * spd + 0.5 * skl + 0.5 * knl + 1 * adjLck) * modMult("critical")),
    block: (def + res + adjLck) * modMult("block"),
    luck: lck * modMult("luck"),
  };
}

// ── Terrain combat effects (mirrors backend/combat.js) ──────────────────────
export const TERRAIN_FX = {
  town: { def: 1.1, acc: 0.85, eva: 1.15 },
  castle: { def: 1.15, acc: 1.15, eva: 1.15 },
  forest: { eva: 1.2 },
  fort: { def: 1.1, acc: 1.1, eva: 1.15 },
  water: { acc: 0.85, eva: 0.85 },
  desert: { acc: 0.8, eva: 0.8 },
  mountain: { acc: 1.15, eva: 0.85 },
};
const NORMAL_TILE = { t: "normal", hg: false };

export function highGroundAcc(ownTile, oppTile) {
  if (ownTile.hg && !oppTile.hg) return 1.15;
  if (!ownTile.hg && oppTile.hg) return 0.85;
  return 1;
}

export function defMultFor(tile) {
  return (TERRAIN_FX[(tile || NORMAL_TILE).t] || {}).def || 1;
}

// Derived-stat terrain effects (accuracy, evasion) + high-ground accuracy edge. The Def
// multiplier is applied earlier via computeAllStats (on the base defense stat).
export function applyTerrain(stats, ownTile, oppTile) {
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

// Estimate the % chance and damage of a strike for the attack-preview modal, terrain included.
export function previewStrike(attacker, defender, ability, atkTile, defTile) {
  const a = applyTerrain(computeAllStats(attacker, ability, defMultFor(atkTile)), atkTile, defTile);
  const d = applyTerrain(computeAllStats(defender, null, defMultFor(defTile)), defTile, atkTile);
  // Piercing ignores the target's protection.
  const piercing = ability && ability.type === "Piercing";
  const prot = piercing ? 0 : a.isMage ? d.protection.magic : d.protection.melee;
  const damage = Math.max(0, Math.round(a.power - prot));
  // Blinding halves the attacker's accuracy while afflicted.
  const blinded = Array.isArray(attacker.statuses) && attacker.statuses.some((s) => s.type === "blinded");
  const acc = blinded ? Math.round(a.accuracy * 0.5) : a.accuracy;
  const hitPct = Math.max(0, Math.min(100, Math.round(a.hitBase + (acc - d.evasion))));
  const blockPct = Math.max(0, Math.floor(d.block - acc));
  const critPct = Math.max(0, Math.round(a.critical - d.luck));
  return { damage, hitPct, blockPct, critPct };
}

const hasStat = (u, t) => Array.isArray(u && u.statuses) && u.statuses.some((s) => s.type === t);
const clampPct = (v) => Math.max(0, Math.min(100, Math.round(v)));

// Full two-sided preview of a 1v1 exchange (mirrors backend resolveExchange's structure WITHOUT
// rolling dice). Shows each side's per-strike odds, how many strikes each lands, the strike order,
// the agility picture, and which side (if any) earns a bonus strike. `defenderCanCounter` is the
// caller's range/injury check (a unit whose reach can't cover the attacker can't counter).
export function previewExchange(attacker, defender, ability, atkTile, defTile, defenderCanCounter) {
  const efficient = !!(ability && ability.type === "Efficiency" && attacker.efficient_against &&
    String(defender.base_weapon || "").toLowerCase() === String(attacker.efficient_against).toLowerCase());
  const a = applyTerrain(computeAllStats(attacker, ability, defMultFor(atkTile), efficient), atkTile, defTile);
  const d = applyTerrain(computeAllStats(defender, null, defMultFor(defTile)), defTile, atkTile);
  const type = ability ? ability.type : "Damage";
  const piercing = type === "Piercing";

  const aAcc = hasStat(attacker, "blinded") ? Math.round(a.accuracy * 0.5) : a.accuracy;
  const dAcc = hasStat(defender, "blinded") ? Math.round(d.accuracy * 0.5) : d.accuracy;

  // Attacker striking the defender (Piercing move OR a pierced defender => protection 0).
  const aProt = (piercing || hasStat(defender, "pierced")) ? 0 : a.isMage ? d.protection.magic : d.protection.melee;
  const dProtAtk = hasStat(attacker, "pierced") ? 0 : null; // attacker's prot when countered (pierced => 0)
  const atkSide = {
    damage: Math.max(0, Math.round(a.power - aProt)),
    hitPct: clampPct(a.hitBase + (aAcc - d.evasion)),
    blockPct: Math.max(0, Math.floor(d.block - aAcc)),
    critPct: Math.max(0, Math.round(a.critical - d.luck)),
  };
  // Defender countering with its basic weapon (a pierced attacker takes the counter with 0 protection).
  const dProt = dProtAtk != null ? dProtAtk : d.isMage ? a.protection.magic : a.protection.melee;
  const defSide = {
    damage: Math.max(0, Math.round(d.power - dProt)),
    hitPct: clampPct(d.hitBase + (dAcc - a.evasion)),
    blockPct: Math.max(0, Math.floor(a.block - dAcc)),
    critPct: Math.max(0, Math.round(d.critical - a.luck)),
  };

  // Strike counts + order (mirror of resolveExchange).
  const aSlow = hasStat(attacker, "slowed"), dSlow = hasStat(defender, "slowed");
  const isBrave = type === "Brave";
  const attackerEdge = a.agility >= d.agility + 4;
  const defenderEdge = d.agility >= a.agility + 4;
  const attackerDouble = (isBrave || attackerEdge) && !aSlow;
  const defenderDouble = defenderEdge && !dSlow;
  atkSide.strikes = attackerDouble ? 2 : 1;
  defSide.strikes = defenderCanCounter ? (defenderDouble ? 2 : 1) : 0;

  const order = [];
  if (isBrave && attackerDouble) {
    order.push("A1", "A2");
    if (defSide.strikes >= 1) order.push("D1");
    if (defSide.strikes >= 2) order.push("D2");
  } else {
    order.push("A1");
    if (defSide.strikes >= 1) order.push("D1");
    if (attackerDouble) order.push("A2");
    if (defSide.strikes >= 2) order.push("D2");
  }

  return {
    type,
    attacker: atkSide,
    defender: defSide,
    order,
    agility: { atk: a.agility, def: d.agility, attackerDouble, defenderDouble, attackerEdge, defenderEdge },
    statuses: { attacker: attacker.statuses || [], defender: defender.statuses || [] },
  };
}
