// ColorsV3 — Express REST (auth, teams, characters) + Socket.io real-time battle.

require("dotenv").config(); // load backend/.env if present (must run before ./db)
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const http = require("http");
const { Server } = require("socket.io");

const store = require("./db");
const { weaponsData } = require("./weaponsData");
const combat = require("./combat");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// ───────────────────────────── Validation ─────────────────────────────

const STAT_KEYS = ["health", "strength", "defense", "magick", "resistance", "speed", "skill", "knowledge", "luck"];
const STAT_CAP = 70;        // total points per character (ColorsV2 CharCreation)
const STAT_MIN = 4;         // every stat starts at 4
const STAT_MAX = 12;        // per-stat cap, except health which is uncapped
const SIZE_LIMITS = { 1: 1, 2: 2, 3: 2, 4: 1 }; // team-of-6 composition
const MAX_MAGES = 2;

function validateCharacterStats(stats) {
  let total = 0;
  for (const k of STAT_KEYS) {
    const v = Number(stats[k]);
    if (!Number.isInteger(v)) return `Invalid value for ${k}`;
    if (v < STAT_MIN) return `${k} must be at least ${STAT_MIN}`;
    if (k !== "health" && v > STAT_MAX) return `${k} cannot exceed ${STAT_MAX}`;
    total += v;
  }
  if (total > STAT_CAP) return `Stat total ${total} exceeds the ${STAT_CAP} cap`;
  return null;
}

// Composition check against the rest of the team. `incoming` = {type, size}.
function validateComposition(existingChars, incoming) {
  if (existingChars.length >= 6) return "Team already has 6 characters";
  const sizeCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let mages = 0;
  for (const c of existingChars) {
    sizeCounts[Number(c.size)] = (sizeCounts[Number(c.size)] || 0) + 1;
    if (combat.isMage(c)) mages++;
  }
  const size = Number(incoming.size);
  if (!SIZE_LIMITS[size]) return "Size must be 1, 2, 3, or 4";
  if (sizeCounts[size] + 1 > SIZE_LIMITS[size]) return `Team already has the max size-${size} characters`;
  if (String(incoming.type).toLowerCase() === "mage" && mages + 1 > MAX_MAGES) return "Team already has 2 mages";
  return null;
}

function abilitiesValid(character) {
  const key = String(character.base_weapon || "").toLowerCase();
  const weapon = weaponsData.weapons[key];
  if (!weapon) return "Unknown weapon";
  if (String(character.type).toLowerCase() === "mage" && weapon.type !== "magick") return "Mages must use a magick weapon";
  if (String(character.type).toLowerCase() === "melee" && weapon.type !== "melee") return "Melee must use a melee weapon";

  const valid = new Set((weaponsData.weaponAbilities[key] || []).map((a) => a.name));
  if (!Array.isArray(character.abilities) || character.abilities.length !== 2) return "Pick exactly 2 weapon abilities";
  for (const a of character.abilities) if (!valid.has(a)) return `Invalid ability: ${a}`;

  if (String(character.type).toLowerCase() === "mage") {
    const validSp = new Set((weaponsData.mageSpecialAbilities[key] || []).map((a) => a.name));
    if (!Array.isArray(character.specials) || character.specials.length !== 3) return "Mages pick exactly 3 special abilities";
    for (const s of character.specials) if (!validSp.has(s)) return `Invalid special: ${s}`;
  }
  return null;
}

// ───────────────────────────── Auth ─────────────────────────────

// Wrap an async route so any rejection becomes a clean 500 instead of crashing.
const route = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(`${req.method} ${req.path} error:`, e);
  if (!res.headersSent) res.status(500).json({ message: "Server error" });
});

app.post("/register", route(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: "Username and password required" });
  if (await store.getUserByName(username)) return res.status(409).json({ message: "Username already taken" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await store.createUser(username.trim(), hash);
    res.status(201).json({ id: user.id, username: user.username });
  } catch (e) {
    if (/unique|duplicate/i.test(String(e.message))) return res.status(409).json({ message: "Username already taken" });
    throw e;
  }
}));

app.post("/login", route(async (req, res) => {
  const { username, password } = req.body || {};
  const user = await store.getUserByName(username || "");
  if (!user) return res.status(401).json({ message: "Invalid username or password" });
  const ok = await bcrypt.compare(password || "", user.password);
  if (!ok) return res.status(401).json({ message: "Invalid username or password" });
  res.json({ id: user.id, username: user.username });
}));

// ───────────────────────────── Teams ─────────────────────────────

app.get("/teams", route(async (req, res) => {
  const userId = Number(req.query.userId);
  const teamRows = await store.getTeams(userId);
  const teams = await Promise.all(teamRows.map(async (t) => {
    const chars = await store.getCharacters(t.id);
    return { ...t, characters: chars, complete: chars.length === 6 };
  }));
  res.json({ teams });
}));

app.post("/teams", route(async (req, res) => {
  const { userId, name } = req.body || {};
  if (!userId || !name) return res.status(400).json({ message: "userId and name required" });
  const team = await store.createTeam(userId, name.trim());
  res.status(201).json({ team: { ...team, characters: [] } });
}));

app.delete("/teams/:id", route(async (req, res) => {
  await store.deleteTeam(Number(req.params.id), Number(req.query.userId));
  res.json({ ok: true });
}));

app.get("/teams/:id/characters", route(async (req, res) => {
  res.json({ characters: await store.getCharacters(Number(req.params.id)) });
}));

// ───────────────────────────── Characters ─────────────────────────────

// Validate a character payload against the rest of the team and build the DB row.
// `existing` is the OTHER characters to validate composition against (excludes self on edit).
// Returns { error } or { row } (row has no team_id).
function validateAndBuildCharacter(body, existing) {
  const { name, type, size, base_weapon, abilities, specials, stats } = body || {};
  if (!name || !type || !size || !base_weapon || !stats) return { error: "Missing fields" };

  const compErr = validateComposition(existing, { type, size });
  if (compErr) return { error: compErr };
  const statErr = validateCharacterStats(stats);
  if (statErr) return { error: statErr };
  const abErr = abilitiesValid({ type, base_weapon, abilities: abilities || [], specials: specials || [] });
  if (abErr) return { error: abErr };

  return {
    row: {
      name: name.trim(),
      type: String(type).toLowerCase(),
      size: Number(size),
      base_weapon: String(base_weapon).toLowerCase(),
      move_value: combat.getMoveValue({ type, base_weapon }),
      abilities: JSON.stringify(abilities || []),
      specials: JSON.stringify(type === "mage" ? specials || [] : []),
      health: Number(stats.health), strength: Number(stats.strength), defense: Number(stats.defense),
      magick: Number(stats.magick), resistance: Number(stats.resistance), speed: Number(stats.speed),
      skill: Number(stats.skill), knowledge: Number(stats.knowledge), luck: Number(stats.luck),
    },
  };
}

app.post("/teams/:id/characters", route(async (req, res) => {
  const teamId = Number(req.params.id);
  const team = await store.getTeam(teamId);
  if (!team) return res.status(404).json({ message: "Team not found" });

  const existing = await store.getCharacters(teamId);
  const { error, row } = validateAndBuildCharacter(req.body, existing);
  if (error) return res.status(400).json({ message: error });

  const character = await store.createCharacter({ team_id: teamId, ...row });
  res.status(201).json({ character });
}));

app.put("/characters/:id", route(async (req, res) => {
  const id = Number(req.params.id);
  const current = await store.getCharacter(id);
  if (!current) return res.status(404).json({ message: "Character not found" });

  // Validate composition against the OTHER characters on the team (exclude this one).
  const teammates = (await store.getCharacters(current.team_id)).filter((c) => c.id !== id);
  const { error, row } = validateAndBuildCharacter(req.body, teammates);
  if (error) return res.status(400).json({ message: error });

  const character = await store.updateCharacter(id, row);
  res.json({ character });
}));

app.delete("/characters/:id", route(async (req, res) => {
  await store.deleteCharacter(Number(req.params.id));
  res.json({ ok: true });
}));

// Friendly landing so the root URL doesn't look broken ("Cannot GET /").
app.get("/", (_req, res) => res.type("text").send("⚔️ ColorsV3 backend is running. Health check: /ping"));

// Expose static game data so the frontend and any tools share one source.
app.get("/gamedata", (_req, res) => res.json(weaponsData));
app.get("/ping", (_req, res) => res.json({ ok: true }));

// ───────────────────────────── Battle (Socket.io) ─────────────────────────────

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const BOARD_ROWS = 6;
const BOARD_COLS = 8;
const rooms = {}; // code -> room

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms[code]);
  return code;
}

// Snapshot a team's characters into battle units keyed by id.
function buildUnits(ownerId, characters) {
  const units = {};
  for (const c of characters) {
    units[c.id] = { ...c, ownerId, maxHealth: c.health, health: c.health, alive: true };
  }
  return units;
}

// Initial placement: host along bottom (row 5), joiner along top (row 0). Centered in 8 cols.
function placeTeam(ids, side) {
  const positions = {};
  const startCol = Math.floor((BOARD_COLS - ids.length) / 2); // center
  const row = side === "host" ? BOARD_ROWS - 1 : 0;
  const overflowRow = side === "host" ? BOARD_ROWS - 2 : 1;
  ids.forEach((id, i) => {
    if (i < BOARD_COLS) positions[id] = { r: row, c: i };
    else positions[id] = { r: overflowRow, c: i % BOARD_COLS };
  });
  // re-center first-row pieces
  ids.slice(0, BOARD_COLS).forEach((id, i) => (positions[id] = { r: row, c: startCol + i }));
  return positions;
}

function publicState(room) {
  const b = room.battle;
  return {
    code: room.code,
    hostId: room.hostId,
    joinerId: room.joinerId,
    turnUserId: b.turnUserId,
    over: b.over,
    winnerId: b.winnerId,
    units: b.units,
    positions: b.positions,
    moveRemaining: b.moveRemaining,
    acted: b.acted,
    rows: BOARD_ROWS,
    cols: BOARD_COLS,
  };
}

function broadcast(room) {
  io.to(room.code).emit("state", publicState(room));
}

function occupant(room, r, c) {
  for (const [id, p] of Object.entries(room.battle.positions)) {
    if (p.r === r && p.c === c) return Number(id);
  }
  return null;
}

function checkWin(room) {
  const b = room.battle;
  const aliveByOwner = {};
  for (const u of Object.values(b.units)) {
    if (u.alive) aliveByOwner[u.ownerId] = (aliveByOwner[u.ownerId] || 0) + 1;
  }
  const hostAlive = aliveByOwner[room.hostId] || 0;
  const joinAlive = aliveByOwner[room.joinerId] || 0;
  if (hostAlive === 0 || joinAlive === 0) {
    b.over = true;
    b.winnerId = hostAlive === 0 ? room.joinerId : room.hostId;
  }
}

function startBattle(room) {
  const b = room.battle;
  const first = Math.random() < 0.5 ? room.hostId : room.joinerId;
  b.turnUserId = first;
  b.moveRemaining = {}; // per-unit movement budget for the turn; defaults to full move when absent
  b.acted = {};
  b.over = false;
  b.winnerId = null;
  io.to(room.code).emit("battleStart", { ...publicState(room), firstUserId: first });
}

io.on("connection", (socket) => {
  socket.data.code = null;

  // Wrap handlers so exceptions (sync or async) surface in logs instead of being swallowed.
  const on = (ev, fn) =>
    socket.on(ev, (...args) => {
      const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] : null;
      Promise.resolve()
        .then(() => fn(...args))
        .catch((e) => {
          console.error(`socket handler '${ev}' error:`, e);
          if (cb) cb({ error: "Server error: " + e.message });
        });
    });

  // Host creates a room with their team.
  on("host", async ({ userId, username, teamId }, cb) => {
    const chars = await store.getCharacters(Number(teamId));
    if (chars.length !== 6) return cb && cb({ error: "Team must have 6 characters" });
    const code = genCode();
    rooms[code] = {
      code,
      hostId: Number(userId),
      hostName: username,
      hostSocket: socket.id,
      joinerId: null,
      joinerName: null,
      joinerSocket: null,
      battle: { units: buildUnits(Number(userId), chars), positions: {}, turnUserId: null, over: false },
      hostCharIds: chars.map((c) => c.id),
    };
    socket.join(code);
    socket.data.code = code;
    socket.data.userId = Number(userId);
    cb && cb({ code });
  });

  // Joiner enters a code with their team. Both teams present -> battle begins.
  on("join", async ({ userId, username, code, teamId }, cb) => {
    const room = rooms[String(code || "").toUpperCase()];
    if (!room) return cb && cb({ error: "Invalid code" });
    if (room.joinerId) return cb && cb({ error: "Room is full" });
    if (Number(userId) === room.hostId) return cb && cb({ error: "You cannot join your own room" });

    const chars = await store.getCharacters(Number(teamId));
    if (chars.length !== 6) return cb && cb({ error: "Team must have 6 characters" });

    room.joinerId = Number(userId);
    room.joinerName = username;
    room.joinerSocket = socket.id;
    room.joinerCharIds = chars.map((c) => c.id);
    Object.assign(room.battle.units, buildUnits(Number(userId), chars));

    // Place both teams on the board.
    room.battle.positions = {
      ...placeTeam(room.hostCharIds, "host"),
      ...placeTeam(room.joinerCharIds, "joiner"),
    };

    socket.join(room.code);
    socket.data.code = room.code;
    socket.data.userId = Number(userId);

    cb && cb({ code: room.code, hostName: room.hostName });
    io.to(room.code).emit("opponentJoined", { hostName: room.hostName, joinerName: room.joinerName });
    startBattle(room);
  });

  // Move a unit. Validates turn ownership, move budget (Manhattan, no diagonal limit beyond range), occupancy.
  on("move", ({ code, charId, to }, cb) => {
    const room = rooms[code];
    if (!room || !room.battle) return cb && cb({ error: "No battle" });
    const b = room.battle;
    const me = socket.data.userId;
    if (b.over) return cb && cb({ error: "Battle over" });
    if (b.turnUserId !== me) return cb && cb({ error: "Not your turn" });

    const unit = b.units[charId];
    if (!unit || unit.ownerId !== me || !unit.alive) return cb && cb({ error: "Invalid unit" });

    // Movement is a per-turn budget: a unit may move multiple times (and move before
    // or after attacking) as long as it has movement points left. Attacking does not
    // consume movement.
    const remaining = b.moveRemaining[charId] != null ? b.moveRemaining[charId] : combat.getMoveValue(unit);

    const from = b.positions[charId];
    if (!to || to.r < 0 || to.r >= BOARD_ROWS || to.c < 0 || to.c >= BOARD_COLS) return cb && cb({ error: "Off board" });
    const dist = combat.manhattan(from, to);
    if (dist === 0 || dist > remaining) return cb && cb({ error: "Out of move range" });
    if (occupant(room, to.r, to.c)) return cb && cb({ error: "Cell occupied" });

    b.positions[charId] = { r: to.r, c: to.c };
    b.moveRemaining[charId] = remaining - dist;
    cb && cb({ ok: true });
    broadcast(room);
  });

  // Attack. Resolves the A1/D1/A2/D2 exchange server-side.
  on("attack", ({ code, attackerId, defenderId, abilityName }, cb) => {
    const room = rooms[code];
    if (!room || !room.battle) return cb && cb({ error: "No battle" });
    const b = room.battle;
    const me = socket.data.userId;
    if (b.over) return cb && cb({ error: "Battle over" });
    if (b.turnUserId !== me) return cb && cb({ error: "Not your turn" });

    const attacker = b.units[attackerId];
    const defender = b.units[defenderId];
    if (!attacker || attacker.ownerId !== me || !attacker.alive) return cb && cb({ error: "Invalid attacker" });
    if (!defender || defender.ownerId === me || !defender.alive) return cb && cb({ error: "Invalid target" });
    if (b.acted[attackerId]) return cb && cb({ error: "Unit already acted" });

    // Ability must belong to this character.
    if (abilityName && !attacker.abilities.includes(abilityName) && !(attacker.specials || []).includes(abilityName)) {
      return cb && cb({ error: "Unknown ability" });
    }
    const ability = combat.findAbility(attacker, abilityName);
    const range = combat.getAttackRange(attacker, ability);
    const aPos = b.positions[attackerId];
    const dPos = b.positions[defenderId];
    if (!combat.inRange(aPos, dPos, range)) return cb && cb({ error: "Target out of range" });

    // Defender may counter only if it can reach the attacker with its own weapon range.
    const defenderCanCounter = combat.inRange(dPos, aPos, combat.getAttackRange(defender, null));

    const result = combat.resolveExchange(attacker, defender, abilityName, defenderCanCounter);

    attacker.health = result.attackerHp;
    defender.health = result.defenderHp;
    if (attacker.health <= 0) { attacker.alive = false; delete b.positions[attackerId]; }
    if (defender.health <= 0) { defender.alive = false; delete b.positions[defenderId]; }
    b.acted[attackerId] = true; // one attack per unit per turn; movement budget is unaffected

    checkWin(room);

    io.to(room.code).emit("attackResult", {
      attackerId, defenderId, abilityName: abilityName || null,
      events: result.events,
      attackerHp: attacker.health, defenderHp: defender.health,
    });
    cb && cb({ ok: true, events: result.events });
    broadcast(room);
  });

  // Cast a mage special ability. Targets an ally, enemy, or self within the special's
  // range. For now this only consumes the caster's action and notifies both players —
  // the status effects themselves are deferred to a later pass.
  on("cast", ({ code, casterId, targetId, specialName }, cb) => {
    const room = rooms[code];
    if (!room || !room.battle) return cb && cb({ error: "No battle" });
    const b = room.battle;
    const me = socket.data.userId;
    if (b.over) return cb && cb({ error: "Battle over" });
    if (b.turnUserId !== me) return cb && cb({ error: "Not your turn" });

    const caster = b.units[casterId];
    if (!caster || caster.ownerId !== me || !caster.alive) return cb && cb({ error: "Invalid caster" });
    if (b.acted[casterId]) return cb && cb({ error: "Unit already acted" });
    if (!(caster.specials || []).includes(specialName)) return cb && cb({ error: "Unknown special" });

    const special = combat.findAbility(caster, specialName);
    if (!special) return cb && cb({ error: "Unknown special" });

    const target = b.units[targetId];
    if (!target || !target.alive) return cb && cb({ error: "Invalid target" });

    const range = Math.max(1, Number(special.range) || 1);
    const dist = combat.manhattan(b.positions[casterId], b.positions[targetId]);
    if (Number(targetId) !== Number(casterId) && dist > range) return cb && cb({ error: "Target out of range" });

    b.acted[casterId] = true; // casting is the unit's action for the turn

    io.to(room.code).emit("specialResult", {
      casterId, targetId, specialName,
      effect: special.effect, description: special.description,
    });
    cb && cb({ ok: true });
    broadcast(room);
  });

  on("endTurn", ({ code }, cb) => {
    const room = rooms[code];
    if (!room || !room.battle) return cb && cb({ error: "No battle" });
    const b = room.battle;
    if (b.turnUserId !== socket.data.userId) return cb && cb({ error: "Not your turn" });
    b.turnUserId = b.turnUserId === room.hostId ? room.joinerId : room.hostId;
    b.moveRemaining = {};
    b.acted = {};
    cb && cb({ ok: true });
    broadcast(room);
  });

  socket.on("leaveRoom", () => cleanup(socket));
  socket.on("disconnect", () => cleanup(socket));
});

function cleanup(socket) {
  const code = socket.data.code;
  if (!code || !rooms[code]) return;
  const room = rooms[code];
  io.to(code).emit("opponentLeft", {});
  if (room.battle && !room.battle.over) {
    // forfeit: the remaining player wins
    const leaver = socket.data.userId;
    room.battle.over = true;
    room.battle.winnerId = leaver === room.hostId ? room.joinerId : room.hostId;
    broadcast(room);
  }
  delete rooms[code];
}

store
  .init()
  .then(() => server.listen(PORT, () => console.log(`ColorsV3 backend listening on :${PORT}`)))
  .catch((e) => {
    console.error("Failed to initialize data store:", e);
    process.exit(1);
  });
