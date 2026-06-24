import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, getSocket } from "../api";
import { useAuth } from "../AuthContext";
import { theme } from "../theme";

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
        <Text style={styles.waitLabel}>Share this code with your opponent</Text>
        <Text style={styles.bigCode}>{hostCode}</Text>
        <ActivityIndicator color={theme.primary} size="large" style={{ marginTop: 20 }} />
        <Text style={styles.waitSub}>Waiting for opponent to join…</Text>
        <TouchableOpacity style={styles.cancel} onPress={() => { getSocket().emit("leaveRoom"); setWaiting(false); setMode(null); }}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h}>1. Select a team</Text>
      {teams.length === 0 && <Text style={styles.empty}>No battle-ready teams. Build a full team of 6 first.</Text>}
      {teams.map((t) => (
        <TouchableOpacity key={t.id} style={[styles.team, selected === t.id && styles.teamActive]} onPress={() => setSelected(t.id)}>
          <Text style={styles.teamName}>{t.name}</Text>
          <Text style={styles.teamMeta}>{selected === t.id ? "● selected" : "6/6"}</Text>
        </TouchableOpacity>
      ))}

      {selected && (
        <>
          <Text style={styles.h}>2. Host or Join</Text>
          <View style={styles.modeRow}>
            <TouchableOpacity style={[styles.modeBtn, mode === "host" && styles.modeActive]} onPress={() => setMode("host")}>
              <Text style={styles.modeText}>🛡️ Host</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modeBtn, mode === "join" && styles.modeActive]} onPress={() => setMode("join")}>
              <Text style={styles.modeText}>🔑 Join</Text>
            </TouchableOpacity>
          </View>

          {mode === "host" && (
            <TouchableOpacity style={styles.action} onPress={host}>
              <Text style={styles.actionText}>Generate Code & Host</Text>
            </TouchableOpacity>
          )}
          {mode === "join" && (
            <View>
              <TextInput style={styles.codeInput} placeholder="ENTER CODE" placeholderTextColor={theme.textDim} autoCapitalize="characters" maxLength={4} value={code} onChangeText={(t) => setCode(t.toUpperCase())} />
              <TouchableOpacity style={styles.action} onPress={join}>
                <Text style={styles.actionText}>Join Match</Text>
              </TouchableOpacity>
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
  empty: { color: theme.textDim, marginBottom: 10 },
  h: { color: theme.text, fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 10 },
  team: { flexDirection: "row", justifyContent: "space-between", backgroundColor: theme.card, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  teamActive: { borderColor: theme.primary, backgroundColor: "#1c2240" },
  teamName: { color: theme.text, fontSize: 16, fontWeight: "700" },
  teamMeta: { color: theme.primary, fontWeight: "600" },
  modeRow: { flexDirection: "row", gap: 12 },
  modeBtn: { flex: 1, backgroundColor: theme.card, padding: 18, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  modeActive: { borderColor: theme.primary, backgroundColor: "#1c2240" },
  modeText: { color: theme.text, fontWeight: "700", fontSize: 16 },
  action: { backgroundColor: theme.primary, padding: 16, borderRadius: 12, alignItems: "center", marginTop: 16 },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  codeInput: { backgroundColor: theme.cardAlt, color: theme.text, fontSize: 28, letterSpacing: 8, textAlign: "center", borderRadius: 12, padding: 16, marginTop: 16, fontWeight: "800" },
  waitLabel: { color: theme.textDim, fontSize: 16 },
  bigCode: { color: theme.primary, fontSize: 56, fontWeight: "900", letterSpacing: 10, marginTop: 10 },
  waitSub: { color: theme.textDim, marginTop: 12 },
  cancel: { marginTop: 30, padding: 12 },
  cancelText: { color: theme.danger, fontWeight: "600" },
});
