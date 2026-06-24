import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { theme, FONTS, WEAPON_GLYPH, STAT_LABELS } from "../theme";
import { Torn, TornButton } from "../components/Torn";
import { computeAllStats, getMoveValue } from "../logic/combat";

const SIZE_REQ = { 4: 1, 3: 2, 2: 2, 1: 1 };

export default function TeamViewScreen({ route, navigation }) {
  const { teamId, teamName } = route.params;
  const [chars, setChars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    try {
      const { characters } = await api.getCharacters(teamId);
      setChars(characters);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sizeCounts = chars.reduce((acc, c) => { acc[c.size] = (acc[c.size] || 0) + 1; return acc; }, {});
  const mageCount = chars.filter((c) => c.type === "mage").length;
  const complete = chars.length === 6;

  const removeChar = (c) => {
    Alert.alert("Remove character?", c.name, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => { await api.deleteCharacter(c.id); load(); } },
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.primary} size="large" /></View>;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>{teamName}</Text>

      <Torn style={styles.reqCard}>
        <Text style={styles.reqHeader}>Roster {chars.length}/6</Text>
        <View style={styles.reqRow}>
          {[4, 3, 2, 1].map((s) => (
            <View key={s} style={styles.reqPill}>
              <Text style={[styles.reqText, (sizeCounts[s] || 0) === SIZE_REQ[s] && { color: theme.good }]}>
                Size {s}: {sizeCounts[s] || 0}/{SIZE_REQ[s]}
              </Text>
            </View>
          ))}
          <View style={styles.reqPill}>
            <Text style={[styles.reqText, { color: mageCount > 2 ? theme.danger : theme.textDim }]}>Mages: {mageCount}/2</Text>
          </View>
        </View>
      </Torn>

      {chars.map((c) => {
        const stats = computeAllStats(c, null);
        return (
          <TornButton key={c.id} style={styles.charCard}
            onPress={() => setExpanded(expanded === c.id ? null : c.id)} onLongPress={() => removeChar(c)}>
            <View style={styles.charHead}>
              <Text style={styles.glyph}>{WEAPON_GLYPH[c.base_weapon] || "⚔️"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.charName}>{c.name}</Text>
                <Text style={styles.charSub}>{cap(c.type)} · Size {c.size} · {cap(c.base_weapon)} · Move {getMoveValue(c)}</Text>
              </View>
              <Text style={styles.hp}>❤ {c.health}</Text>
            </View>
            {expanded === c.id && (
              <View style={styles.detail}>
                <View style={styles.statGrid}>
                  {Object.keys(STAT_LABELS).map((k) => (
                    <View key={k} style={styles.statCell}><Text style={styles.statK}>{STAT_LABELS[k].slice(0, 3)}</Text><Text style={styles.statV}>{c[k]}</Text></View>
                  ))}
                </View>
                <Text style={styles.derived}>
                  Power {stats.power} · Prot {c.type === "mage" ? stats.protection.magic : stats.protection.melee} · Acc {stats.accuracy} · Eva {stats.evasion} · Crit {stats.critical} · Block {stats.block}
                </Text>
                <Text style={styles.abilityLine}>Abilities: {c.abilities.join(", ")}</Text>
                {c.type === "mage" && <Text style={styles.abilityLine}>Specials: {c.specials.join(", ")}</Text>}
                <Text style={styles.hint}>Long-press card to remove</Text>
              </View>
            )}
          </TornButton>
        );
      })}

      {!complete && (
        <TornButton style={styles.addBtn} onPress={() => navigation.navigate("CharCreation", { teamId, existing: chars })}>
          <Text style={styles.addText}>✛ Muster a Champion ({chars.length}/6)</Text>
        </TornButton>
      )}
      {complete && <Text style={styles.ready}>⚜️ Warband complete — ready for war!</Text>}
    </ScrollView>
  );
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, backgroundColor: theme.bg, justifyContent: "center" },
  title: { fontFamily: FONTS.display, color: theme.text, fontSize: 30, marginBottom: 12 },
  reqCard: { backgroundColor: theme.card, borderRadius: 8, padding: 14, borderWidth: 2, borderColor: theme.border, marginBottom: 16 },
  reqHeader: { fontFamily: FONTS.heading, color: theme.text, marginBottom: 8, letterSpacing: 1 },
  reqRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reqPill: { backgroundColor: theme.cardAlt, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: theme.border },
  reqText: { color: theme.textDim, fontSize: 12, fontWeight: "600" },
  charCard: { backgroundColor: theme.card, borderRadius: 8, padding: 14, borderWidth: 2, borderColor: theme.border, marginBottom: 12 },
  charHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  glyph: { fontSize: 28 },
  charName: { fontFamily: FONTS.heading, color: theme.text, fontSize: 18, letterSpacing: 0.5 },
  charSub: { color: theme.textDim, marginTop: 2, fontSize: 13 },
  hp: { color: theme.danger, fontWeight: "700" },
  detail: { marginTop: 12, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 },
  statGrid: { flexDirection: "row", flexWrap: "wrap" },
  statCell: { width: "20%", alignItems: "center", marginBottom: 8 },
  statK: { color: theme.textDim, fontSize: 11 },
  statV: { color: theme.text, fontSize: 16, fontWeight: "700" },
  derived: { color: theme.warn, fontSize: 12, marginTop: 4, marginBottom: 8 },
  abilityLine: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  hint: { color: theme.textDim, fontSize: 11, marginTop: 8, fontStyle: "italic" },
  addBtn: { backgroundColor: theme.primary, borderRadius: 8, padding: 16, alignItems: "center", marginTop: 6, marginBottom: 30, borderWidth: 1, borderColor: theme.gold },
  addText: { fontFamily: FONTS.heading, color: "#23170a", fontSize: 16, letterSpacing: 1 },
  ready: { fontFamily: FONTS.heading, color: theme.good, textAlign: "center", marginTop: 10, marginBottom: 30, fontSize: 15, letterSpacing: 1 },
});
