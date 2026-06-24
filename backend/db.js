// ColorsV3 — SQLite persistence (better-sqlite3, zero-config, file-based).
// Stores users, teams, and characters. Rooms/battles live in memory in server.js.

const path = require("path");
const Database = require("better-sqlite3");

// Real data lives in colorsv3.db. Tests override COLORSV3_DB to a throwaway file so
// they can never touch your real users/teams/characters.
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
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id      INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL,            -- 'melee' | 'mage'
    size         INTEGER NOT NULL,         -- 1..4
    base_weapon  TEXT NOT NULL,
    move_value   INTEGER NOT NULL,
    abilities    TEXT NOT NULL DEFAULT '[]',  -- JSON array of 2 weapon-ability names
    specials     TEXT NOT NULL DEFAULT '[]',  -- JSON array of 3 mage-special names (mages only)
    health       INTEGER NOT NULL,
    strength     INTEGER NOT NULL,
    defense      INTEGER NOT NULL,
    magick       INTEGER NOT NULL,
    resistance   INTEGER NOT NULL,
    speed        INTEGER NOT NULL,
    skill        INTEGER NOT NULL,
    knowledge    INTEGER NOT NULL,
    luck         INTEGER NOT NULL
  );
`);

// ---- Users ----
const insertUser = db.prepare("INSERT INTO users (username, password) VALUES (?, ?) RETURNING id, username");
const findUserByName = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE");
const findUserById = db.prepare("SELECT id, username FROM users WHERE id = ?");

// ---- Teams ----
const insertTeam = db.prepare("INSERT INTO teams (user_id, name) VALUES (?, ?) RETURNING *");
const teamsForUser = db.prepare("SELECT * FROM teams WHERE user_id = ? ORDER BY id");
const teamById = db.prepare("SELECT * FROM teams WHERE id = ?");
const deleteTeamStmt = db.prepare("DELETE FROM teams WHERE id = ? AND user_id = ?");

// ---- Characters ----
const insertCharacter = db.prepare(`
  INSERT INTO characters
    (team_id, name, type, size, base_weapon, move_value, abilities, specials,
     health, strength, defense, magick, resistance, speed, skill, knowledge, luck)
  VALUES
    (@team_id, @name, @type, @size, @base_weapon, @move_value, @abilities, @specials,
     @health, @strength, @defense, @magick, @resistance, @speed, @skill, @knowledge, @luck)
  RETURNING *`);
const charactersForTeam = db.prepare("SELECT * FROM characters WHERE team_id = ? ORDER BY id");
const characterById = db.prepare("SELECT * FROM characters WHERE id = ?");
const deleteCharacterStmt = db.prepare("DELETE FROM characters WHERE id = ?");

// Parse JSON columns into arrays for callers.
function hydrate(char) {
  if (!char) return char;
  return {
    ...char,
    abilities: safeParse(char.abilities),
    specials: safeParse(char.specials),
  };
}
function safeParse(s) {
  try { return JSON.parse(s || "[]"); } catch { return []; }
}

module.exports = {
  db,
  createUser: (username, password) => insertUser.get(username, password),
  getUserByName: (username) => findUserByName.get(username),
  getUserById: (id) => findUserById.get(id),

  createTeam: (userId, name) => insertTeam.get(userId, name),
  getTeams: (userId) => teamsForUser.all(userId),
  getTeam: (id) => teamById.get(id),
  deleteTeam: (id, userId) => deleteTeamStmt.run(id, userId),

  createCharacter: (data) => hydrate(insertCharacter.get(data)),
  getCharacters: (teamId) => charactersForTeam.all(teamId).map(hydrate),
  getCharacter: (id) => hydrate(characterById.get(id)),
  deleteCharacter: (id) => deleteCharacterStmt.run(id),
};
