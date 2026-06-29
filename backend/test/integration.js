// End-to-end battle test: two socket clients play a full exchange against a live server.
// Self-contained — it spawns its OWN server on a throwaway DB so it can never touch
// your real colorsv3.db. Run: npm run test:e2e
const { io } = require("socket.io-client");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = 4099;
const B = `http://localhost:${PORT}`;
const TEST_DB = path.join(require("os").tmpdir(), `colorsv3-test-${process.pid}.db`);

let server;
function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn("node", [path.join(__dirname, "..", "server.js")], {
      env: { ...process.env, PORT: String(PORT), COLORSV3_DB: TEST_DB },
      stdio: "ignore",
    });
    server.on("error", reject);
    // poll /ping until the server answers
    const t0 = Date.now();
    (function wait() {
      fetch(`${B}/ping`).then(() => resolve()).catch(() => {
        if (Date.now() - t0 > 8000) return reject(new Error("server did not start"));
        setTimeout(wait, 200);
      });
    })();
  });
}
function stopServer() {
  if (server) server.kill();
  for (const f of [TEST_DB, TEST_DB + "-wal", TEST_DB + "-shm"]) { try { fs.unlinkSync(f); } catch {} }
}

async function rest(path, method = "GET", body) {
  const res = await fetch(B + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${data && data.message}`);
  return data;
}

const mkStats = (o = {}) => ({ health: 10, strength: 8, defense: 6, magick: 8, resistance: 6, speed: 6, skill: 6, knowledge: 6, luck: 6, ...o });

// A valid 6-char roster: one each of size 4/1, two each of 3/2, with 2 mages.
const roster = [
  { name: "Brick", type: "melee", size: 4, base_weapon: "axe", abilities: ["Ragnarok", "Tomahawk"], stats: mkStats({ strength: 10, defense: 8 }) },
  { name: "Edge", type: "melee", size: 3, base_weapon: "sword", abilities: ["Evasion", "Tipper"], stats: mkStats() },
  { name: "Pike", type: "melee", size: 3, base_weapon: "lance", abilities: ["Javelin", "Guard"], stats: mkStats() },
  { name: "Ember", type: "mage", size: 2, base_weapon: "fire", abilities: ["Incinerate", "Scorch"], specials: ["Ignite", "Spark", "Bolster"], stats: mkStats({ magick: 10 }) },
  { name: "Tide", type: "mage", size: 2, base_weapon: "water", abilities: ["Ice Spear", "Torrent"], specials: ["Hail", "Liquify", "Propel"], stats: mkStats({ magick: 10 }) },
  { name: "Nimble", type: "melee", size: 1, base_weapon: "dagger", abilities: ["Throwing Knives", "Blitz"], stats: mkStats({ speed: 10 }) },
];

async function buildTeam(username) {
  let user;
  try { user = await rest("/register", "POST", { username, password: "pw" }); }
  catch { user = await rest("/login", "POST", { username, password: "pw" }); }
  const { team } = await rest("/teams", "POST", { userId: user.id, name: `${username}-team` });
  for (const c of roster) await rest(`/teams/${team.id}/characters`, "POST", c);
  return { user, teamId: team.id };
}

function connect() {
  return io(B, { transports: ["websocket"], forceNew: true });
}
const once = (sock, ev, ms = 8000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for '${ev}'`)), ms);
    sock.once(ev, (d) => { clearTimeout(t); res(d); });
  });
const emit = (sock, ev, payload, ms = 8000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout on ack for '${ev}'`)), ms);
    sock.emit(ev, payload, (d) => { clearTimeout(t); res(d); });
  });

(async () => {
  await startServer();
  console.log(`✓ test server up on :${PORT} (throwaway DB)`);
  const A = await buildTeam("p1_" + Date.now());
  const C = await buildTeam("p2_" + Date.now());
  console.log("✓ two 6-char teams built");

  // Edit a character: rename + change a stat, and verify it persists.
  const aTeams = await rest(`/teams?userId=${A.user.id}`);
  const aChars = aTeams.teams[0].characters;
  const target = aChars[0];
  const edited = await rest(`/characters/${target.id}`, "PUT", {
    name: "Renamed", type: target.type, size: target.size, base_weapon: target.base_weapon,
    abilities: target.abilities, specials: target.specials,
    stats: { health: 11, strength: target.strength, defense: target.defense, magick: target.magick, resistance: target.resistance, speed: target.speed, skill: target.skill, knowledge: target.knowledge, luck: target.luck },
  });
  if (edited.character.name !== "Renamed" || edited.character.health !== 11) throw new Error("edit did not persist");
  const reread = (await rest(`/teams/${aTeams.teams[0].id}/characters`)).characters.find((c) => c.id === target.id);
  if (reread.name !== "Renamed") throw new Error("edit not reflected on reread");
  console.log("✓ character edited (rename + stat) and persisted");

  const host = connect();
  const join = connect();
  await once(host, "connect");
  await once(join, "connect");

  const hostStart = once(host, "battleStart");
  const joinStart = once(join, "battleStart");
  const { code } = await emit(host, "host", { userId: A.user.id, username: "p1", teamId: A.teamId });
  console.log("✓ hosted, code", code);
  const jr = await emit(join, "join", { userId: C.user.id, username: "p2", code, teamId: C.teamId });
  console.log("join ack:", JSON.stringify(jr));
  if (jr && jr.error) throw new Error("join rejected: " + jr.error);
  const s1 = await hostStart; await joinStart;
  console.log("✓ battleStart fired for both; first =", s1.firstUserId);

  const placed = Object.keys(s1.positions).length;
  if (placed !== 12) throw new Error("expected 12 placed units, got " + placed);
  console.log("✓ 12 units placed on board");

  // Identify the player to move first and one of their front-row units.
  const firstIsHost = s1.firstUserId === A.user.id;
  const mover = firstIsHost ? host : join;
  const moverId = s1.firstUserId;
  const myUnit = Object.entries(s1.units).find(([id, u]) => u.ownerId === moverId);
  const [unitId] = myUnit;
  const pos = s1.positions[unitId];

  // Move it forward one row toward the enemy (host moves up, joiner moves down).
  const dir = firstIsHost ? -1 : 1;
  const to = { r: pos.r + dir, c: pos.c };
  const moveRes = await emit(mover, "move", { code, charId: Number(unitId), to });
  if (moveRes.error) throw new Error("move failed: " + moveRes.error);
  console.log(`✓ moved unit ${unitId} from ${pos.r},${pos.c} to ${to.r},${to.c} (dist 1)`);

  // ONE move per turn: a second move is rejected even though the path is short.
  const m2 = await emit(mover, "move", { code, charId: Number(unitId), to: { r: to.r + dir, c: to.c } });
  if (!m2.error) throw new Error("expected second-move rejection (one move per turn)");
  console.log("✓ second move correctly rejected:", m2.error);

  // Undo the move (no action taken yet) -> the unit returns to its original tile, then can move again.
  const undoState = once(mover, "state"); // undoMove broadcasts fresh state
  const undoRes = await emit(mover, "undoMove", { code, charId: Number(unitId) });
  if (undoRes.error) throw new Error("undoMove failed: " + undoRes.error);
  const sUndo = await undoState;
  const back = sUndo.positions[unitId];
  if (back.r !== pos.r || back.c !== pos.c) throw new Error(`undo didn't restore position (got ${back.r},${back.c})`);
  console.log(`✓ undoMove returned unit ${unitId} to ${pos.r},${pos.c}`);
  const m3 = await emit(mover, "move", { code, charId: Number(unitId), to });
  if (m3.error) throw new Error("re-move after undo failed: " + m3.error);
  console.log("✓ unit moved again after undo");

  // Mage specials: the mover's mage can cast one of its 3 specials (here, on itself).
  const mageEntry = Object.entries(s1.units).find(([id, u]) => u.ownerId === moverId && u.type === "mage");
  if (!mageEntry) throw new Error("no mage found for mover");
  const [mageId, mageUnit] = mageEntry;
  const castRes = await emit(mover, "cast", { code, casterId: Number(mageId), targetId: Number(mageId), specialName: mageUnit.specials[0] });
  if (castRes.error) throw new Error("cast failed: " + castRes.error);
  console.log(`✓ mage cast special "${mageUnit.specials[0]}" (1 of ${mageUnit.specials.length} available)`);
  const castRes2 = await emit(mover, "cast", { code, casterId: Number(mageId), targetId: Number(mageId), specialName: mageUnit.specials[1] });
  if (!castRes2.error) throw new Error("expected already-acted rejection on second cast");
  console.log("✓ casting twice correctly rejected:", castRes2.error);

  // Wrong-turn guard: the other player must not be able to move.
  const other = firstIsHost ? join : host;
  const otherUnit = Object.entries(s1.units).find(([id, u]) => u.ownerId !== moverId)[0];
  const badRes = await emit(other, "move", { code, charId: Number(otherUnit), to: { r: 3, c: 3 } });
  if (!badRes.error) throw new Error("expected not-your-turn rejection");
  console.log("✓ off-turn move correctly rejected:", badRes.error);

  // Attack handler wiring: an enemy across the board is out of range -> rejected.
  const farEnemy = Object.entries(s1.units).find(([id, u]) => u.ownerId !== moverId)[0];
  const atkRes = await emit(mover, "attack", { code, attackerId: Number(unitId), defenderId: Number(farEnemy), abilityName: null });
  if (!atkRes.error) throw new Error("expected out-of-range attack rejection");
  console.log("✓ out-of-range attack correctly rejected:", atkRes.error);

  // End turn, confirm it flips.
  const afterState = once(host, "state");
  await emit(mover, "endTurn", { code });
  const s2 = await afterState;
  if (s2.turnUserId === moverId) throw new Error("turn did not flip");
  console.log("✓ end turn flipped control to", s2.turnUserId);

  host.close(); join.close();
  console.log("\nAll integration checks passed ✓");
  stopServer();
  process.exit(0);
})().catch((e) => { console.error("INTEGRATION FAIL:", e.message); stopServer(); process.exit(1); });
