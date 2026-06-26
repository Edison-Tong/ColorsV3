// ColorsV3 — medieval / rustic theme: oiled leather, aged parchment, bronze, torchlight.
export const theme = {
  bg: "#1a130c",        // dark oiled wood / dungeon
  card: "#2a1f13",      // worn leather panel
  cardAlt: "#352816",   // lighter leather
  border: "#6f5328",    // aged bronze / wood trim
  gold: "#c9a45b",      // antique gold accent
  text: "#ecdcb4",      // parchment ink
  textDim: "#a88f63",   // faded sepia
  primary: "#b07d2b",   // hammered gold (buttons)
  primaryDim: "#7c5a20",
  danger: "#a32a1d",    // blood crimson
  good: "#6c8a3a",      // moss / forest green
  warn: "#cf9433",      // amber torchlight
  mine: "#2f7bf0",      // bright banner blue (vivid for board visibility)
  enemy: "#ee3b3b",     // bright banner red

  // board tones (carved stone & wood)
  boardDark: "#241a10",
  boardLight: "#33271a",
  moveHi: "#3f4d2a",    // mossy stone you can step to
  targetHi: "#5a2620",  // bloodied attack tile
  castHi: "#4a3c1d",    // gilded cast tile
  hp: "#86ad44",        // health green
};

// Font families (loaded in App.js). Custom fonts ignore fontWeight, so pick the family per weight.
export const FONTS = {
  display: "MedievalSharp_400Regular", // big flourishes: logo, win/lose
  heading: "Cinzel_700Bold",           // engraved caps: titles, buttons, names
  headingReg: "Cinzel_400Regular",
  body: "EBGaramond_500Medium",        // readable serif body
  bodyBold: "EBGaramond_700Bold",
};

export const STAT_LABELS = {
  health: "Health", strength: "Strength", defense: "Defense", magick: "Magick", resistance: "Resistance",
  speed: "Speed", skill: "Skill", knowledge: "Knowledge", luck: "Luck",
};

export const WEAPON_GLYPH = {
  sword: "⚔️", axe: "🪓", dagger: "🗡️", lance: "🔱", bow: "🏹", gauntlets: "🥊",
  fire: "🔥", water: "💧", earth: "🪨", lightning: "⚡", grass: "🌿", aether: "✨",
  wind: "🌪️", light: "☀️", dark: "🌑", gray: "🌫️",
};
