// REST helpers + a shared Socket.io connection for ColorsV3.
import { io } from "socket.io-client";
import { BACKEND_URL } from "./config";

async function req(path, options = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.message) || `Request failed (${res.status})`);
  return data;
}

export const api = {
  register: (username, password) => req("/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  login: (username, password) => req("/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  getTeams: (userId) => req(`/teams?userId=${userId}`),
  createTeam: (userId, name) => req("/teams", { method: "POST", body: JSON.stringify({ userId, name }) }),
  deleteTeam: (id, userId) => req(`/teams/${id}?userId=${userId}`, { method: "DELETE" }),

  getCharacters: (teamId) => req(`/teams/${teamId}/characters`),
  createCharacter: (teamId, payload) => req(`/teams/${teamId}/characters`, { method: "POST", body: JSON.stringify(payload) }),
  deleteCharacter: (id) => req(`/characters/${id}`, { method: "DELETE" }),
};

let socket = null;
export function getSocket() {
  if (!socket) {
    socket = io(BACKEND_URL, { transports: ["websocket"], autoConnect: true });
  }
  return socket;
}
