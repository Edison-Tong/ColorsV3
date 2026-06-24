// Pretty-print everything in the database. Run: npm run db:view
const path = require("path");
const Database = require("better-sqlite3");

const file = process.env.COLORSV3_DB || path.join(__dirname, "colorsv3.db");
const db = new Database(file, { readonly: true, fileMustExist: false });

console.log(`\nDatabase: ${file}\n${"=".repeat(50)}`);

const users = db.prepare("SELECT id, username, created_at FROM users ORDER BY id").all();
console.log(`\nUSERS (${users.length})`);
console.table(users);

const teams = db.prepare(`
  SELECT t.id, t.user_id, u.username AS owner, t.name,
         (SELECT COUNT(*) FROM characters c WHERE c.team_id = t.id) AS chars
  FROM teams t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.id`).all();
console.log(`\nTEAMS (${teams.length})`);
console.table(teams);

const chars = db.prepare(`
  SELECT c.id, c.team_id, c.name, c.type, c.size, c.base_weapon AS weapon, c.move_value AS move,
         c.health, c.strength AS str, c.defense AS def, c.magick AS mgk, c.resistance AS res,
         c.speed AS spd, c.skill AS skl, c.knowledge AS knl, c.luck AS lck
  FROM characters c ORDER BY c.team_id, c.id`).all();
console.log(`\nCHARACTERS (${chars.length})`);
console.table(chars);

console.log("\nTip: full ability lists ->  sqlite3 backend/colorsv3.db \"SELECT name, abilities, specials FROM characters;\"\n");
