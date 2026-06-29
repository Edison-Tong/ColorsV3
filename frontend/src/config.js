// Backend environments. Flip between your PC and the deployed server.
//
// - local: your computer running `npm start` in /backend, reachable on your LAN.
//          Use your Mac's IP (find it: `ipconfig getifaddr en0`). Phone must share Wi-Fi.
// - prod:  the public, always-on backend (set this after you deploy — e.g. Render).
//          MUST be https for TestFlight/production builds (iOS blocks plain http).
export const ENV = {
  local: "http://10.10.21.206:4000",
  prod: "https://colors-game.onrender.com", // reused Render service (now serving V3)
};

// In a dev build (Expo Go) default to your PC; in a production build always use prod.
// __DEV__ is true in Expo Go / dev builds and false in EAS production builds.
export const DEFAULT_ENV = typeof __DEV__ !== "undefined" && __DEV__ ? "local" : "prod";

// Whether the in-app environment toggle is allowed to appear (dev only).
export const ALLOW_ENV_SWITCH = typeof __DEV__ !== "undefined" && __DEV__;

export const ENV_STORAGE_KEY = "cv3_backend_env";
