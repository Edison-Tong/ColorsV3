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

// Full stat block for a character. `ability` (optional) folds its stat deltas + hit% into the attack.
function computeAllStats(character, ability) {
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

  const power = mage ? num(character.magick) + wMgk : num(character.strength) + wStr;
  const prot = {
    melee: num(character.defense) + wDef,
    magic: num(character.resistance) + wRes,
  };

  const spd = num(character.speed) + wSpd;
  const skl = num(character.skill) + wSkl;
  const knl = num(character.knowledge) + wKnl;
  const lck = num(character.luck) + wLck;
  const def = num(character.defense) + wDef;
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

// Resolve the full exchange: A1 -> D1 -> A2 -> D2, stopping when someone reaches 0 HP.
// attacker/defender are character rows (with current `health`). `abilityName` optional for the attacker.
// `defenderCanCounter` is decided by the caller from board positions (defender must reach attacker).
// rng defaults to Math.random; pass a seeded fn for deterministic tests.
function resolveExchange(attacker, defender, abilityName, defenderCanCounter, rng = Math.random) {
  const ability = findAbility(attacker, abilityName);
  const atk = computeAllStats(attacker, ability);
  const def = computeAllStats(defender, null);

  let atkHp = num(attacker.health);
  let defHp = num(defender.health);
  const events = [];

  const doAtk = (label) => {
    const r = strike(atk, def, rng);
    defHp = Math.max(0, defHp - r.damage);
    events.push({ step: label, by: "attacker", attackerId: attacker.id, targetId: defender.id, ...r, defenderHp: defHp, attackerHp: atkHp });
    return defHp > 0;
  };
  const doDef = (label) => {
    const r = strike(def, atk, rng);
    atkHp = Math.max(0, atkHp - r.damage);
    events.push({ step: label, by: "defender", attackerId: defender.id, targetId: attacker.id, ...r, defenderHp: defHp, attackerHp: atkHp });
    return atkHp > 0;
  };

  // A1
  if (!doAtk("A1")) return finish();
  // D1 (only if defender survived and can reach the attacker)
  if (defenderCanCounter) { if (!doDef("D1")) return finish(); }
  // A2
  if (!doAtk("A2")) return finish();
  // D2
  if (defenderCanCounter) { doDef("D2"); }
  return finish();

  function finish() {
    return { events, attackerHp: atkHp, defenderHp: defHp };
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
  computeAllStats,
  strike,
  resolveExchange,
};
