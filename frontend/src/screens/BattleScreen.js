import { useState, useEffect, useMemo, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Dimensions, Alert } from "react-native";
import { getSocket } from "../api";
import { weaponsData } from "../data/weaponsData";
import { theme, WEAPON_GLYPH } from "../theme";
import { getMoveValue, getAttackRange, findAbility, manhattan, inRange, previewStrike } from "../logic/combat";

const { width } = Dimensions.get("window");

export default function BattleScreen({ route, navigation }) {
  const { code, userId, initialState } = route.params;
  const [state, setState] = useState(initialState);
  const [selectedId, setSelectedId] = useState(null);
  const [attackTarget, setAttackTarget] = useState(null); // enemy unit object
  const [log, setLog] = useState([]);
  const socket = getSocket();

  const rows = state.rows, cols = state.cols;
  const cell = Math.floor((width - 16) / cols);

  const amHost = state.hostId === userId;
  const myTurn = state.turnUserId === userId && !state.over;

  // Perspective: each player sees their own team at the bottom.
  const toView = (p) => (amHost ? p : { r: rows - 1 - p.r, c: cols - 1 - p.c });
  const fromView = (p) => (amHost ? p : { r: rows - 1 - p.r, c: cols - 1 - p.c });

  useEffect(() => {
    const onState = (s) => setState(s);
    const onAttack = (res) => {
      setLog((prev) => [describe(res, state), ...prev].slice(0, 6));
    };
    const onLeft = () => Alert.alert("Opponent left", "The match has ended.");
    socket.on("state", onState);
    socket.on("attackResult", onAttack);
    socket.on("opponentLeft", onLeft);
    return () => { socket.off("state", onState); socket.off("attackResult", onAttack); socket.off("opponentLeft", onLeft); };
  }, [socket, state]);

  const units = state.units || {};
  const positions = state.positions || {};
  const selected = selectedId ? units[selectedId] : null;
  const selPos = selectedId ? positions[selectedId] : null;

  // Cells the selected unit can move to (absolute coords).
  const moveCells = useMemo(() => {
    if (!selected || !selPos || !myTurn || state.moved?.[selectedId] || state.acted?.[selectedId]) return new Set();
    const mv = getMoveValue(selected);
    const occupied = new Set(Object.values(positions).map((p) => `${p.r}:${p.c}`));
    const out = new Set();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const key = `${r}:${c}`;
      if (occupied.has(key)) continue;
      if (manhattan(selPos, { r, c }) <= mv && manhattan(selPos, { r, c }) > 0) out.add(key);
    }
    return out;
  }, [selected, selPos, myTurn, state, positions, selectedId, rows, cols]);

  // Enemy units the selected unit could attack (within its max attack range).
  const maxRange = useMemo(() => {
    if (!selected) return 1;
    const ranges = [getAttackRange(selected, null), ...selected.abilities.map((n) => getAttackRange(selected, findAbility(selected, n)))];
    return Math.max(...ranges);
  }, [selected]);

  const targetableIds = useMemo(() => {
    if (!selected || !selPos || !myTurn || state.acted?.[selectedId]) return new Set();
    const out = new Set();
    for (const [id, u] of Object.entries(units)) {
      if (u.ownerId === userId || !u.alive) continue;
      if (inRange(selPos, positions[id], maxRange)) out.add(Number(id));
    }
    return out;
  }, [selected, selPos, myTurn, units, positions, maxRange, selectedId, state, userId]);

  const onCellPress = (abs) => {
    const occId = occupantAt(positions, abs);
    if (occId != null) {
      const u = units[occId];
      if (u.ownerId === userId) {
        // select my own unit
        if (u.alive) setSelectedId(occId);
        return;
      }
      // enemy: attack if targetable
      if (selected && targetableIds.has(occId)) setAttackTarget(u);
      return;
    }
    // empty cell: move there if highlighted
    if (selected && moveCells.has(`${abs.r}:${abs.c}`)) {
      socket.emit("move", { code, charId: selectedId, to: abs }, (res) => {
        if (res?.error) Alert.alert("Cannot move", res.error);
      });
    }
  };

  const doAttack = (abilityName) => {
    socket.emit("attack", { code, attackerId: selectedId, defenderId: attackTarget.id, abilityName }, (res) => {
      if (res?.error) Alert.alert("Attack failed", res.error);
    });
    setAttackTarget(null);
    setSelectedId(null);
  };

  const endTurn = () => {
    setSelectedId(null);
    socket.emit("endTurn", { code }, (res) => { if (res?.error) Alert.alert("Error", res.error); });
  };

  const leave = () => {
    socket.emit("leaveRoom");
    navigation.popToTop();
  };

  // Build the grid in VIEW coordinates so my team is at the bottom.
  const viewGrid = [];
  for (let vr = 0; vr < rows; vr++) {
    const row = [];
    for (let vc = 0; vc < cols; vc++) {
      const abs = fromView({ r: vr, c: vc });
      row.push(abs);
    }
    viewGrid.push(row);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={leave}><Text style={styles.leave}>‹ Leave</Text></TouchableOpacity>
        <Text style={[styles.turn, { color: myTurn ? theme.good : theme.textDim }]}>
          {state.over ? (state.winnerId === userId ? "🏆 You win!" : "💀 You lose") : myTurn ? "Your turn" : "Opponent's turn"}
        </Text>
        <Text style={styles.code}>#{code}</Text>
      </View>

      <Text style={styles.sideLabel}>↑ Opponent</Text>
      <View style={styles.board}>
        {viewGrid.map((row, vr) => (
          <View key={vr} style={{ flexDirection: "row" }}>
            {row.map((abs, vc) => {
              const occId = occupantAt(positions, abs);
              const u = occId != null ? units[occId] : null;
              const isMine = u && u.ownerId === userId;
              const isSelected = occId === selectedId;
              const isMove = moveCells.has(`${abs.r}:${abs.c}`);
              const isTarget = occId != null && targetableIds.has(occId);
              const dark = (abs.r + abs.c) % 2 === 0;
              return (
                <TouchableOpacity key={vc} activeOpacity={0.7} onPress={() => onCellPress(abs)}
                  style={[styles.cell, { width: cell, height: cell, backgroundColor: dark ? "#171b29" : "#1d2233" },
                    isMove && styles.cellMove, isSelected && styles.cellSelected, isTarget && styles.cellTarget]}>
                  {u && (
                    <View style={[styles.token, { backgroundColor: isMine ? theme.mine : theme.enemy }]}>
                      <Text style={styles.tokenGlyph}>{WEAPON_GLYPH[u.base_weapon] || "⚔️"}</Text>
                      <View style={styles.hpBar}>
                        <View style={[styles.hpFill, { width: `${Math.max(0, (u.health / u.maxHealth) * 100)}%` }]} />
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
      <Text style={styles.sideLabel}>↓ Your team</Text>

      {/* Selected unit info */}
      {selected ? (
        <View style={styles.infoBar}>
          <Text style={styles.infoName}>{selected.name} · {cap(selected.type)} · {cap(selected.base_weapon)}</Text>
          <Text style={styles.infoMeta}>
            HP {selected.health}/{selected.maxHealth} · Move {getMoveValue(selected)} · Range {maxRange}
            {state.acted?.[selectedId] ? " · acted" : state.moved?.[selectedId] ? " · moved" : ""}
          </Text>
          <Text style={styles.infoHint}>{myTurn ? "Tap a highlighted cell to move, or a red enemy to attack." : "Not your turn."}</Text>
        </View>
      ) : (
        <View style={styles.infoBar}><Text style={styles.infoHint}>{myTurn ? "Tap one of your units (bottom) to act." : "Waiting for opponent…"}</Text></View>
      )}

      {/* Battle log */}
      {log.length > 0 && (
        <ScrollView style={styles.logBox} contentContainerStyle={{ padding: 8 }}>
          {log.map((l, i) => <Text key={i} style={[styles.logLine, i === 0 && { color: theme.text }]}>{l}</Text>)}
        </ScrollView>
      )}

      <View style={styles.bottomBar}>
        <TouchableOpacity style={[styles.endBtn, !myTurn && { opacity: 0.4 }]} disabled={!myTurn || state.over} onPress={endTurn}>
          <Text style={styles.endText}>End Turn</Text>
        </TouchableOpacity>
        {state.over && (
          <TouchableOpacity style={styles.exitBtn} onPress={leave}><Text style={styles.endText}>Exit</Text></TouchableOpacity>
        )}
      </View>

      {/* Attack modal */}
      <Modal visible={!!attackTarget} transparent animationType="slide" onRequestClose={() => setAttackTarget(null)}>
        <View style={styles.backdrop}>
          <View style={styles.attackCard}>
            {attackTarget && selected && (() => {
              const dist = manhattan(selPos, positions[attackTarget.id]);
              const options = [
                { name: null, label: `Basic ${cap(selected.base_weapon)}`, ability: null },
                ...selected.abilities.map((n) => ({ name: n, label: n, ability: findAbility(selected, n) })),
              ];
              return (
                <>
                  <Text style={styles.attackTitle}>Attack {attackTarget.name}</Text>
                  <Text style={styles.attackSub}>Distance {dist} · target HP {attackTarget.health}/{attackTarget.maxHealth}</Text>
                  {options.map((opt, i) => {
                    const range = getAttackRange(selected, opt.ability);
                    const reach = dist <= range;
                    const p = previewStrike(selected, attackTarget, opt.ability);
                    return (
                      <TouchableOpacity key={i} disabled={!reach} onPress={() => doAttack(opt.name)}
                        style={[styles.optRow, !reach && { opacity: 0.4 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.optName}>{opt.label} {reach ? "" : `(range ${range})`}</Text>
                          <Text style={styles.optMeta}>~{p.damage} dmg · {p.hitPct}% hit · {p.blockPct}% block · {p.critPct}% crit · range {range}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  <Text style={styles.attackNote}>Exchange: you, them, you, them — stops if someone falls. They counter only if they can reach you.</Text>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setAttackTarget(null)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function occupantAt(positions, abs) {
  for (const [id, p] of Object.entries(positions)) if (p.r === abs.r && p.c === abs.c) return Number(id);
  return null;
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function describe(res, state) {
  const u = state.units || {};
  const aName = u[res.attackerId]?.name || "Attacker";
  const dName = u[res.defenderId]?.name || "Defender";
  const parts = res.events.map((e) => {
    const who = e.by === "attacker" ? aName : dName;
    if (e.type === "miss") return `${e.step}: ${who} missed`;
    if (e.type === "block") return `${e.step}: ${who} blocked`;
    if (e.type === "crit") return `${e.step}: ${who} CRIT ${e.damage}`;
    return `${e.step}: ${who} hit ${e.damage}`;
  });
  return `${aName} → ${dName} | ${parts.join("  ·  ")}`;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, paddingTop: 44 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 6 },
  leave: { color: theme.textDim, fontSize: 16 },
  turn: { fontWeight: "800", fontSize: 16 },
  code: { color: theme.textDim, fontWeight: "700" },
  sideLabel: { color: theme.textDim, fontSize: 11, textAlign: "center", marginVertical: 2 },
  board: { alignSelf: "center", borderWidth: 1, borderColor: theme.border },
  cell: { alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: "#11141f" },
  cellMove: { backgroundColor: "#1c3a55" },
  cellSelected: { borderColor: theme.warn, borderWidth: 2 },
  cellTarget: { backgroundColor: "#4a1e2c" },
  token: { width: "82%", height: "82%", borderRadius: 6, alignItems: "center", justifyContent: "center" },
  tokenGlyph: { fontSize: 16 },
  hpBar: { position: "absolute", bottom: 2, left: 3, right: 3, height: 3, backgroundColor: "#00000066", borderRadius: 2 },
  hpFill: { height: 3, backgroundColor: "#7CFF8E", borderRadius: 2 },
  infoBar: { backgroundColor: theme.card, marginHorizontal: 10, marginTop: 8, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
  infoName: { color: theme.text, fontWeight: "700" },
  infoMeta: { color: theme.warn, fontSize: 12, marginTop: 2 },
  infoHint: { color: theme.textDim, fontSize: 12, marginTop: 4 },
  logBox: { maxHeight: 90, marginHorizontal: 10, marginTop: 8, backgroundColor: "#0b0d15", borderRadius: 10, borderWidth: 1, borderColor: theme.border },
  logLine: { color: theme.textDim, fontSize: 11, marginBottom: 2 },
  bottomBar: { flexDirection: "row", gap: 12, padding: 12, marginTop: "auto" },
  endBtn: { flex: 1, backgroundColor: theme.primary, padding: 16, borderRadius: 12, alignItems: "center" },
  exitBtn: { flex: 1, backgroundColor: theme.danger, padding: 16, borderRadius: 12, alignItems: "center" },
  endText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  attackCard: { backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border },
  attackTitle: { color: theme.text, fontSize: 22, fontWeight: "800" },
  attackSub: { color: theme.textDim, marginBottom: 14, marginTop: 2 },
  optRow: { backgroundColor: theme.cardAlt, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  optName: { color: theme.text, fontWeight: "700" },
  optMeta: { color: theme.warn, fontSize: 12, marginTop: 3 },
  attackNote: { color: theme.textDim, fontSize: 11, marginVertical: 8, fontStyle: "italic" },
  cancelBtn: { padding: 14, alignItems: "center" },
  cancelText: { color: theme.danger, fontWeight: "700" },
});
