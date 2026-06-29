import { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Pressable,
  Animated,
  Easing,
  ScrollView,
  Dimensions,
  AppState,
} from "react-native";
import { getSocket } from "../api";
import { theme, FONTS, WEAPON_GLYPH } from "../theme";
import { Torn, TornButton } from "../components/Torn";
import { TILES, tileFor } from "../data/board";
import {
  computeAllStats,
  getMoveValue,
  getAttackRange,
  findAbility,
  manhattan,
  inRange,
  previewStrike,
  reachable,
  TERRAIN_FX,
  RADIAL_TARGETS,
} from "../logic/combat";

const CELL = 46; // fixed tile size; the board scrolls when bigger than the screen
const { width: SCREEN_W } = Dimensions.get("window");

// Active-status labels (shown in the unit panel / inspect popup).
const STATUS_LABEL = {
  injured: "🩹 Injured — can't counter this turn",
  burned: "🔥 Burned — −12.5% HP/turn",
  poisoned: "☠️ Poisoned — −12.5% HP/turn",
  frozen: "❄️ Frozen — −12.5% HP/turn",
  crushed: "🪨 Crushed — −12.5% HP/turn",
  shocked: "⚡ Shocked — −12.5% HP/turn",
  silenced: "🔇 Silenced — no abilities",
  slowed: "🐌 Slowed — no second strike",
  blinded: "🌫️ Blinded — accuracy halved",
  immobilized: "⛓️ Immobilized — can't move",
};
// Short glyph for the brief damage-over-time tick banner.
const DOT_GLYPH = { burned: "🔥", poisoned: "☠️", frozen: "❄️", crushed: "🪨", shocked: "⚡" };
// Every ability TYPE, with a short description and whether it's actually wired up yet
// (done:false ones are shown but marked "soon" so the UI stays honest).
const TYPE_INFO = {
  Damage: { label: "Damage", desc: "Standard attack", done: true },
  Maiming: { label: "Maiming", desc: "Cancels their counter on a hit", done: true },
  Obscuring: { label: "Obscuring", desc: "Halves their counter accuracy", done: true },
  Injuring: { label: "Injuring", desc: "Target can't counter this turn", done: true },
  Radial: { label: "Radial", desc: "Hits several enemies in range (no counters)", done: true },
  Meteor: { label: "Meteor", desc: "Ranged; ⅓ splash to adjacent enemies", done: true },
  Piercing: { label: "Piercing", desc: "Ignores the target's protection", done: true },
  Efficiency: { label: "Efficiency", desc: "×1.3 to a stat vs certain units", done: false },
  Brave: { label: "Brave", desc: "Two strikes before they counter", done: true },
  Absorption: { label: "Absorption", desc: "Heals you 50% of damage dealt", done: true },
  Burning: { label: "Burning", desc: "Inflicts Burn (−12.5% HP/turn, 2 turns)", done: true },
  Poisoning: { label: "Poisoning", desc: "Inflicts Poison (−12.5% HP/turn, 2 turns)", done: true },
  Freezing: { label: "Freezing", desc: "Inflicts Freeze (−12.5% HP/turn, 2 turns)", done: true },
  Crushing: { label: "Crushing", desc: "Inflicts Crush (−12.5% HP/turn, 2 turns)", done: true },
  Shocking: { label: "Shocking", desc: "Inflicts Shock (−12.5% HP/turn, 2 turns)", done: true },
  Silencing: { label: "Silencing", desc: "Silences — no abilities next turn", done: true },
  Slowing: { label: "Slowing", desc: "Slows — no second strike next turn", done: true },
  Blinding: { label: "Blinding", desc: "Blinds — accuracy halved next turn", done: true },
  Immobilizing: { label: "Immobilizing", desc: "Immobilizes — can't move next turn", done: true },
};
const typeInfo = (t) => TYPE_INFO[t] || { label: t, desc: "", done: false };

// Outcome → emoji + label, used everywhere so combat reads at a glance.
const OUTCOME = {
  hit: { emoji: "💥", word: "Hit", color: "#ff7a59" },
  crit: { emoji: "✨", word: "CRIT!", color: "#ffd23f" },
  miss: { emoji: "💨", word: "Miss", color: theme.textDim },
  block: { emoji: "🛡️", word: "Blocked", color: "#5bb0ff" },
};

export default function BattleScreen({ route, navigation }) {
  const { code, userId, initialState } = route.params;
  const [state, setState] = useState(initialState);
  const [terrain] = useState(initialState.terrain || []); // 2D tile-key grid, fixed for the match
  const [selectedId, setSelectedId] = useState(null);
  const [attackTarget, setAttackTarget] = useState(null); // enemy unit object
  const [casting, setCasting] = useState(null); // special object being aimed
  const [result, setResult] = useState(null); // last attack, for the emoji overlay
  const [castResult, setCastResult] = useState(null); // last special cast, for its overlay
  const [oppAway, setOppAway] = useState(false); // opponent temporarily disconnected
  const [inspect, setInspect] = useState(null); // { unit, r, c } for the inspect popup
  const [legendOpen, setLegendOpen] = useState(false); // full-screen help/legend
  const [tickInfo, setTickInfo] = useState(null); // last damage-over-time ticks, for a brief banner
  const vScroll = useRef(null);
  const hScroll = useRef(null);
  const scrolledRef = useRef(false);
  const hCenteredRef = useRef(false);
  const socket = getSocket();

  const rows = state.rows,
    cols = state.cols;
  const cell = CELL;

  const amHost = state.hostId === userId;
  const myTurn = state.turnUserId === userId && !state.over;
  const fromView = (p) => (amHost ? p : { r: rows - 1 - p.r, c: cols - 1 - p.c });
  const cellAt = (r, c) => (terrain[r] && terrain[r][c]) || { t: "normal", hg: false, stairs: false };

  useEffect(() => {
    const onState = (s) => setState(s);
    const onAttack = (res) => setResult(res);
    const onCast = (res) => setCastResult(res);
    const onLeft = () => Alert.alert("Opponent left", "The match has ended.");
    const onConnect = () => socket.emit("resume", { code, userId }); // re-join after a reconnect
    const onOppDisc = () => setOppAway(true);
    const onOppRecon = () => setOppAway(false);
    const onTick = (p) => setTickInfo(p && p.ticks && p.ticks.length ? p.ticks : null);
    socket.on("state", onState);
    socket.on("attackResult", onAttack);
    socket.on("specialResult", onCast);
    socket.on("statusTick", onTick);
    socket.on("opponentLeft", onLeft);
    socket.on("connect", onConnect);
    socket.on("opponentDisconnected", onOppDisc);
    socket.on("opponentReconnected", onOppRecon);
    return () => {
      socket.off("state", onState);
      socket.off("attackResult", onAttack);
      socket.off("specialResult", onCast);
      socket.off("statusTick", onTick);
      socket.off("opponentLeft", onLeft);
      socket.off("connect", onConnect);
      socket.off("opponentDisconnected", onOppDisc);
      socket.off("opponentReconnected", onOppRecon);
    };
  }, [socket, code, userId]);

  // Coming back to the foreground: make sure we're connected and re-sync the battle.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      if (!socket.connected) socket.connect();
      else socket.emit("resume", { code, userId });
    });
    return () => sub.remove();
  }, [socket, code, userId]);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 4000);
    return () => clearTimeout(t);
  }, [result]);
  useEffect(() => {
    if (!castResult) return;
    const t = setTimeout(() => setCastResult(null), 3500);
    return () => clearTimeout(t);
  }, [castResult]);
  useEffect(() => {
    if (!tickInfo) return;
    const t = setTimeout(() => setTickInfo(null), 3000);
    return () => clearTimeout(t);
  }, [tickInfo]);
  // When the game ends, clear every other overlay so the win/lose screen owns the view.
  useEffect(() => {
    if (state.over) {
      setResult(null);
      setCastResult(null);
      setAttackTarget(null);
      setCasting(null);
    }
  }, [state.over]);

  const units = state.units || {};
  const positions = state.positions || {};
  const selected = selectedId ? units[selectedId] : null;
  const selPos = selectedId ? positions[selectedId] : null;
  const selAlive = selected && selected.alive;
  const isMine = selected && selected.ownerId === userId;
  const moveLeft = selected ? (state.moveRemaining?.[selectedId] ?? getMoveValue(selected)) : 0;
  const hasActed = selectedId ? !!state.acted?.[selectedId] : false;
  const selStatuses = selected?.statuses || [];
  const isImmobilized = selStatuses.some((s) => s.type === "immobilized");
  const isSilenced = selStatuses.some((s) => s.type === "silenced");

  const moveCells = useMemo(() => {
    if (!selAlive || !selPos || !myTurn || casting || moveLeft <= 0 || isImmobilized) return new Set();
    const occupied = new Set(
      Object.entries(positions)
        .filter(([id]) => Number(id) !== Number(selectedId))
        .map(([, p]) => `${p.r}:${p.c}`)
    );
    return reachable(
      selPos,
      moveLeft,
      (r, c) => cellAt(r, c),
      (r, c) => occupied.has(`${r}:${c}`),
      rows,
      cols
    ).cells;
  }, [selAlive, selPos, myTurn, casting, moveLeft, positions, rows, cols, selectedId, isImmobilized]);

  const maxRange = useMemo(() => {
    if (!selected) return 1;
    const ranges = [
      getAttackRange(selected, null),
      ...(selected.abilities || []).map((n) => getAttackRange(selected, findAbility(selected, n))),
    ];
    return Math.max(...ranges);
  }, [selected]);

  // Enemies attackable with a weapon/ability (only when NOT aiming a special).
  const targetableIds = useMemo(() => {
    if (!selAlive || !selPos || !myTurn || hasActed || casting) return new Set();
    const out = new Set();
    for (const [id, u] of Object.entries(units)) {
      if (u.ownerId === userId || !u.alive) continue;
      if (inRange(selPos, positions[id], maxRange)) out.add(Number(id));
    }
    return out;
  }, [selAlive, selPos, myTurn, hasActed, casting, units, positions, maxRange, userId]);

  // Units a special can be cast on: self + any alive unit within the special's range.
  const castTargets = useMemo(() => {
    if (!casting || !selAlive || !selPos || !myTurn) return new Set();
    const range = Math.max(1, Number(casting.range) || 1);
    const out = new Set([Number(selectedId)]); // self always allowed
    for (const [id, u] of Object.entries(units)) {
      if (!u.alive) continue;
      if (inRange(selPos, positions[id], range)) out.add(Number(id));
    }
    return out;
  }, [casting, selAlive, selPos, myTurn, units, positions, selectedId]);

  // Long-press any unit (ally or enemy) to inspect its full stats.
  const onCellLongPress = (abs) => {
    const occId = occupantAt(positions, abs);
    if (occId != null && units[occId] && units[occId].alive) setInspect({ unit: units[occId], r: abs.r, c: abs.c });
  };

  const onCellPress = (abs) => {
    const occId = occupantAt(positions, abs);
    if (casting) {
      // aiming a special — only target picks matter
      if (occId != null && castTargets.has(occId)) {
        socket.emit("cast", { code, casterId: selectedId, targetId: occId, specialName: casting.name }, (res) => {
          if (res?.error) Alert.alert("Cannot cast", res.error);
        });
        setCasting(null);
      }
      return;
    }
    if (occId != null) {
      const u = units[occId];
      if (u.ownerId === userId) {
        if (u.alive) setSelectedId(occId);
        return;
      }
      if (selected && targetableIds.has(occId)) setAttackTarget(u);
      return;
    }
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
  };

  const endTurn = () => {
    setSelectedId(null);
    setCasting(null);
    socket.emit("endTurn", { code }, (res) => {
      if (res?.error) Alert.alert("Error", res.error);
    });
  };
  const leave = () => {
    socket.emit("leaveRoom");
    navigation.popToTop();
  };

  const viewGrid = [];
  for (let vr = 0; vr < rows; vr++) {
    const row = [];
    for (let vc = 0; vc < cols; vc++) row.push(fromView({ r: vr, c: vc }));
    viewGrid.push(row);
  }

  const mySpecials = isMine && selected.type === "mage" ? selected.specials || [] : [];

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={leave}>
          <Text style={styles.leave}>‹ Leave</Text>
        </TouchableOpacity>
        <Text style={[styles.turn, { color: state.over ? theme.warn : myTurn ? theme.good : theme.textDim }]}>
          {state.over ? "Game over" : myTurn ? "🟢 Your turn" : "⏳ Opponent's turn"}
        </Text>
        <Text style={styles.code}>#{code}</Text>
      </View>

      {oppAway && !state.over && (
        <View style={styles.awayBanner}>
          <Text style={styles.awayText}>⏳ Opponent stepped away — waiting for them to return…</Text>
        </View>
      )}

      {tickInfo && !state.over && (
        <View style={styles.tickBanner}>
          {tickInfo.map((t, i) => {
            const u = units[t.unitId] || {};
            const mine = u.ownerId === userId;
            return (
              <Text key={i} style={[styles.tickText, { color: mine ? theme.mine : theme.enemy }]}>
                {DOT_GLYPH[t.type] || "☠️"} {u.name || "Unit"} took {t.damage} ({STATUS_LABEL[t.type]?.split(" ")[1] || t.type})
              </Text>
            );
          })}
        </View>
      )}

      {/* Big board: scrolls vertically (outer) and horizontally (inner). */}
      <ScrollView
        ref={vScroll}
        style={styles.boardViewport}
        contentContainerStyle={{ alignItems: "center" }}
        onContentSizeChange={() => {
          if (!scrolledRef.current && vScroll.current) {
            vScroll.current.scrollToEnd({ animated: false });
            scrolledRef.current = true;
          }
        }}
      >
        <ScrollView
          ref={hScroll}
          horizontal
          contentContainerStyle={{ padding: 6 }}
          showsHorizontalScrollIndicator
          onContentSizeChange={(w) => {
            if (!hCenteredRef.current && hScroll.current) {
              hScroll.current.scrollTo({ x: Math.max(0, (w - SCREEN_W) / 2), animated: false });
              hCenteredRef.current = true;
            }
          }}
        >
          <View style={styles.board}>
            {viewGrid.map((row, vr) => (
              <View key={vr} style={{ flexDirection: "row" }}>
                {row.map((abs, vc) => {
                  const occId = occupantAt(positions, abs);
                  const u = occId != null ? units[occId] : null;
                  const mine = u && u.ownerId === userId;
                  const isSelected = occId === selectedId;
                  const isMove = moveCells.has(`${abs.r}:${abs.c}`);
                  const isTarget = occId != null && targetableIds.has(occId);
                  const isCast = occId != null && castTargets.has(occId);
                  const tc = cellAt(abs.r, abs.c);
                  const tile = tileFor(tc.t);
                  return (
                    <TouchableOpacity
                      key={vc}
                      activeOpacity={0.7}
                      onPress={() => onCellPress(abs)}
                      onLongPress={() => onCellLongPress(abs)}
                      delayLongPress={300}
                      style={[
                        styles.cell,
                        { width: cell, height: cell, backgroundColor: tile.color },
                        tc.hg && styles.cellHigh,
                        isSelected && styles.cellSelected,
                      ]}
                    >
                      {/* terrain features */}
                      {!u && tc.stairs && <Stairs dir={tc.sd} joinerMirror={!amHost} />}
                      {/* movement / target highlights wash the whole tile */}
                      {isMove && <View style={[styles.overlay, styles.ovMove]} />}
                      {isMove && (
                        <View style={styles.moveMark} pointerEvents="none">
                          <View style={styles.moveDot} />
                        </View>
                      )}
                      {isTarget && <View style={[styles.overlay, styles.ovTarget]} />}
                      {isCast && <View style={[styles.overlay, styles.ovCast]} />}
                      {/* the unit: a small round piece so the tile shows around it */}
                      {u && (
                        <View
                          style={[
                            styles.token,
                            { backgroundColor: mine ? theme.mine : theme.enemy, opacity: u.alive ? 1 : 0.35 },
                          ]}
                        >
                          <Text style={styles.tokenGlyph}>{u.alive ? WEAPON_GLYPH[u.base_weapon] || "⚔️" : "💀"}</Text>
                        </View>
                      )}
                      {u && u.alive && (
                        <View style={styles.hpBar}>
                          <View style={[styles.hpFill, { width: `${Math.max(0, (u.health / u.maxHealth) * 100)}%` }]} />
                        </View>
                      )}
                      {/* tile labels stay on top so you can always read the tile, even when occupied */}
                      {!!tile.glyph && <Text style={styles.cornerGlyph}>{tile.glyph}</Text>}
                      {tc.hg && (
                        <View style={styles.hgBadge}>
                          <Text style={styles.hgText}>HG</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>

      {/* Casting banner */}
      {casting && (
        <View style={styles.castBanner}>
          <Text style={styles.castBannerText}>
            ✨ Casting {casting.name} — tap a ✨ target (range {casting.range})
          </Text>
          <TouchableOpacity onPress={() => setCasting(null)}>
            <Text style={styles.castCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Only mages need a bottom box (to cast specials); everything else is the popup + board. */}
      {isMine && selected && selected.type === "mage" && mySpecials.length > 0 ? (
        <MageSpecials
          u={selected}
          specials={mySpecials}
          casting={casting}
          acted={hasActed}
          silenced={isSilenced}
          myTurn={myTurn}
          onCast={(name) => setCasting(findAbility(selected, name))}
        />
      ) : !selected ? (
        <Text style={styles.selectHint}>{myTurn ? "Tap a unit to act" : "Opponent's turn"}</Text>
      ) : null}

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.legendBtn} onPress={() => setLegendOpen(true)}>
          <Text style={styles.legendBtnText}>📖 Legend</Text>
        </TouchableOpacity>
        <TornButton
          wrapStyle={[{ flex: 1 }, !myTurn && { opacity: 0.4 }]}
          style={styles.endBtn}
          disabled={!myTurn || state.over}
          onPress={endTurn}
        >
          <Text style={styles.endText}>End Turn</Text>
        </TornButton>
      </View>

      <LegendModal visible={legendOpen} onClose={() => setLegendOpen(false)} />

      {/* Inspect any unit (long-press) — compact popup */}
      <Modal visible={!!inspect} transparent animationType="fade" onRequestClose={() => setInspect(null)}>
        <Pressable style={styles.resultBackdrop} onPress={() => setInspect(null)}>
          {inspect &&
            (() => {
              const tc = cellAt(inspect.r, inspect.c);
              return (
                <InspectCard
                  u={inspect.unit}
                  tile={tileFor(tc.t)}
                  tileKey={tc.t}
                  high={tc.hg}
                  mine={inspect.unit.ownerId === userId}
                />
              );
            })()}
        </Pressable>
      </Modal>

      {/* Attack chooser */}
      <Modal visible={!!attackTarget} transparent animationType="slide" onRequestClose={() => setAttackTarget(null)}>
        <View style={styles.backdrop}>
          <Torn style={styles.sheet}>
            {attackTarget && selected && (
              <AttackChooser
                attacker={selected}
                target={attackTarget}
                silenced={isSilenced}
                dist={manhattan(selPos, positions[attackTarget.id] || selPos)}
                atkTile={selPos ? cellAt(selPos.r, selPos.c) : null}
                defTile={
                  positions[attackTarget.id] ? cellAt(positions[attackTarget.id].r, positions[attackTarget.id].c) : null
                }
                onPick={doAttack}
                onCancel={() => setAttackTarget(null)}
              />
            )}
          </Torn>
        </View>
      </Modal>

      {/* Attack result overlay */}
      <Modal visible={!!result} transparent animationType="fade" onRequestClose={() => setResult(null)}>
        <Pressable style={styles.resultBackdrop} onPress={() => setResult(null)}>
          {result && (result.aoe
            ? <AoEResultCard result={result} units={units} userId={userId} />
            : <ResultCard result={result} units={units} userId={userId} />)}
        </Pressable>
      </Modal>

      {/* Cast result overlay */}
      <Modal visible={!!castResult} transparent animationType="fade" onRequestClose={() => setCastResult(null)}>
        <Pressable style={styles.resultBackdrop} onPress={() => setCastResult(null)}>
          {castResult && <CastCard res={castResult} units={units} userId={userId} />}
        </Pressable>
      </Modal>

      {/* Game over — big, animated, center screen. Rendered as an absolute overlay (NOT a
          Modal) so it can't conflict with the attack/cast result Modals. */}
      {state.over && <GameOverOverlay win={state.winnerId === userId} onExit={leave} />}
    </View>
  );
}

// ─────────────────────────── Game over ───────────────────────────
function GameOverOverlay({ win, onExit }) {
  const pop = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.12,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1.0,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);
  return (
    <View style={[styles.goBackdrop, { backgroundColor: win ? "rgba(8,30,20,0.92)" : "rgba(30,8,12,0.92)" }]}>
      <Animated.View
        style={{ alignItems: "center", opacity: pop, transform: [{ scale: Animated.multiply(pop, pulse) }] }}
      >
        <Text style={styles.goEmoji}>{win ? "🏆" : "☠️"}</Text>
        <Text style={[styles.goText, { color: win ? theme.warn : theme.danger }]}>{win ? "VICTORY" : "DEFEAT"}</Text>
        <Text style={styles.goSub}>{win ? "The foe's banner has fallen!" : "Your warband lies broken."}</Text>
      </Animated.View>
      <TornButton
        style={[styles.goExit, { backgroundColor: win ? theme.good : theme.danger, borderColor: theme.gold }]}
        onPress={onExit}
      >
        <Text style={styles.goExitText}>Return to the Keep</Text>
      </TornButton>
    </View>
  );
}

// ─────────────────── Mage specials (the only bottom box that remains) ───────────────────
function MageSpecials({ u, specials, casting, acted, myTurn, silenced, onCast }) {
  return (
    <View style={styles.mageBox}>
      <Text style={styles.specialsTitle}>
        ✨ {u.name} — Specials {silenced ? "🔇 (silenced)" : acted ? "(action used)" : ""}
      </Text>
      <View style={styles.specialsRow}>
        {specials.map((name) => {
          const ab = findAbility(u, name);
          const active = casting && casting.name === name;
          const disabled = acted || !myTurn || silenced;
          return (
            <TouchableOpacity
              key={name}
              disabled={disabled}
              onPress={() => onCast(name)}
              style={[styles.specialBtn, active && styles.specialBtnActive, silenced && styles.specialLocked, disabled && { opacity: 0.4 }]}
            >
              <Text style={styles.specialName}>{silenced ? "🔒 " : ""}{name}</Text>
              <Text style={styles.specialMeta}>
                {silenced ? "silenced" : `${ab?.effect} · range ${ab?.range}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
const Stat = ({ icon, label, v, small }) => (
  <View style={styles.statCell}>
    <Text style={[styles.statLbl, small && { fontSize: 9 }]}>
      {icon ? icon + " " : ""}
      {label}
    </Text>
    <Text style={[styles.statVal, small && { fontSize: 14 }]}>{v}</Text>
  </View>
);

// ─────────────────────── Inspect popup (any unit, incl. enemies) ───────────────────────
function InspectCard({ u, tile, tileKey, high, mine }) {
  const s = computeAllStats(u, null);
  const prot = u.type === "mage" ? s.protection.magic : s.protection.melee;
  const terrFx = fxList(TERRAIN_FX[tileKey]);
  const attacks = [
    { name: `Basic ${cap(u.base_weapon)}`, type: "Damage" },
    ...(u.abilities || []).map((nm) => ({ name: nm, type: (findAbility(u, nm) || {}).type || "Damage" })),
  ];
  return (
    <View style={[styles.inspectCard, { borderColor: mine ? theme.mine : theme.enemy }]}>
      <View style={styles.statsHead}>
        <Text style={styles.statsGlyph}>{WEAPON_GLYPH[u.base_weapon] || "⚔️"}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.statsName}>{u.name}</Text>
          <Text style={styles.statsSub}>
            {cap(u.type)} · Size {u.size} · {cap(u.base_weapon)} ·{" "}
            <Text style={{ color: mine ? theme.mine : theme.enemy, fontWeight: "700" }}>{mine ? "Ally" : "Enemy"}</Text>
          </Text>
        </View>
        <Text style={styles.hpText}>
          ❤️ {u.health}/{u.maxHealth}
        </Text>
      </View>
      <View style={styles.statRow}>
        <Stat icon="⚔️" label="Pwr" v={s.power} />
        <Stat icon="🛡️" label="Prot" v={prot} />
        <Stat icon="🎯" label="Hit" v={s.hitBase} />
        <Stat icon="💨" label="Eva" v={s.evasion} />
        <Stat icon="✨" label="Crit" v={s.critical} />
        <Stat icon="🧱" label="Blk" v={s.block} />
      </View>
      <View style={styles.statRow}>
        <Stat label="Str" v={u.strength} small />
        <Stat label="Def" v={u.defense} small />
        <Stat label="Mgk" v={u.magick} small />
        <Stat label="Res" v={u.resistance} small />
        <Stat label="Spd" v={u.speed} small />
        <Stat label="Skl" v={u.skill} small />
        <Stat label="Knl" v={u.knowledge} small />
        <Stat label="Lck" v={u.luck} small />
      </View>
      {(terrFx || high) && (
        <Text style={styles.terrLine}>
          🗺 {tile?.name}
          {terrFx ? "  " + terrFx : ""}
          {high ? "   ⬆ High Ground" : ""}
        </Text>
      )}
      {(u.statuses || []).length > 0 && (
        <Text style={styles.statusLine}>
          {(u.statuses || []).map((st) => STATUS_LABEL[st.type] || st.type).join("   ·   ")}
        </Text>
      )}
      <View style={styles.attacksBox}>
        <Text style={styles.attacksTitle}>⚔️ Attacks</Text>
        {attacks.map((atk, i) => {
          const info = typeInfo(atk.type);
          return (
            <Text key={i} style={styles.attackItem}>
              • {atk.name} — <Text style={{ color: info.done ? theme.good : theme.textDim }}>{info.label}</Text>
            </Text>
          );
        })}
        {u.type === "mage" && (u.specials || []).length > 0 && (
          <Text style={[styles.attackItem, { marginTop: 4 }]}>✨ Specials: {u.specials.join(", ")}</Text>
        )}
      </View>
      <Text style={styles.tapDismiss}>tap outside to close</Text>
    </View>
  );
}

// ─────────────────────────── Legend / help (full screen) ───────────────────────────
const LEGEND_TERRAIN = [
  { key: "normal", desc: "Open ground — no combat effect." },
  { key: "forest", desc: "💨 Eva ×1.2 — cover to dodge." },
  { key: "mountain", desc: "🎯 Acc ×1.15  ·  💨 Eva ×0.85 — high vantage, exposed." },
  { key: "water", desc: "🎯 Acc ×0.85  ·  💨 Eva ×0.85 — slows you down." },
  { key: "desert", desc: "🎯 Acc ×0.8  ·  💨 Eva ×0.8 — harsh footing." },
  { key: "town", desc: "🛡 Def ×1.1  ·  💨 Eva ×1.15  ·  🎯 Acc ×0.85 — shelter." },
  { key: "fort", desc: "🛡 Def ×1.1  ·  🎯 Acc ×1.1  ·  💨 Eva ×1.15 — walls are high ground." },
  { key: "castle", desc: "🛡 Def ×1.15  ·  🎯 Acc ×1.15  ·  💨 Eva ×1.15 — stronghold." },
  { key: "bridge", desc: "Crosses water — no combat effect." },
];

function LegendModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.legendBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.legendCard}>
          <View style={styles.legendHeader}>
            <Text style={styles.legendTitle}>📖 Legend</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.legendX}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 10 }}>
            <Text style={styles.legendSection}>🗺 Terrain</Text>
            <Text style={styles.legendNote}>
              🛡 Defense = damage taken & block chance{"\n"}
              🎯 Accuracy = hit chance{"\n"}
              💨 Evasion = dodge chance{"\n"}
              In combat each unit uses the effects of the tile it's standing on.
            </Text>
            {LEGEND_TERRAIN.map((t) => {
              const tile = TILES[t.key] || {};
              return (
                <View key={t.key} style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: tile.color }]}>
                    <Text style={styles.legendSwatchGlyph}>{tile.glyph}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.legendName}>{tile.name}</Text>
                    <Text style={styles.legendDesc}>{t.desc}</Text>
                  </View>
                </View>
              );
            })}

            <Text style={styles.legendSection}>⬆ High Ground</Text>
            <Text style={styles.legendDesc}>
              Raised terrain (fort walls, some castles), marked with an "HG" badge. The unit on high ground gets 🎯 Acc
              ×1.15; a low‑ground foe it fights gets 🎯 Acc ×0.85 (only when one side is high). Stacks with the tile's
              own terrain.
            </Text>

            <Text style={styles.legendSection}>𓊍 Stairways</Text>
            <Text style={styles.legendDesc}>
              The only way up to — or down from — high ground. Step onto a stair tile, then onto the adjacent
              high‑ground tile. You can't hop a wall straight from open ground.
            </Text>

            <Text style={styles.legendSection}>🔍 Inspecting Units</Text>
            <Text style={styles.legendDesc}>
              Long‑press any unit — yours or your opponent's — to see its full stats, weapon, abilities and the terrain
              it's on.
            </Text>

            <Text style={styles.legendSection}>📊 Battle Stats</Text>
            <Text style={styles.legendDesc}>
              💪 Power — your hitting power (Strength for melee, Magick for mages).{"\n"}
              🛡 Protection — cuts incoming damage; Defense stops physical, Resistance stops magic. Hit a foe where they're soft.{"\n"}
              🎯 Accuracy — raises your hit chance AND lowers the enemy's block chance. Beats evasive and defensive units.{"\n"}
              💨 Evasion — your dodge; lowers the attacker's hit chance.{"\n"}
              ✨ Critical — crit chance vs the target's Luck; a crit deals ×1.5 damage.{"\n"}
              🧱 Block — chance to fully negate a hit (vs the attacker's Accuracy).
            </Text>

            <Text style={styles.legendSection}>🗡️ Weapon Strengths</Text>
            <Text style={styles.legendDesc}>
              Each weapon family boosts a stat — lean into it:{"\n"}
              🪓 Axe / 🔥 Fire — Power ×1.5 (hard hitters){"\n"}
              ⚔️ Sword / 💧 Water — Evasion ×1.5 (slippery duelists){"\n"}
              🔱 Lance / 🪨 Earth — Protection ×1.5 (tanks){"\n"}
              🏹 Bow / ✨ Aether — Accuracy ×1.5 (reliable, beats blockers){"\n"}
              🌪️ Wind — Accuracy & Evasion ×1.25, and +1 Move{"\n"}
              ☀️ Light — Protection & Accuracy ×1.25{"\n"}
              🌑 Dark — Power & Protection ×1.25{"\n"}
              🥊 Gauntlets / 🌫️ Gray — Luck ×1.5 (more crits, blocks, and resists enemy crits)
            </Text>

            <Text style={styles.legendSection}>🦶 Movement & Range</Text>
            <Text style={styles.legendDesc}>
              Move budget per turn: 5 (melee) / 4 (mage), +1 with Wind. You can split it — move, attack, then move again.{"\n"}
              Attacks reach orthogonally only (no diagonals). Most weapons hit adjacent; bows and some abilities reach 2–4 tiles.
            </Text>

            <Text style={styles.legendSection}>⚔️ Combat</Text>
            <Text style={styles.legendDesc}>
              Attacks resolve you → them → you → them, stopping the moment someone falls. The defender only counters if it can reach you and isn't Injured.{"\n"}
              Damage = your Power − their Protection. A hit can miss (their Evasion), be blocked (their Block vs your Accuracy), or crit (your Critical vs their Luck, ×1.5).{"\n"}
              Open an attack to preview its damage, hit %, block %, crit % and effect.
            </Text>
          </ScrollView>
          <TouchableOpacity style={styles.legendClose} onPress={onClose}>
            <Text style={styles.legendCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────── Attack chooser ───────────────────────────
function AttackChooser({ attacker, target, dist, onPick, onCancel, atkTile, defTile, silenced }) {
  const options = [
    {
      name: null,
      label: `Basic ${cap(attacker.base_weapon)}`,
      ability: null,
      icon: WEAPON_GLYPH[attacker.base_weapon] || "⚔️",
    },
    ...(attacker.abilities || []).map((n) => ({ name: n, label: n, ability: findAbility(attacker, n), icon: "🔥" })),
  ];
  const terr = terrainNote(atkTile, defTile);
  return (
    <>
      <Text style={styles.sheetTitle}>
        {WEAPON_GLYPH[attacker.base_weapon]} {attacker.name} → {target.name}
      </Text>
      <Text style={styles.sheetSub}>
        📏 Distance {dist}
        {"   "}❤️ {target.health}/{target.maxHealth}
      </Text>
      {!!terr && <Text style={styles.terrNote}>{terr}</Text>}
      {silenced && <Text style={styles.terrNote}>🔇 Silenced — abilities are unavailable this turn</Text>}
      {options.map((opt, i) => {
        const range = getAttackRange(attacker, opt.ability);
        const blocked = silenced && !!opt.name; // basic attack (name=null) is always allowed
        const reach = dist <= range && !blocked;
        const p = previewStrike(attacker, target, opt.ability, atkTile, defTile);
        return (
          <TouchableOpacity
            key={i}
            disabled={!reach}
            onPress={() => onPick(opt.name)}
            style={[styles.optRow, !reach && styles.optDisabled]}
          >
            <Text style={styles.optIcon}>{opt.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.optName}>
                {blocked ? "🔒 " : ""}
                {opt.label}
                {blocked ? "  (silenced)" : !reach ? `  (needs range ${range})` : ""}
              </Text>
              <Text style={styles.optMeta}>
                💥 ~{p.damage} 🎯 {p.hitPct}% 🛡️ {p.blockPct}% ✨ {p.critPct}% 📏 {range}
              </Text>
              {(() => {
                const t = opt.ability && opt.ability.type;
                if (t === "Radial") {
                  const n = RADIAL_TARGETS[opt.name] ?? 3;
                  return <Text style={styles.aoeNote}>🌀 hits up to {n === Infinity ? "all" : n} enemies in range · no counters</Text>;
                }
                if (t === "Meteor") return <Text style={styles.aoeNote}>☄️ primary + ⅓ splash to adjacent enemies · no counters</Text>;
                return null;
              })()}
              {(() => {
                const info = typeInfo(opt.ability ? opt.ability.type : "Damage");
                return (
                  <Text style={[styles.optEffect, !info.done && styles.optEffectSoon]}>
                    {info.label}
                    {info.desc ? " · " + info.desc : ""}
                    {!info.done ? "  (soon)" : ""}
                  </Text>
                );
              })()}
            </View>
            {reach && <Text style={styles.optGo}>›</Text>}
          </TouchableOpacity>
        );
      })}
      <Text style={styles.sheetNote}>
        You strike, they counter, you strike, they counter — stops the moment someone falls.
      </Text>
      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </>
  );
}

// ─────────────────────────── Result overlays ───────────────────────────
function ResultCard({ result, units, userId }) {
  const atk = units[result.attackerId] || {};
  const def = units[result.defenderId] || {};
  const atkMine = atk.ownerId === userId;
  const rows = (result.events || []).map((e, i) => {
    const actor = e.by === "attacker" ? atk : def;
    const o = OUTCOME[e.type] || OUTCOME.hit;
    return {
      key: i,
      name: actor.name || "?",
      glyph: WEAPON_GLYPH[actor.base_weapon] || "⚔️",
      actorMine: actor.ownerId === userId,
      o,
      dmg: e.damage,
    };
  });
  return (
    <Torn style={styles.resultCard} strokeWidth={2}>
      <Text style={styles.resultTitle}>
        <Text style={{ color: atkMine ? theme.mine : theme.enemy }}>
          {WEAPON_GLYPH[atk.base_weapon]}
          {atk.name}
        </Text>{" "}
        ⚔️ <Text style={{ color: atkMine ? theme.enemy : theme.mine }}>{def.name}</Text>
      </Text>
      {rows.map((r) => (
        <View key={r.key} style={styles.resultRow}>
          <Text style={[styles.resultActor, { color: r.actorMine ? "#7db4ff" : "#ff8aa0" }]} numberOfLines={1}>
            {r.glyph} {r.name}
          </Text>
          <Text style={styles.resultEmoji}>{r.o.emoji}</Text>
          <Text style={[styles.resultText, { color: r.o.color }]}>
            {r.dmg > 0 ? `−${r.dmg}${r.o.word === "CRIT!" ? " CRIT!" : ""}` : r.o.word}
          </Text>
        </View>
      ))}
      <View style={styles.resultFooter}>
        {result.defenderHp <= 0 ? (
          <Text style={styles.deadText}>☠️ {def.name} defeated!</Text>
        ) : (
          <Text style={styles.hpAfter}>
            {def.name}: ❤️ {Math.max(0, result.defenderHp)}
          </Text>
        )}
        {result.attackerHp <= 0 && <Text style={styles.deadText}>☠️ {atk.name} defeated!</Text>}
      </View>
      <Text style={styles.tapDismiss}>tap to dismiss</Text>
    </Torn>
  );
}

// Multi-target (Radial / Meteor) result: the attacker plus one row per enemy struck.
function AoEResultCard({ result, units, userId }) {
  const atk = units[result.attackerId] || {};
  const atkMine = atk.ownerId === userId;
  const targets = result.targets || [];
  return (
    <Torn style={styles.resultCard} strokeWidth={2}>
      <Text style={styles.resultTitle}>
        <Text style={{ color: atkMine ? theme.mine : theme.enemy }}>
          {WEAPON_GLYPH[atk.base_weapon]}{atk.name}
        </Text>{" "}
        🌀 {result.abilityName}
      </Text>
      {targets.map((t, i) => {
        const u = units[t.targetId] || {};
        const o = OUTCOME[t.type] || OUTCOME.hit;
        return (
          <View key={i} style={styles.resultRow}>
            <Text style={[styles.resultActor, { color: u.ownerId === userId ? "#7db4ff" : "#ff8aa0" }]} numberOfLines={1}>
              {WEAPON_GLYPH[u.base_weapon] || "⚔️"} {u.name || "?"}{t.dmgMult !== 1 ? " (splash)" : ""}
            </Text>
            <Text style={styles.resultEmoji}>{o.emoji}</Text>
            <Text style={[styles.resultText, { color: o.color }]}>
              {t.hp <= 0 ? "☠️" : t.damage > 0 ? `−${t.damage}${t.type === "crit" ? " CRIT!" : ""}` : o.word}
            </Text>
          </View>
        );
      })}
      <Text style={styles.tapDismiss}>tap to dismiss</Text>
    </Torn>
  );
}

function CastCard({ res, units, userId }) {
  const caster = units[res.casterId] || {};
  const target = units[res.targetId] || {};
  const mine = caster.ownerId === userId;
  return (
    <Torn style={styles.resultCard} strokeWidth={2}>
      <Text style={styles.castBig}>✨</Text>
      <Text style={styles.resultTitle}>
        <Text style={{ color: mine ? theme.mine : theme.enemy }}>{caster.name}</Text> casts {res.specialName}
      </Text>
      <Text style={styles.castOn}>on {res.casterId === res.targetId ? "themselves" : target.name}</Text>
      <Text style={styles.castEffect}>
        {res.effect} — {res.description}
      </Text>
      <Text style={styles.tapDismiss}>tap to dismiss</Text>
    </Torn>
  );
}

// Hand-built staircase: stacked treads, each higher one shorter and offset right,
// with a lit top edge and shadowed riser so it reads as steps climbing up-right.
function Stairs({ dir, joinerMirror }) {
  const N = 4;
  // dir: "flipX"/"flipY" mirror; "cw90"/"ccw90" or any number (degrees, +clockwise) rotate.
  const t = [];
  if (dir === "flipX") t.push({ scaleX: -1 });
  else if (dir === "flipY") t.push({ scaleY: -1 });
  else if (dir === "cw90") t.push({ rotate: "90deg" });
  else if (dir === "ccw90") t.push({ rotate: "-90deg" });
  else if (dir && !isNaN(Number(dir))) t.push({ rotate: `${Number(dir)}deg` });
  if (joinerMirror) t.push({ scaleX: -1 }); // joiner sees the board flipped, so mirror stairs on the vertical axis
  const transform = t.length ? t : undefined;
  return (
    <View style={[styles.stairsBox, transform && { transform }]} pointerEvents="none">
      {Array.from({ length: N }).map((_, i) => (
        <View key={i} style={[styles.tread, { bottom: 4 + i * 8, left: 4 + i * 8, right: 4, height: 8 }]} />
      ))}
    </View>
  );
}

function occupantAt(positions, abs) {
  for (const [id, p] of Object.entries(positions)) if (p.r === abs.r && p.c === abs.c) return Number(id);
  return null;
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Compact terrain-effect string, e.g. "🛡×1.1 🎯×1.1 💨×1.15".
function fxList(fx) {
  if (!fx) return "";
  const p = [];
  if (fx.def && fx.def !== 1) p.push(`🛡×${fx.def}`);
  if (fx.acc && fx.acc !== 1) p.push(`🎯×${fx.acc}`);
  if (fx.eva && fx.eva !== 1) p.push(`💨×${fx.eva}`);
  return p.join(" ");
}

// Terrain context for the attack chooser: attacker's tile, foe's tile, and high-ground edge.
function terrainNote(atkTile, defTile) {
  if (!atkTile || !defTile) return "";
  const lines = [];
  const a = fxList(TERRAIN_FX[atkTile.t]);
  const d = fxList(TERRAIN_FX[defTile.t]);
  if (a) lines.push(`You · ${cap(atkTile.t)}  ${a}`);
  if (d) lines.push(`Foe · ${cap(defTile.t)}  ${d}`);
  if (atkTile.hg && !defTile.hg) lines.push("⬆ High ground — your 🎯 ×1.15");
  else if (!atkTile.hg && defTile.hg) lines.push("⬇ Low ground — your 🎯 ×0.85");
  return lines.join("\n");
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, paddingTop: 44 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  leave: { color: theme.textDim, fontSize: 16 },
  turn: { fontFamily: FONTS.heading, fontSize: 15, letterSpacing: 1 },
  code: { fontFamily: FONTS.headingReg, color: theme.textDim },
  awayBanner: {
    backgroundColor: "#3a2a14",
    marginHorizontal: 10,
    marginTop: 4,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: theme.warn,
  },
  awayText: { color: theme.warn, fontSize: 12, textAlign: "center", fontWeight: "600" },
  tickBanner: {
    backgroundColor: "#241018",
    marginHorizontal: 10,
    marginTop: 4,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#7a2a3a",
  },
  tickText: { fontSize: 12, textAlign: "center", fontWeight: "700" },
  sideLabel: {
    fontFamily: FONTS.headingReg,
    color: theme.textDim,
    fontSize: 12,
    textAlign: "center",
    marginVertical: 2,
    letterSpacing: 1,
  },
  boardViewport: { flex: 1, alignSelf: "stretch" },
  board: { borderWidth: 3, borderColor: theme.border },
  cell: { alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: "#00000040" },
  cellSelected: { borderColor: theme.gold, borderWidth: 2.5 },
  cellHigh: { borderWidth: 2, borderColor: "#1c1a12" },
  tileGlyph: { fontSize: 20, opacity: 0.9 },
  cornerGlyph: { position: "absolute", top: 0, right: 1, fontSize: 13 },
  stairsBox: { ...StyleSheet.absoluteFillObject },
  tread: {
    position: "absolute",
    backgroundColor: "#e6dcc2", // lit tread
    borderTopWidth: 1.5,
    borderTopColor: "#fbf4e2", // highlight on the step edge
    borderBottomWidth: 2,
    borderBottomColor: "#5b4a2c", // shadowed riser below
    borderLeftWidth: 1.5,
    borderLeftColor: "#7a6438",
  },
  hgBadge: {
    position: "absolute",
    top: 1,
    left: 1,
    backgroundColor: "rgba(18,14,7,0.85)",
    paddingHorizontal: 2,
    borderRadius: 2,
  },
  hgText: { color: "#ffe08a", fontSize: 7, fontWeight: "800", letterSpacing: 0.3 },
  overlay: { ...StyleSheet.absoluteFillObject },
  ovMove: { backgroundColor: "rgba(70,160,255,0.32)", borderWidth: 1.5, borderColor: "rgba(150,220,255,0.85)" },
  ovTarget: { backgroundColor: "rgba(200,70,60,0.55)" },
  ovCast: { backgroundColor: "rgba(120,200,130,0.5)" },
  moveMark: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  moveDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: "#aee3ff",
    borderWidth: 2,
    borderColor: "#0b3a5c",
  },
  token: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff", // bold white ring so it pops on any tile
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.55,
    shadowRadius: 2.5, // iOS lift
    elevation: 6, // Android lift
  },
  tokenGlyph: { fontSize: 16 },
  hpBar: {
    position: "absolute",
    bottom: 2,
    left: 8,
    right: 8,
    height: 3,
    backgroundColor: "#00000088",
    borderRadius: 2,
  },
  hpFill: { height: 3, backgroundColor: theme.hp, borderRadius: 2 },
  infoBar: {
    backgroundColor: theme.card,
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  infoHint: { color: theme.textDim, fontSize: 12, marginTop: 6 },

  castBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#143a2a",
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.good,
  },
  castBannerText: { color: theme.good, fontWeight: "700", flex: 1, fontSize: 13 },
  castCancel: { color: theme.danger, fontWeight: "700", marginLeft: 10 },

  statsScroll: { maxHeight: 250, marginTop: 8 },
  statsCard: { backgroundColor: theme.card, marginHorizontal: 10, borderRadius: 14, padding: 12, borderWidth: 1.5 },
  statsHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  statsGlyph: { fontSize: 30 },
  statsName: { fontFamily: FONTS.heading, color: theme.text, fontSize: 18, letterSpacing: 0.5 },
  statsSub: { color: theme.textDim, fontSize: 12, marginTop: 1 },
  hpText: { color: theme.text, fontWeight: "700", fontSize: 13 },
  hpTrack: { width: 90, height: 6, backgroundColor: "#00000055", borderRadius: 4, marginTop: 3 },
  hpTrackFill: { height: 6, backgroundColor: "#7CFF8E", borderRadius: 4 },
  statRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  statCell: { flex: 1, alignItems: "center" },
  statLbl: { color: theme.textDim, fontSize: 11 },
  statVal: { color: theme.text, fontSize: 17, fontWeight: "800", marginTop: 1 },
  moveLine: { color: theme.text, fontSize: 13, marginTop: 4, fontWeight: "600" },
  terrLine: { color: theme.warn, fontSize: 12, marginTop: 5, fontWeight: "600" },
  statusLine: { color: theme.danger, fontSize: 12, marginTop: 5, fontWeight: "700" },
  attacksBox: { marginTop: 8, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 },
  inspectCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 16,
    width: "100%",
    maxWidth: 340,
    borderWidth: 2,
  },
  attacksTitle: { color: theme.warn, fontWeight: "700", fontSize: 13, marginBottom: 4 },
  attackItem: { color: theme.text, fontSize: 12, marginBottom: 3 },

  mageBox: {
    backgroundColor: theme.card,
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  selectHint: { color: theme.textDim, fontSize: 12, textAlign: "center", marginTop: 10 },
  specialsBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 },
  specialsTitle: { color: theme.warn, fontWeight: "700", fontSize: 13, marginBottom: 6 },
  specialsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  specialBtn: {
    backgroundColor: theme.cardAlt,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.border,
    minWidth: "30%",
    flexGrow: 1,
  },
  specialBtnActive: { borderColor: theme.good, backgroundColor: "#143a2a" },
  specialLocked: { borderColor: "#555", backgroundColor: "#1a1a1a", borderStyle: "dashed" },
  specialName: { color: theme.text, fontWeight: "700", fontSize: 13 },
  specialMeta: { color: theme.textDim, fontSize: 11, marginTop: 2 },

  bottomBar: { flexDirection: "row", gap: 12, padding: 12, marginTop: "auto" },
  endBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
    borderColor: theme.gold,
  },
  legendBtn: {
    backgroundColor: theme.cardAlt,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: 54,
  },
  legendBtnText: { fontFamily: FONTS.heading, color: theme.text, fontSize: 13 },
  legendBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  legendCard: {
    backgroundColor: theme.bg,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.border,
    width: "100%",
    maxWidth: 480,
    maxHeight: "88%",
    padding: 16,
  },
  legendHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  legendTitle: { fontFamily: FONTS.display, color: theme.text, fontSize: 26 },
  legendX: { color: theme.textDim, fontSize: 22, fontWeight: "800" },
  legendSection: {
    fontFamily: FONTS.heading,
    color: theme.gold,
    fontSize: 15,
    marginTop: 14,
    marginBottom: 6,
    letterSpacing: 1,
  },
  legendNote: { color: theme.textDim, fontSize: 12, marginBottom: 8, fontStyle: "italic", lineHeight: 16 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 },
  legendSwatch: {
    width: 36,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#0007",
    alignItems: "center",
    justifyContent: "center",
  },
  legendSwatchGlyph: { fontSize: 17 },
  legendName: { fontFamily: FONTS.heading, color: theme.text, fontSize: 14 },
  legendDesc: { color: theme.textDim, fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  legendClose: {
    backgroundColor: theme.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.gold,
  },
  legendCloseText: { fontFamily: FONTS.heading, color: "#23170a", fontSize: 15, letterSpacing: 1 },
  endText: { fontFamily: FONTS.heading, color: "#23170a", fontSize: 16, letterSpacing: 1 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sheetTitle: { fontFamily: FONTS.heading, color: theme.text, fontSize: 20, letterSpacing: 0.5 },
  sheetSub: { color: theme.textDim, marginBottom: 8, marginTop: 4, fontSize: 14 },
  terrNote: { color: theme.warn, fontSize: 12, marginBottom: 12, fontWeight: "600", lineHeight: 17 },
  optRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.cardAlt,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  optDisabled: { opacity: 0.4 },
  optIcon: { fontSize: 24 },
  optName: { color: theme.text, fontWeight: "700", fontSize: 16 },
  optMeta: { color: theme.warn, fontSize: 13, marginTop: 4 },
  optEffect: { color: theme.good, fontSize: 12, marginTop: 3, fontStyle: "italic" },
  optEffectSoon: { color: theme.textDim },
  aoeNote: { color: "#e0b0ff", fontSize: 12, marginTop: 3, fontWeight: "700" },
  optGo: { color: theme.textDim, fontSize: 24 },
  sheetNote: { color: theme.textDim, fontSize: 12, marginVertical: 8, fontStyle: "italic" },
  cancelBtn: { padding: 14, alignItems: "center" },
  cancelText: { color: theme.danger, fontWeight: "700", fontSize: 15 },

  resultBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  resultCard: {
    backgroundColor: theme.card,
    borderRadius: 18,
    padding: 20,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: theme.border,
  },
  resultTitle: { fontFamily: FONTS.heading, color: theme.text, fontSize: 18, textAlign: "center", marginBottom: 6 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    marginTop: 8,
  },
  resultActor: { flex: 1, fontSize: 16, fontWeight: "700" },
  resultEmoji: { fontSize: 22, width: 34, textAlign: "center" },
  resultText: { fontSize: 18, fontWeight: "800", width: 110, textAlign: "right" },
  resultFooter: { marginTop: 12, alignItems: "center" },
  hpAfter: { color: theme.text, fontSize: 15, fontWeight: "700" },
  deadText: { color: theme.danger, fontSize: 16, fontWeight: "800", marginTop: 2 },
  tapDismiss: { color: theme.textDim, fontSize: 11, textAlign: "center", marginTop: 12 },
  castBig: { fontSize: 40, textAlign: "center", marginBottom: 4 },
  castOn: { color: theme.textDim, textAlign: "center", fontSize: 14 },
  castEffect: { color: theme.warn, textAlign: "center", fontSize: 13, marginTop: 10, fontStyle: "italic" },

  goBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    elevation: 30,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  goEmoji: { fontSize: 96 },
  goText: {
    fontFamily: FONTS.display,
    fontSize: 60,
    letterSpacing: 3,
    marginTop: 6,
    textShadowColor: "#000",
    textShadowRadius: 12,
  },
  goSub: { fontFamily: FONTS.headingReg, color: theme.text, fontSize: 15, marginTop: 12, letterSpacing: 1 },
  goExit: {
    marginTop: 50,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.gold,
  },
  goExitText: { fontFamily: FONTS.heading, color: "#fff", fontSize: 17, letterSpacing: 1 },
});
