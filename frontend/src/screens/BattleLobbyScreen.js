import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, getSocket } from "../api";
import { useAuth } from "../AuthContext";
import { theme, FONTS } from "../theme";
import { TornButton } from "../components/Torn";

export default function BattleLobbyScreen({ navigation }) {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState(null); // 'host' | 'join'
  const [code, setCode] = useState("");
  const [hostCode, setHostCode] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { teams } = await api.getTeams(user.id);
      setTeams(teams.filter((t) => t.complete));
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Wait for the battle to start, then hand off to the Battle screen.
  useEffect(() => {
    const socket = getSocket();
    const onStart = (state) => {
      setWaiting(false);
      navigation.navigate("Battle", { code: state.code, userId: user.id, initialState: state });
    };
    socket.on("battleStart", onStart);
    return () => socket.off("battleStart", onStart);
  }, [navigation, user.id]);

  const host = () => {
    if (!selected) return Alert.alert("Pick a team");
    const socket = getSocket();
    socket.emit("host", { userId: user.id, username: user.username, teamId: selected }, (res) => {
      if (res?.error) return Alert.alert("Error", res.error);
      setHostCode(res.code);
      setWaiting(true);
    });
  };

  const join = () => {
    if (!selected) return Alert.alert("Pick a team");
    if (code.trim().length < 4) return Alert.alert("Enter a 4-character code");
    const socket = getSocket();
    socket.emit("join", { userId: user.id, username: user.username, code: code.trim().toUpperCase(), teamId: selected }, (res) => {
      if (res?.error) return Alert.alert("Error", res.error);
      // battleStart event will fire and navigate us in.
    });
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.primary} size="large" /></View>;

  if (waiting) {
    return (
      <View style={styles.center}>
        <Text style={styles.waitLabel}>Send this token to your foe</Text>
        <Text style={styles.bigCode}>{hostCode}</Text>
        <ActivityIndicator color={theme.gold} size="large" style={{ marginTop: 20 }} />
        <Text style={styles.waitSub}>Awaiting a challenger…</Text>
        <TouchableOpacity style={styles.cancel} onPress={() => { getSocket().emit("leaveRoom"); setWaiting(false); setMode(null); }}>
          <Text style={styles.cancelText}>Stand down</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h}>Ⅰ · Choose your warband</Text>
      {teams.length === 0 && <Text style={styles.empty}>No war-ready warbands. Muster a full company of 6 first.</Text>}
      {teams.map((t) => (
        <TornButton key={t.id} style={[styles.team, selected === t.id && styles.teamActive]} onPress={() => setSelected(t.id)}>
          <Text style={styles.teamName}>{t.name}</Text>
          <Text style={styles.teamMeta}>{selected === t.id ? "⚜️ chosen" : "6/6"}</Text>
        </TornButton>
      ))}

      {selected && (
        <>
          <Text style={styles.h}>Ⅱ · Host or answer a summons</Text>
          <View style={styles.modeRow}>
            <TornButton wrapStyle={{ flex: 1 }} style={[styles.modeBtn, mode === "host" && styles.modeActive]} onPress={() => setMode("host")}>
              <Text style={styles.modeText}>🛡️ Host</Text>
            </TornButton>
            <TornButton wrapStyle={{ flex: 1 }} style={[styles.modeBtn, mode === "join" && styles.modeActive]} onPress={() => setMode("join")}>
              <Text style={styles.modeText}>🔑 Answer</Text>
            </TornButton>
          </View>

          {mode === "host" && (
            <TornButton style={styles.action} onPress={host}>
              <Text style={styles.actionText}>Raise the Banner</Text>
            </TornButton>
          )}
          {mode === "join" && (
            <View>
              <TextInput style={styles.codeInput} placeholder="TOKEN" placeholderTextColor={theme.textDim} autoCapitalize="characters" maxLength={4} value={code} onChangeText={(t) => setCode(t.toUpperCase())} />
              <TornButton style={styles.action} onPress={join}>
                <Text style={styles.actionText}>Ride to Battle</Text>
              </TornButton>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, backgroundColor: theme.bg, justifyContent: "center", alignItems: "center", padding: 24 },
  empty: { color: theme.textDim, marginBottom: 10, fontSize: 15 },
  h: { fontFamily: FONTS.heading, color: theme.text, fontSize: 18, marginTop: 16, marginBottom: 10, letterSpacing: 1 },
  team: { flexDirection: "row", justifyContent: "space-between", backgroundColor: theme.card, borderRadius: 8, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: theme.border },
  teamActive: { borderColor: theme.gold, backgroundColor: theme.cardAlt },
  teamName: { fontFamily: FONTS.heading, color: theme.text, fontSize: 16, letterSpacing: 0.5 },
  teamMeta: { color: theme.gold, fontWeight: "600" },
  modeRow: { flexDirection: "row", gap: 12 },
  modeBtn: { backgroundColor: theme.card, paddingVertical: 18, alignItems: "center", justifyContent: "center", minHeight: 58, borderColor: theme.border },
  modeActive: { borderColor: theme.gold, backgroundColor: theme.cardAlt },
  modeText: { fontFamily: FONTS.heading, color: theme.text, fontSize: 16, letterSpacing: 1 },
  action: { backgroundColor: theme.primary, padding: 16, borderRadius: 8, alignItems: "center", marginTop: 16, borderWidth: 1, borderColor: theme.gold },
  actionText: { fontFamily: FONTS.heading, color: "#23170a", fontSize: 16, letterSpacing: 1 },
  codeInput: { backgroundColor: theme.cardAlt, color: theme.gold, fontFamily: FONTS.display, fontSize: 30, letterSpacing: 10, textAlign: "center", borderRadius: 8, padding: 16, marginTop: 16, borderWidth: 2, borderColor: theme.border },
  waitLabel: { fontFamily: FONTS.headingReg, color: theme.textDim, fontSize: 16, letterSpacing: 1 },
  bigCode: { fontFamily: FONTS.display, color: theme.gold, fontSize: 60, letterSpacing: 10, marginTop: 10 },
  waitSub: { color: theme.textDim, marginTop: 12, fontSize: 15 },
  cancel: { marginTop: 30, padding: 12 },
  cancelText: { fontFamily: FONTS.headingReg, color: theme.danger, letterSpacing: 1 },
});
