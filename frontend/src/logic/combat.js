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

export function getAttackRange(character, ability) {
  if (ability && Number(ability.range)) return Math.max(1, Number(ability.range));
  const w = getWeaponStats(character);
  return Math.max(1, num(w.range) || 1);
}

export function manhattan(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

export function inRange(fromPos, toPos, range) {
  if (!fromPos || !toPos) return false;
  const d = manhattan(fromPos, toPos);
  return d > 0 && d <= range;
}

export function computeAllStats(character, ability) {
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
  const prot = { melee: num(character.defense) + wDef, magic: num(character.resistance) + wRes };

  const spd = num(character.speed) + wSpd;
  const skl = num(character.skill) + wSkl;
  const knl = num(character.knowledge) + wKnl;
  const lck = num(character.luck) + wLck;
  const def = num(character.defense) + wDef;
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

  const adjLck = lck * wepLuckMult;
  const hitBase = ab["hit%"] != null ? num(ab["hit%"]) : num(weapon["hit%"]);

  return {
    isMage: mage,
    hitBase,
    power: Math.round((power + sizePower) * wepPowerMult),
    protection: { melee: Math.round(prot.melee * wepProtMult), magic: Math.round(prot.magic * wepProtMult) },
    agility: Math.round((spd + sizeAgility) * wepAgilityMult),
    accuracy: Math.round(Math.ceil(0.5 * spd + 0.5 * skl + 1 * knl + 0.5 * adjLck) * wepAccuracyMult + sizeAccuracy),
    evasion: Math.round(Math.ceil(0.5 * spd + 1 * skl + 0.5 * knl + 0.5 * adjLck) * wepEvasionMult + sizeEvasion),
    critical: Math.ceil(0.5 * spd + 0.5 * skl + 0.5 * knl + 1 * adjLck),
    block: def + res + adjLck,
    luck: lck,
  };
}

// Estimate the % chance and damage of a strike for the attack-preview modal.
export function previewStrike(attacker, defender, ability) {
  const a = computeAllStats(attacker, ability);
  const d = computeAllStats(defender, null);
  const prot = a.isMage ? d.protection.magic : d.protection.melee;
  const damage = Math.max(0, Math.round(a.power - prot));
  const hitPct = Math.max(0, Math.min(100, Math.round(a.hitBase + (a.accuracy - d.evasion))));
  const blockPct = Math.max(0, Math.floor(d.block - a.accuracy));
  const critPct = Math.max(0, Math.round(a.critical - d.luck));
  return { damage, hitPct, blockPct, critPct };
}
