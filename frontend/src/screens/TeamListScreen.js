import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, Modal, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { theme } from "../theme";

export default function TeamListScreen({ navigation }) {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try {
      const { teams } = await api.getTeams(user.id);
      setTeams(teams);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    if (!name.trim()) return;
    try {
      const { team } = await api.createTeam(user.id, name.trim());
      setModal(false);
      setName("");
      navigation.navigate("TeamView", { teamId: team.id, teamName: team.name });
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const remove = (team) => {
    Alert.alert("Delete team?", `Delete "${team.name}" and its characters?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await api.deleteTeam(team.id, user.id); load(); } },
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.primary} size="large" /></View>;

  return (
    <View style={styles.wrap}>
      <FlatList
        data={teams}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={styles.empty}>No teams yet. Create one to get started.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("TeamView", { teamId: item.id, teamName: item.name })} onLongPress={() => remove(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.characters.length}/6 characters {item.complete ? "· ✅ battle-ready" : ""}</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={() => setModal(true)}>
        <Text style={styles.fabText}>+ New Team</Text>
      </TouchableOpacity>

      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Team</Text>
            <TextInput style={styles.input} placeholder="Team name" placeholderTextColor={theme.textDim} value={name} onChangeText={setName} autoFocus />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[styles.mBtn, { backgroundColor: theme.cardAlt }]} onPress={() => setModal(false)}><Text style={styles.mBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, { backgroundColor: theme.primary }]} onPress={create}><Text style={styles.mBtnText}>Create</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, backgroundColor: theme.bg, justifyContent: "center" },
  empty: { color: theme.textDim, textAlign: "center", marginTop: 40 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: 14, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  name: { color: theme.text, fontSize: 18, fontWeight: "700" },
  meta: { color: theme.textDim, marginTop: 3 },
  chev: { color: theme.textDim, fontSize: 28 },
  fab: { position: "absolute", bottom: 24, alignSelf: "center", backgroundColor: theme.primary, paddingHorizontal: 26, paddingVertical: 14, borderRadius: 30 },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: theme.card, borderRadius: 16, padding: 20 },
  modalTitle: { color: theme.text, fontSize: 20, fontWeight: "700", marginBottom: 14 },
  input: { backgroundColor: theme.cardAlt, color: theme.text, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 16 },
  mBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: "center" },
  mBtnText: { color: "#fff", fontWeight: "700" },
});
