// ColorsV3 board / terrain. Server-authoritative so both players see the same map.
// 10 rows x 24 cols, from the player's exact layout + coordinate overrides.
//
// Each cell is { t, hg, stairs }:
//   t      = base terrain (normal/town/castle/fort/water/desert/mountain/bridge/forest)
//   hg     = high ground (reachable only via a stairway) — a modifier
//   stairs = a stairway sits on this tile — a feature, can combine with any terrain
//
// Layout codes: N normal · T town · C castle · F forest · f fort · W water · D desert
//   M mountain · S stairway(on normal ground) · B bridge.
//   A LOWERCASE letter = that cell is ALSO high ground. `f` (fort/walls) is always high ground.
//
// Tile EFFECTS are deferred — terrain is visual only for now (every tile is passable).
const LAYOUT = [
  "WWWWWWNNFFFFWNNNDDDDDNNN", // 1
  "NNNNNNNFFNNNBNNNSfMMNNNN", // 2
  "NNNNNNNFFSNNBNNNNfMMNNNN", // 3
  "NNNNNNFMffNNWFTTNNNNNNNN", // 4
  "NNfNNfFMMMNNWWWWNNNNNNNN", // 5
  "NNfSNfFFMMNNNNNBNNNcCCCC", // 6
  "NNfNSfFMMMFTNNNBNNNcSCCC", // 7
  "NNfNffFMMFFTNNNWNNNcCCCF", // 8
  "NNNNNNMMMFDDDDDWWNNcCCFF", // 9
  "NNNNNNNNNDDDDDDDWDNNNNFF", // 10
];

const BASE = {
  N: "normal", T: "town", C: "castle", F: "forest", W: "water",
  D: "desert", M: "mountain", B: "bridge",
};

// Coordinate overrides (A1 = col 0,row 0). For tile combos the single-letter codes can't
// express — e.g. the fort courtyard (fort terrain at ground level) and stairs-on-terrain.
const COL = (letter) => letter.toUpperCase().charCodeAt(0) - 65; // A->0
const overrides = {};
const set = (coord, cell) => { overrides[`${Number(coord.slice(1)) - 1},${COL(coord[0])}`] = cell; };
// Fort courtyard: fort terrain, NOT high ground (the surrounding `f` walls stay high ground).
["D5", "E5", "E6", "D7", "D8"].forEach((c) => set(c, { t: "fort", hg: false }));
// Fort courtyard tiles that also carry a stairway up to the walls.
["D6", "E7"].forEach((c) => set(c, { t: "fort", hg: false, stairs: true }));
// A castle tile that also has a stairway.
set("U7", { t: "castle", hg: false, stairs: true });

function parseCell(ch) {
  if (ch === "f") return { t: "fort", hg: true, stairs: false };      // forts/walls = high ground
  if (ch === "S") return { t: "normal", hg: false, stairs: true };    // plain stairway
  const up = ch.toUpperCase();
  return { t: BASE[up] || "normal", hg: ch !== up, stairs: false };
}

const terrain = LAYOUT.map((row, r) =>
  row.split("").map((ch, c) => {
    const base = parseCell(ch);
    const ov = overrides[`${r},${c}`];
    return ov ? { t: ov.t, hg: !!ov.hg, stairs: !!ov.stairs } : base;
  })
);

const BOARD_ROWS = LAYOUT.length;
const BOARD_COLS = LAYOUT[0].length;

function tileAt(r, c) {
  return (terrain[r] && terrain[r][c]) || { t: "normal", hg: false, stairs: false };
}

module.exports = { BOARD_ROWS, BOARD_COLS, terrain, tileAt };
