// ESM mirror of backend/mageEffects.js — just the target-side map the UI needs to highlight valid
// cast targets. Keep in parity with the backend (it's authoritative for applying effects).
export const EFFECT_SIDE = {
  Brn: "enemy", Frz: "enemy", Shck: "enemy", Psn: "enemy", Crsh: "enemy",
  Blnd: "enemy", Slnc: "enemy", Slw: "enemy", Immob: "enemy",
  "Pwr-": "enemy", Prc: "enemy", Curse: "enemy", Poss: "enemy",
  "Pwr+": "allyOrSelf", "Prt+": "allyOrSelf", "Eva+": "allyOrSelf", "Lck+": "allyOrSelf", "Mve+": "allyOrSelf",
  Rgn: "allyOrSelf", Mrcy: "allyOrSelf", Inv: "allyOrSelf", Invis: "allyOrSelf",
  Rflct: "allyOrSelf", Absrb: "allyOrSelf", Cnto: "allyOrSelf", Cntr: "allyOrSelf",
  Brv: "allyOrSelf", Hst: "allyOrSelf", Swft: "allyOrSelf", Time: "allyOrSelf",
  Swap: "ally",
  Wall: "board", Prtl: "board",
};

export function effectSide(code) { return EFFECT_SIDE[code] || "allyOrSelf"; }
