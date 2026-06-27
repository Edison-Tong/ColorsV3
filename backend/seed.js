// Seed the local database with ready-to-battle TEST data. Run: npm run seed
// Re-running OVERWRITES each account's first team in place (clears its champions and
// rebuilds them) so you always get the latest test roster.
//
//   Accounts:  red / pw  (Team A — Crimson Host)   and   blue / pw  (Team B — Azure Guard)
//
// Every champion is an all-purpose TANK: health 38, every other stat at the 4 minimum
// (38 + 8×4 = 70, the stat cap). They soak hits so you can test attack types repeatedly
// without anyone dying too fast.
//
// Between the two teams there is AT LEAST ONE ability of EVERY attack type (19 total), so
// you can exercise each one without editing teams. The map of unit → types it tests:
//
//   Team A (Crimson Host)                    Team B (Azure Guard)
//   • Pyromancer  fire    Burning, Radial    • Stormcaller lightning Shocking, Brave
//   • Cryomancer  water   Freezing, Obscuring• Druid       grass     Absorption, Poisoning
//   • Geomancer   earth   Crushing, Damage   • Breacher    axe       Piercing, Efficiency
//   • Reaver      axe     Maiming, Injuring  • Blinder     sword     Blinding, Damage
//   • Trapper     dagger  Slowing, Immobiliz.• Pikeman     lance     Damage, Radial
//   • Silencer    bow     Silencing, Meteor  • Brawler     gauntlets Damage, Radial
//
// NOTE: Team A intentionally has 3 mages (more than the normal 2-mage cap). That's the only
// way to fit all five magick-only types (Burning/Freezing/Crushing/Shocking/Absorption) into
// two teams. The seed writes rows directly, so it bypasses the in-app composition limits;
// the battle engine doesn't care about mage count, so these teams play fine.
const store = require("./db");
const bcrypt = require("bcryptjs");
const combat = require("./combat");

// All-tank statline: health 38, everything else at the 4 floor (sums to the 70 cap).
const TANK = { health: 38, strength: 4, defense: 4, magick: 4, resistance: 4, speed: 4, skill: 4, knowledge: 4, luck: 4 };
const mkStats = () => ({ ...TANK });

// Team A — Crimson Host (red). Valid size composition: 1×1, 2×2, 2×3, 1×4.
const rosterA = [
  { name: "Pyromancer", type: "mage", size: 2, base_weapon: "fire", abilities: ["Scorch", "Eruption"], specials: ["Bolster", "Ignite", "Wall Of Flame"] }, // Burning, Radial
  { name: "Cryomancer", type: "mage", size: 2, base_weapon: "water", abilities: ["Ice Spear", "Dive"], specials: ["High Tide", "Liquify", "Hail"] },        // Freezing, Obscuring
  { name: "Geomancer", type: "mage", size: 3, base_weapon: "earth", abilities: ["Crush", "Aegis"], specials: ["Stalagmite", "Stone Skin", "Weigh Down"] },  // Crushing, Damage
  { name: "Reaver", type: "melee", size: 4, base_weapon: "axe", abilities: ["Dismember", "Bludgeon"] },                                                     // Maiming, Injuring
  { name: "Trapper", type: "melee", size: 1, base_weapon: "dagger", abilities: ["Stagnate", "Pin"] },                                                       // Slowing, Immobilizing
  { name: "Silencer", type: "melee", size: 3, base_weapon: "bow", abilities: ["Tome Breaker", "Explosive Volley"] },                                        // Silencing, Meteor
];

// Team B — Azure Guard (blue). Valid size composition: 1×1, 2×2, 2×3, 1×4.
const rosterB = [
  { name: "Stormcaller", type: "mage", size: 2, base_weapon: "lightning", abilities: ["Thunder", "Static spd"], specials: ["Kinesia", "Haste", "Charge"] }, // Shocking, Brave
  { name: "Druid", type: "mage", size: 2, base_weapon: "grass", abilities: ["Leech Life", "Pin Needle"], specials: ["Blossom", "Absorb", "Thistle"] },       // Absorption, Poisoning
  { name: "Breacher", type: "melee", size: 4, base_weapon: "axe", abilities: ["Armor Cleaver", "Breaker"] },                                                 // Piercing, Efficiency
  { name: "Blinder", type: "melee", size: 3, base_weapon: "sword", abilities: ["Gouge", "Sword Dance"] },                                                    // Blinding, Damage
  { name: "Pikeman", type: "melee", size: 3, base_weapon: "lance", abilities: ["Javelin", "Spear Sweep"] },                                                  // Damage, Radial
  { name: "Brawler", type: "melee", size: 1, base_weapon: "gauntlets", abilities: ["Disarm", "Vault"] },                                                     // Damage, Radial
];

function buildRow(teamId, c) {
  const stats = mkStats();
  return {
    team_id: teamId,
    name: c.name,
    type: c.type,
    size: c.size,
    base_weapon: c.base_weapon,
    move_value: combat.getMoveValue({ type: c.type, base_weapon: c.base_weapon }),
    abilities: JSON.stringify(c.abilities),
    specials: JSON.stringify(c.type === "mage" ? c.specials || [] : []),
    health: stats.health, strength: stats.strength, defense: stats.defense, magick: stats.magick,
    resistance: stats.resistance, speed: stats.speed, skill: stats.skill, knowledge: stats.knowledge, luck: stats.luck,
  };
}

async function ensureUser(username, password) {
  let u = await store.getUserByName(username);
  if (u) { console.log(`• user "${username}" already exists (id ${u.id})`); return u; }
  const hash = await bcrypt.hash(password, 10);
  u = await store.createUser(username, hash);
  console.log(`✓ created user "${username}" (id ${u.id})`);
  return u;
}

// Overwrite the user's first team in place (or create it), then (re)populate from `roster`.
async function ensureTeam(userId, name, roster) {
  const teams = await store.getTeams(userId);
  let team = teams[0];
  if (team) {
    const existing = await store.getCharacters(team.id);
    for (const ch of existing) await store.deleteCharacter(ch.id);
    console.log(`  • cleared ${existing.length} old champions from "${team.name}"`);
  } else {
    team = await store.createTeam(userId, name);
    console.log(`  ✓ created team "${name}"`);
  }
  for (const c of roster) await store.createCharacter(buildRow(team.id, c));
  console.log(`  ✓ "${team.name}" now fields ${roster.length} tank champions`);
}

(async () => {
  await store.init();
  const red = await ensureUser("red", "pw");
  await ensureTeam(red.id, "Crimson Host", rosterA);
  const blue = await ensureUser("blue", "pw");
  await ensureTeam(blue.id, "Azure Guard", rosterB);
  console.log("\nSeed complete. Log in as  red/pw  (Crimson Host)  or  blue/pw  (Azure Guard).");
  console.log("Between the two teams, every one of the 19 attack types is represented for testing.");
  process.exit(0);
})().catch((e) => { console.error("Seed failed:", e.message); process.exit(1); });
