// Seed the local database with ready-to-battle test data. Run: npm run seed
// Idempotent: re-running won't duplicate users/teams. Creates two accounts, each with
// a full 6-character team, so you can log in and battle immediately.
//
//   Accounts:  red / pw   and   blue / pw
//
// Works against whatever store db.js selects (local SQLite by default).
const store = require("./db");
const bcrypt = require("bcryptjs");
const combat = require("./combat");

const mkStats = (o = {}) => ({ health: 10, strength: 8, defense: 6, magick: 8, resistance: 6, speed: 6, skill: 6, knowledge: 6, luck: 6, ...o });

// A valid 6-character roster: one each of size 4/1, two each of 3/2, with 2 mages.
const roster = [
  { name: "Brick", type: "melee", size: 4, base_weapon: "axe", abilities: ["Ragnarok", "Tomahawk"], stats: mkStats({ strength: 10, defense: 8 }) },
  { name: "Edge", type: "melee", size: 3, base_weapon: "sword", abilities: ["Evasion", "Tipper"], stats: mkStats() },
  { name: "Pike", type: "melee", size: 3, base_weapon: "lance", abilities: ["Javelin", "Guard"], stats: mkStats() },
  { name: "Ember", type: "mage", size: 2, base_weapon: "fire", abilities: ["Incinerate", "Scorch"], specials: ["Ignite", "Spark", "Bolster"], stats: mkStats({ magick: 10 }) },
  { name: "Tide", type: "mage", size: 2, base_weapon: "water", abilities: ["Ice Spear", "Torrent"], specials: ["Hail", "Liquify", "Propel"], stats: mkStats({ magick: 10 }) },
  { name: "Nimble", type: "melee", size: 1, base_weapon: "dagger", abilities: ["Throwing Knives", "Blitz"], stats: mkStats({ speed: 10 }) },
];

function buildRow(teamId, c) {
  return {
    team_id: teamId,
    name: c.name,
    type: c.type,
    size: c.size,
    base_weapon: c.base_weapon,
    move_value: combat.getMoveValue({ type: c.type, base_weapon: c.base_weapon }),
    abilities: JSON.stringify(c.abilities),
    specials: JSON.stringify(c.type === "mage" ? c.specials || [] : []),
    health: c.stats.health, strength: c.stats.strength, defense: c.stats.defense, magick: c.stats.magick,
    resistance: c.stats.resistance, speed: c.stats.speed, skill: c.stats.skill, knowledge: c.stats.knowledge, luck: c.stats.luck,
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

async function ensureTeam(userId, name) {
  const teams = await store.getTeams(userId);
  if (teams.length) { console.log(`  • already has a team ("${teams[0].name}")`); return; }
  const team = await store.createTeam(userId, name);
  for (const c of roster) await store.createCharacter(buildRow(team.id, c));
  console.log(`  ✓ created full team "${name}" (6 champions)`);
}

(async () => {
  await store.init();
  const red = await ensureUser("red", "pw");
  await ensureTeam(red.id, "Crimson Host");
  const blue = await ensureUser("blue", "pw");
  await ensureTeam(blue.id, "Azure Guard");
  console.log("\nSeed complete. Log in as  red/pw  or  blue/pw  — each has a battle-ready team.");
  process.exit(0);
})().catch((e) => { console.error("Seed failed:", e.message); process.exit(1); });
