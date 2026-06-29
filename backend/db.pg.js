// PostgreSQL store (cloud / production). Used when DATABASE_URL is set.
// Same async interface as db.sqlite.js so server.js doesn't care which is active.
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Managed Postgres (Neon, Render, Supabase) require SSL. Set PGSSL=disable for a
  // plain local Postgres without TLS.
  ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      username   TEXT NOT NULL,
      password   TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- case-insensitive unique usernames (parity with SQLite COLLATE NOCASE)
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));

    CREATE TABLE IF NOT EXISTS teams (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS characters (
      id          SERIAL PRIMARY KEY,
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
      luck        INTEGER NOT NULL,
      efficient_against TEXT
    );
  `);
  await q("ALTER TABLE characters ADD COLUMN IF NOT EXISTS efficient_against TEXT"); // migrate older DBs
  console.log("Postgres schema ready");
}

const q = (text, params) => pool.query(text, params);
const safeParse = (s) => { try { return JSON.parse(s || "[]"); } catch { return []; } };
const hydrate = (c) => (c ? { ...c, abilities: safeParse(c.abilities), specials: safeParse(c.specials) } : c);

module.exports = {
  kind: "postgres",
  init,
  async createUser(username, password) {
    const r = await q("INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username", [username, password]);
    return r.rows[0];
  },
  async getUserByName(username) {
    const r = await q("SELECT * FROM users WHERE lower(username) = lower($1)", [username]);
    return r.rows[0];
  },
  async getUserById(id) {
    const r = await q("SELECT id, username FROM users WHERE id = $1", [id]);
    return r.rows[0];
  },
  async createTeam(userId, name) {
    const r = await q("INSERT INTO teams (user_id, name) VALUES ($1, $2) RETURNING *", [userId, name]);
    return r.rows[0];
  },
  async getTeams(userId) {
    const r = await q("SELECT * FROM teams WHERE user_id = $1 ORDER BY id", [userId]);
    return r.rows;
  },
  async getTeam(id) {
    const r = await q("SELECT * FROM teams WHERE id = $1", [id]);
    return r.rows[0];
  },
  async deleteTeam(id, userId) {
    return q("DELETE FROM teams WHERE id = $1 AND user_id = $2", [id, userId]);
  },
  async createCharacter(d) {
    const r = await q(
      `INSERT INTO characters
        (team_id, name, type, size, base_weapon, move_value, abilities, specials,
         health, strength, defense, magick, resistance, speed, skill, knowledge, luck, efficient_against)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [d.team_id, d.name, d.type, d.size, d.base_weapon, d.move_value, d.abilities, d.specials,
       d.health, d.strength, d.defense, d.magick, d.resistance, d.speed, d.skill, d.knowledge, d.luck, d.efficient_against ?? null]
    );
    return hydrate(r.rows[0]);
  },
  async getCharacters(teamId) {
    const r = await q("SELECT * FROM characters WHERE team_id = $1 ORDER BY id", [teamId]);
    return r.rows.map(hydrate);
  },
  async getCharacter(id) {
    const r = await q("SELECT * FROM characters WHERE id = $1", [id]);
    return hydrate(r.rows[0]);
  },
  async updateCharacter(id, d) {
    const r = await q(
      `UPDATE characters SET
         name=$1, type=$2, size=$3, base_weapon=$4, move_value=$5, abilities=$6, specials=$7,
         health=$8, strength=$9, defense=$10, magick=$11, resistance=$12, speed=$13, skill=$14, knowledge=$15, luck=$16,
         efficient_against=$18
       WHERE id=$17 RETURNING *`,
      [d.name, d.type, d.size, d.base_weapon, d.move_value, d.abilities, d.specials,
       d.health, d.strength, d.defense, d.magick, d.resistance, d.speed, d.skill, d.knowledge, d.luck, id, d.efficient_against ?? null]
    );
    return hydrate(r.rows[0]);
  },
  async deleteCharacter(id) {
    return q("DELETE FROM characters WHERE id = $1", [id]);
  },
};
