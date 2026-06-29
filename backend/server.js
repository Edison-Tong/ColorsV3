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
const board = require("./board");

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

const BOARD_ROWS = board.BOARD_ROWS;
const BOARD_COLS = board.BOARD_COLS;
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
    units[c.id] = { ...c, ownerId, maxHealth: c.health, health: c.health, alive: true, statuses: [] };
  }
  return units;
}

// ── Status effects (active states a unit can carry during battle) ──
const { hasStatus, addStatus, ON_HIT_STATUS, tickDots, decrementStatuses, clearTurnEndStatuses } = require("./status");

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
  const top = b.history && b.history.length ? b.history[b.history.length - 1] : null;
  return {
    code: room.code,
    hostId: room.hostId,
    joinerId: room.joinerId,
    turnUserId: b.turnUserId,
    over: b.over,
    winnerId: b.winnerId,
    units: b.units,
    positions: b.positions,
    moved: b.moved,
    acted: b.acted,
    canUndo: !!(top && top.kind === "move"), // is the most recent event an undoable move?
    lastMoveId: top && top.kind === "move" ? top.charId : null,
    sandbox: !!room.sandbox, // one client controls both sides
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
  b.moved = {};   // per-unit: has it used its single move this turn
  b.acted = {};   // per-unit: has it used its action (attack/cast) this turn
  b.history = []; // chronological stack of this turn's events: { kind:"move", charId, from } | { kind:"act", charId }
                  // — undo pops the most recent MOVE; once an "act" is on top, you can't undo past it.
  b.over = false;
  b.winnerId = null;
  io.to(room.code).emit("battleStart", { ...publicState(room), firstUserId: first, terrain: board.terrain });
}

// ── Sandbox / solo-test room ────────────────────────────────────────────────
// A permanent room code where ONE client controls BOTH teams (the red & blue seed teams), taking
// each side's turn in sequence — so a single tester can exercise every ability without two devices.
// genCode() never produces digits 0/1, so "0000" can never collide with a real room.
const SANDBOX_CODE = "0000";
async function buildSandboxRoom() {
  const red = await store.getUserByName("red");
  const blue = await store.getUserByName("blue");
  if (!red || !blue) throw new Error('Sandbox needs the seed teams — run "npm run seed" first');
  const redTeam = (await store.getTeams(red.id))[0];
  const blueTeam = (await store.getTeams(blue.id))[0];
  if (!redTeam || !blueTeam) throw new Error('Sandbox needs red & blue teams — run "npm run seed"');
  const redChars = await store.getCharacters(redTeam.id);
  const blueChars = await store.getCharacters(blueTeam.id);
  const room = {
    code: SANDBOX_CODE,
    sandbox: true,
    hostId: red.id, hostName: "Crimson Host (red)", hostSocket: null,
    joinerId: blue.id, joinerName: "Azure Guard (blue)", joinerSocket: null,
    hostCharIds: redChars.map((c) => c.id),
    joinerCharIds: blueChars.map((c) => c.id),
    battle: { units: { ...buildUnits(red.id, redChars), ...buildUnits(blue.id, blueChars) }, positions: {}, turnUserId: null, over: false },
  };
  room.battle.positions = { ...placeTeam(room.hostCharIds, "host"), ...placeTeam(room.joinerCharIds, "joiner") };
  return room;
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
    // Sandbox: joining "0000" (re)builds a fresh red-vs-blue battle this one socket controls entirely.
    if (String(code || "").toUpperCase() === SANDBOX_CODE) {
      const room = await buildSandboxRoom();
      rooms[SANDBOX_CODE] = room;
      socket.join(SANDBOX_CODE);
      socket.data.code = SANDBOX_CODE;
      socket.data.userId = Number(userId); // real id; control is driven by turnUserId in sandbox
      cb && cb({ code: SANDBOX_CODE, hostName: room.hostName });
      startBattle(room);
      return;
    }
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
    const me = room.sandbox ? b.turnUserId : socket.data.userId; // sandbox: act as the current side
    if (b.over) return cb && cb({ error: "Battle over" });
    if (b.turnUserId !== me) return cb && cb({ error: "Not your turn" });

    const unit = b.units[charId];
    if (!unit || unit.ownerId !== me || !unit.alive) return cb && cb({ error: "Invalid unit" });
    if (hasStatus(unit, "immobilized")) return cb && cb({ error: "Immobilized — can't move this turn" });
    // ONE move per turn: a unit may move a single time (path up to its full movement value).
    if (b.moved[charId]) return cb && cb({ error: "This unit has already moved this turn" });

    const from = b.positions[charId];
    if (!to || to.r < 0 || to.r >= BOARD_ROWS || to.c < 0 || to.c >= BOARD_COLS) return cb && cb({ error: "Off board" });

    // Path-based reachability: respects terrain (high ground / stairs) and unit blocking.
    const occupied = new Set();
    for (const [id, p] of Object.entries(b.positions)) if (Number(id) !== Number(charId)) occupied.add(p.r + ":" + p.c);
    const { cells } = combat.reachable(
      from, combat.getMoveValue(unit),
      (r, c) => board.tileAt(r, c),
      (r, c) => occupied.has(r + ":" + c),
      BOARD_ROWS, BOARD_COLS
    );
    const destKey = to.r + ":" + to.c;
    if (!cells.has(destKey)) return cb && cb({ error: "Can't move there" });

    b.positions[charId] = { r: to.r, c: to.c };
    b.moved[charId] = true;
    b.history.push({ kind: "move", charId: Number(charId), from }); // remember origin for undo
    cb && cb({ ok: true });
    broadcast(room);
  });

  // Undo the MOST RECENT move (LIFO). You can keep undoing back through this turn's moves until you
  // hit an attack/cast — once an action is on top of the stack, nothing before it can be undone.
  // (Popping the latest move always returns to a now-empty tile, so undos never collide.)
  on("undoMove", ({ code }, cb) => {
    const room = rooms[code];
    if (!room || !room.battle) return cb && cb({ error: "No battle" });
    const b = room.battle;
    if (b.over) return cb && cb({ error: "Battle over" });
    if (!room.sandbox && b.turnUserId !== socket.data.userId) return cb && cb({ error: "Not your turn" });
    const top = b.history.length ? b.history[b.history.length - 1] : null;
    if (!top || top.kind !== "move") return cb && cb({ error: top ? "Can't undo past an attack" : "No move to undo" });
    b.history.pop();
    b.positions[top.charId] = top.from;
    b.moved[top.charId] = false;
    cb && cb({ ok: true });
    broadcast(room);
  });

  // Attack. Resolves the A1/D1/A2/D2 exchange server-side.
  on("attack", ({ code, attackerId, defenderId, abilityName }, cb) => {
    const room = rooms[code];
    if (!room || !room.battle) return cb && cb({ error: "No battle" });
    const b = room.battle;
    const me = room.sandbox ? b.turnUserId : socket.data.userId; // sandbox: act as the current side
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
    // Silenced units can still make a basic attack, but not use a named ability.
    if (abilityName && hasStatus(attacker, "silenced")) return cb && cb({ error: "Silenced — can't use abilities this turn" });
    const ability = combat.findAbility(attacker, abilityName);
    const range = combat.getRange(attacker, ability); // { min, max }
    const aPos = b.positions[attackerId];
    const dPos = b.positions[defenderId];
    const aTile = board.tileAt(aPos.r, aPos.c);
    const dTile = board.tileAt(dPos.r, dPos.c);
    if (!combat.inAttackRange(aPos, dPos, aTile, dTile, range)) return cb && cb({ error: "Target out of range" });

    // ── Multi-target attacks (Radial / Meteor): one strike per enemy, NO counters. ──
    if (ability && (ability.type === "Radial" || ability.type === "Meteor")) {
      const enemies = Object.values(b.units).filter((u) => u.alive && u.ownerId !== me && b.positions[u.id]);
      let targets;
      if (ability.type === "Meteor") {
        // Primary takes a full hit; enemies adjacent to the primary take 1/3 splash.
        targets = [{ unit: defender, tile: dTile, dmgMult: 1 }];
        for (const u of enemies) {
          if (u.id === defenderId) continue;
          const p = b.positions[u.id];
          if (combat.manhattan(dPos, p) === 1) targets.push({ unit: u, tile: board.tileAt(p.r, p.c), dmgMult: 1 / 3 });
        }
      } else {
        // Radial: the primary plus the nearest other in-range enemies, up to the ability's cap.
        const maxN = combat.RADIAL_TARGETS[abilityName] ?? 3;
        const others = enemies
          .filter((u) => u.id !== defenderId && combat.inAttackRange(aPos, b.positions[u.id], aTile, board.tileAt(b.positions[u.id].r, b.positions[u.id].c), range))
          .sort((a, c) => combat.manhattan(aPos, b.positions[a.id]) - combat.manhattan(aPos, b.positions[c.id]));
        const chosen = [defender, ...others].slice(0, maxN === Infinity ? undefined : maxN);
        targets = chosen.map((u) => ({ unit: u, tile: board.tileAt(b.positions[u.id].r, b.positions[u.id].c), dmgMult: 1 }));
      }
      const aoe = combat.resolveAoE(attacker, abilityName, targets, aTile);
      const outcomes = [];
      for (const e of aoe.events) {
        const u = b.units[e.targetId];
        u.health = Math.max(0, u.health - e.damage);
        if (u.health <= 0) { u.alive = false; delete b.positions[u.id]; }
        outcomes.push({ targetId: e.targetId, type: e.type, damage: e.damage, dmgMult: e.dmgMult, hp: u.health });
      }
      b.acted[attackerId] = true;
      b.history.push({ kind: "act", charId: Number(attackerId) });
      checkWin(room);
      io.to(room.code).emit("attackResult", { attackerId, abilityName, aoe: true, targets: outcomes });
      cb && cb({ ok: true, aoe: true, targets: outcomes });
      broadcast(room);
      return;
    }

    // Defender may counter only if its BASIC weapon reach covers the attacker (using the same
    // height-aware distance) AND it isn't Injured this turn.
    const defenderCanCounter =
      combat.inAttackRange(dPos, aPos, dTile, aTile, combat.getRange(defender, null)) && !hasStatus(defender, "injured");

    // Terrain effects: each combatant uses the tile it's standing on.
    const result = combat.resolveExchange(attacker, defender, abilityName, defenderCanCounter, aTile, dTile);

    // Injuring: a connecting attack disables the target's counters for the rest of this turn.
    if (ability && ability.type === "Injuring" && result.attackerHit) addStatus(defender, "injured", { clearOn: "turnEnd" });

    attacker.health = result.attackerHp;
    defender.health = result.defenderHp;
    if (attacker.health <= 0) { attacker.alive = false; delete b.positions[attackerId]; }
    if (defender.health <= 0) { defender.alive = false; delete b.positions[defenderId]; }

    // On-hit status types (Burning/Poisoning/Freezing/Crushing/Shocking, Silencing/Slowing/
    // Blinding/Immobilizing) land a lingering status on a struck defender that survived the hit.
    if (ability && result.attackerHit && defender.alive) {
      const eff = ON_HIT_STATUS[ability.type];
      if (eff) addStatus(defender, eff.status, { turnsLeft: eff.turns, dot: !!eff.dot });
    }
    b.acted[attackerId] = true; // one attack per unit per turn; movement is its own action
    b.history.push({ kind: "act", charId: Number(attackerId) });

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
    const me = room.sandbox ? b.turnUserId : socket.data.userId; // sandbox: act as the current side
    if (b.over) return cb && cb({ error: "Battle over" });
    if (b.turnUserId !== me) return cb && cb({ error: "Not your turn" });

    const caster = b.units[casterId];
    if (!caster || caster.ownerId !== me || !caster.alive) return cb && cb({ error: "Invalid caster" });
    if (b.acted[casterId]) return cb && cb({ error: "Unit already acted" });
    if (hasStatus(caster, "silenced")) return cb && cb({ error: "Silenced — can't cast this turn" });
    if (!(caster.specials || []).includes(specialName)) return cb && cb({ error: "Unknown special" });

    const special = combat.findAbility(caster, specialName);
    if (!special) return cb && cb({ error: "Unknown special" });

    const target = b.units[targetId];
    if (!target || !target.alive) return cb && cb({ error: "Invalid target" });

    // Specials use the same min-max + height-aware range as attacks (self-target always allowed).
    const cPos = b.positions[casterId], tPos = b.positions[targetId];
    const sRange = combat.parseRange(special.range != null ? special.range : 1);
    const sDist = combat.combatDistance(cPos, tPos, board.tileAt(cPos.r, cPos.c), board.tileAt(tPos.r, tPos.c));
    if (Number(targetId) !== Number(casterId) && !combat.withinRange(sRange, sDist)) return cb && cb({ error: "Target out of range" });

    b.acted[casterId] = true; // casting is the unit's action for the turn
    b.history.push({ kind: "act", charId: Number(casterId) });

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
    if (!room.sandbox && b.turnUserId !== socket.data.userId) return cb && cb({ error: "Not your turn" });
    decrementStatuses(b);    // debuffs on the ending player's units count down a turn / expire
    clearTurnEndStatuses(b); // Injured etc. wear off when the turn that applied them ends
    b.turnUserId = b.turnUserId === room.hostId ? room.joinerId : room.hostId;
    // DoTs on the NEW current player's units bite at the start of their turn.
    const ticks = tickDots(b);
    if (ticks.length) {
      checkWin(room);
      io.to(room.code).emit("statusTick", { ticks, over: b.over, winnerId: b.winnerId });
    }
    b.moved = {};
    b.acted = {};
    b.history = [];
    cb && cb({ ok: true });
    broadcast(room);
  });

  // Resume an in-progress battle after a brief disconnect (app backgrounded / network blip).
  // Re-associates this (possibly brand-new) socket with the room and resends current state.
  on("resume", ({ code, userId }, cb) => {
    const room = rooms[code];
    if (!room || !room.battle || room.battle.turnUserId == null) return cb && cb({ error: "No active battle" });
    const me = Number(userId);
    if (!room.sandbox && me !== room.hostId && me !== room.joinerId) return cb && cb({ error: "Not in this battle" });
    socket.join(code);
    socket.data.code = code;
    socket.data.userId = me;
    if (!room.sandbox) { if (me === room.hostId) room.hostSocket = socket.id; else room.joinerSocket = socket.id; }
    if (room.graceTimers && room.graceTimers[me]) { clearTimeout(room.graceTimers[me]); delete room.graceTimers[me]; }
    io.to(code).emit("opponentReconnected", { userId: me });
    socket.emit("state", publicState(room)); // hand the returning client the current battle state
    cb && cb({ ok: true });
  });

  socket.on("leaveRoom", () => forfeit(socket));      // explicit "Leave" — forfeit now
  socket.on("disconnect", () => handleDisconnect(socket)); // dropped — keep alive for a grace period
});

// Keep a battle alive this long after a disconnect so a player can reconnect (e.g. took a
// phone call, switched apps). Only if they don't return in time does it count as a forfeit.
const GRACE_MS = 300000; // 5 minutes

function endRoom(room, loserId, code) {
  if (room.graceTimers) { Object.values(room.graceTimers).forEach((t) => clearTimeout(t)); room.graceTimers = {}; }
  io.to(code).emit("opponentLeft", {});
  if (room.battle && !room.battle.over) {
    room.battle.over = true;
    room.battle.winnerId = loserId === room.hostId ? room.joinerId : room.hostId;
    broadcast(room);
  }
  delete rooms[code];
}

function forfeit(socket) {
  const code = socket.data.code;
  if (!code || !rooms[code]) return;
  endRoom(rooms[code], socket.data.userId, code);
}

function handleDisconnect(socket) {
  const code = socket.data.code;
  if (!code || !rooms[code]) return;
  const room = rooms[code];
  const me = socket.data.userId;
  // Ignore a stale socket's late disconnect if the player already reconnected on a newer one.
  const current = me === room.hostId ? room.hostSocket : room.joinerSocket;
  if (current && current !== socket.id) return;

  const b = room.battle;
  if (!b || b.turnUserId == null) { delete rooms[code]; return; } // still in the lobby — just drop it
  if (b.over) return;

  io.to(code).emit("opponentDisconnected", { userId: me });
  room.graceTimers = room.graceTimers || {};
  if (room.graceTimers[me]) clearTimeout(room.graceTimers[me]);
  room.graceTimers[me] = setTimeout(() => {
    if (rooms[code] && room.battle && !room.battle.over) endRoom(room, me, code);
  }, GRACE_MS);
}

store
  .init()
  .then(() => server.listen(PORT, () => console.log(`ColorsV3 backend listening on :${PORT}`)))
  .catch((e) => {
    console.error("Failed to initialize data store:", e);
    process.exit(1);
  });
