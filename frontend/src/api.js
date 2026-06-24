// REST helpers + a shared Socket.io connection for ColorsV3.
// The active backend URL is resolved at runtime so it can be switched (dev only) without
// rebuilding — see config.js and the BackendSwitcher component.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";
import { ENV, DEFAULT_ENV, ENV_STORAGE_KEY } from "./config";

let activeEnv = DEFAULT_ENV;
let baseUrl = ENV[activeEnv];
let socket = null;
const listeners = new Set();

// Load any saved environment choice. Call once at app startup (before first request).
export async function initBackend() {
  try {
    const saved = await AsyncStorage.getItem(ENV_STORAGE_KEY);
    if (saved && ENV[saved]) { activeEnv = saved; baseUrl = ENV[saved]; }
  } catch {}
  return activeEnv;
}

export const getEnvName = () => activeEnv;
export const getBackendUrl = () => baseUrl;
export const onBackendChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// Switch environment: persist it, drop the old socket so the next getSocket() reconnects
// to the new URL, and notify listeners (so the UI re-renders / screens can reset).
export async function setBackendEnv(name) {
  if (!ENV[name] || name === activeEnv) return;
  activeEnv = name;
  baseUrl = ENV[name];
  try { await AsyncStorage.setItem(ENV_STORAGE_KEY, name); } catch {}
  if (socket) { try { socket.disconnect(); } catch {} socket = null; }
  listeners.forEach((fn) => fn(name));
}

async function req(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
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
  updateCharacter: (id, payload) => req(`/characters/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCharacter: (id) => req(`/characters/${id}`, { method: "DELETE" }),
};

export function getSocket() {
  if (!socket) {
    socket = io(baseUrl, { transports: ["websocket"], autoConnect: true });
  }
  return socket;
}
