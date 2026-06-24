// Torn-parchment surfaces. Instead of a clean CSS border, we draw the panel as an SVG
// shape whose edge is a ragged path — like a torn piece of old paper. The raggedness is
// seeded from the panel size so it stays stable across re-renders (no jittering).
import { useState, useMemo } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { theme } from "../theme";

// tiny seeded PRNG so a given panel always tears the same way
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a ragged rectangle path inset from the box, with the edge eating inward.
function tornPath(w, h, seed) {
  const rnd = mulberry32(seed | 0);
  const m = 5;       // base inset from the box
  const amp = 7;     // how far the tears bite inward
  const step = 13;   // spacing between tear points
  const cx = (x) => Math.max(0, Math.min(w, x));
  const cy = (y) => Math.max(0, Math.min(h, y));
  const jig = () => m + rnd() * amp;
  const pts = [];
  for (let x = 0; x <= w; x += step) pts.push([cx(x), jig()]);            // top L→R
  for (let y = 0; y <= h; y += step) pts.push([w - jig(), cy(y)]);        // right T→B
  for (let x = w; x >= 0; x -= step) pts.push([cx(x), h - jig()]);        // bottom R→L
  for (let y = h; y >= 0; y -= step) pts.push([jig(), cy(y)]);            // left B→T
  return "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" L") + " Z";
}

// A torn-edged surface. Pass it the same `style` you'd give a card; it pulls the fill
// from backgroundColor and the deckle stroke from borderColor, then renders the rest.
export function Torn({ style, children, fill, edge, strokeWidth = 1.5, seed = 7, onLayout, ...rest }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const flat = StyleSheet.flatten(style) || {};
  const bg = fill || flat.backgroundColor || theme.card;
  const stroke = edge || flat.borderColor || theme.border;
  // strip the box's own background/border so only the SVG shows the surface
  const { backgroundColor, borderColor, borderWidth, borderTopWidth, borderBottomWidth, borderLeftWidth, borderRightWidth, borderRadius, ...boxStyle } = flat;

  const d = useMemo(
    () => (size.w > 1 && size.h > 1 ? tornPath(size.w, size.h, Math.floor(size.w * 131 + size.h * 17) + seed) : ""),
    [size.w, size.h, seed]
  );

  return (
    <View {...rest} style={[boxStyle, { backgroundColor: "transparent" }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
        onLayout && onLayout(e);
      }}>
      {!!d && (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={size.w} height={size.h}>
          <Path d={d} fill={bg} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      )}
      {children}
    </View>
  );
}

// A button whose face is torn parchment. `wrapStyle` carries layout (e.g. flex:1) on the
// touchable; `style` styles the torn face (padding, alignItems, colors).
export function TornButton({ onPress, disabled, style, wrapStyle, children, fill, edge, ...touchProps }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} style={wrapStyle} {...touchProps}>
      <Torn style={[style, { alignSelf: "stretch" }]} fill={fill} edge={edge}>{children}</Torn>
    </TouchableOpacity>
  );
}
