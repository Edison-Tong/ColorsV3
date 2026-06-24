// SQLite store (local dev, zero-config). Async interface so it's swappable with the
// Postgres store. Used when DATABASE_URL is NOT set.
const path = require("path");
const Database = require("better-sqlite3");

const DB_FILE = process.env.COLORSV3_DB || path.join(__dirname, "colorsv3.db");
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password   TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS teams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS characters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    size        INTEGER NOT NULL,
    base_weapon TEXT NOT NULL,
    move_value  INTEGER NOT NULL,
    abilities   TEXT NOT NULL DEFAULT '[]',
    specials    TEXT NOT NULL DEFAULT '[]',
    health      INTEGER NOT NULL,
    strength    INTEGER NOT NULL,
    defense     INTEGER NOT NULL,
    magick      INTEGER NOT NULL,
    resistance  INTEGER NOT NULL,
    speed       INTEGER NOT NULL,
    skill       INTEGER NOT NULL,
    knowledge   INTEGER NOT NULL,
    luck        INTEGER NOT NULL
  );
`);

const stmts = {
  insertUser: db.prepare("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id, username"),
  userByName: db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE"),
  userById: db.prepare("SELECT id, username FROM users WHERE id = ?"),
  insertTeam: db.prepare("INSERT INTO teams (user_id, name) VALUES (?, ?) RETURNING *"),
  teamsForUser: db.prepare("SELECT * FROM teams WHERE user_id = ? ORDER BY id"),
  teamById: db.prepare("SELECT * FROM teams WHERE id = ?"),
  deleteTeam: db.prepare("DELETE FROM teams WHERE id = ? AND user_id = ?"),
  insertCharacter: db.prepare(`
    INSERT INTO characters
      (team_id, name, type, size, base_weapon, move_value, abilities, specials,
       health, strength, defense, magick, resistance, speed, skill, knowledge, luck)
    VALUES
      (@team_id, @name, @type, @size, @base_weapon, @move_value, @abilities, @specials,
       @health, @strength, @defense, @magick, @resistance, @speed, @skill, @knowledge, @luck)
    RETURNING *`),
  charsForTeam: db.prepare("SELECT * FROM characters WHERE team_id = ? ORDER BY id"),
  charById: db.prepare("SELECT * FROM characters WHERE id = ?"),
  deleteCharacter: db.prepare("DELETE FROM characters WHERE id = ?"),
};

const safeParse = (s) => { try { return JSON.parse(s || "[]"); } catch { return []; } };
const hydrate = (c) => (c ? { ...c, abilities: safeParse(c.abilities), specials: safeParse(c.specials) } : c);

module.exports = {
  kind: "sqlite",
  async init() {},
  async createUser(username, password) { return stmts.insertUser.get(username, password); },
  async getUserByName(username) { return stmts.userByName.get(username); },
  async getUserById(id) { return stmts.userById.get(id); },
  async createTeam(userId, name) { return stmts.insertTeam.get(userId, name); },
  async getTeams(userId) { return stmts.teamsForUser.all(userId); },
  async getTeam(id) { return stmts.teamById.get(id); },
  async deleteTeam(id, userId) { return stmts.deleteTeam.run(id, userId); },
  async createCharacter(data) { return hydrate(stmts.insertCharacter.get(data)); },
  async getCharacters(teamId) { return stmts.charsForTeam.all(teamId).map(hydrate); },
  async getCharacter(id) { return hydrate(stmts.charById.get(id)); },
  async deleteCharacter(id) { return stmts.deleteCharacter.run(id); },
};
