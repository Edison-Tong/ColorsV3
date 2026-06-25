// Visual styling for each terrain tile type. The terrain grid (each cell { t, hg }) is
// sent by the server at battle start (board.js); this maps the tile key → color + glyph.
// "hg" (high ground) is a modifier rendered on top of any tile. Tile EFFECTS come later.
export const TILES = {
  normal:   { name: "Land",     color: "#6e8c41", glyph: "" },
  town:     { name: "Town",     color: "#b0875a", glyph: "🏠" },
  castle:   { name: "Castle",   color: "#8267aa", glyph: "🏰" },
  fort:     { name: "Fort",     color: "#8d8a82", glyph: "⛫" },
  water:    { name: "Water",    color: "#4a7fa6", glyph: "🌊" },
  desert:   { name: "Desert",   color: "#cdb46a", glyph: "🌵" },
  mountain: { name: "Mountain", color: "#b27c3c", glyph: "⛰️" },
  bridge:   { name: "Bridge",   color: "#caa23f", glyph: "🌉" },
  forest:   { name: "Forest",   color: "#3d5a2a", glyph: "🌲" },
};

export const tileFor = (key) => TILES[key] || TILES.normal;
