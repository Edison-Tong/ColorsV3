// End-to-end battle test: two socket clients play a full exchange against a live server.
// Run: node test/integration.js  (expects the server running on PORT 4099)
const { io } = require("socket.io-client");

const B = "http://localhost:4099";

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
  const A = await buildTeam("p1_" + Date.now());
  const C = await buildTeam("p2_" + Date.now());
  console.log("✓ two 6-char teams built");

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
  console.log(`✓ moved unit ${unitId} from ${pos.r},${pos.c} to ${to.r},${to.c}`);

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
  process.exit(0);
})().catch((e) => { console.error("INTEGRATION FAIL:", e.message); process.exit(1); });
