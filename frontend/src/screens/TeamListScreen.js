import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, Modal, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { theme, FONTS } from "../theme";
import { Torn, TornButton } from "../components/Torn";

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
        ListEmptyComponent={<Text style={styles.empty}>No warbands yet. Raise one to begin.</Text>}
        renderItem={({ item }) => (
          <TornButton style={styles.row} onPress={() => navigation.navigate("TeamView", { teamId: item.id, teamName: item.name })} onLongPress={() => remove(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.characters.length}/6 champions {item.complete ? "· ⚜️ ready for war" : ""}</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </TornButton>
        )}
      />
      <TornButton wrapStyle={styles.fabWrap} style={styles.fab} onPress={() => setModal(true)}>
        <Text style={styles.fabText}>✛ Raise Warband</Text>
      </TornButton>

      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.backdrop}>
          <Torn style={styles.modalCard}>
            <Text style={styles.modalTitle}>Name Your Warband</Text>
            <TextInput style={styles.input} placeholder="Warband name" placeholderTextColor={theme.textDim} value={name} onChangeText={setName} autoFocus />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[styles.mBtn, { backgroundColor: theme.cardAlt }]} onPress={() => setModal(false)}><Text style={styles.mBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, { backgroundColor: theme.primary }]} onPress={create}><Text style={styles.mBtnText}>Create</Text></TouchableOpacity>
            </View>
          </Torn>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, backgroundColor: theme.bg, justifyContent: "center" },
  empty: { color: theme.textDim, textAlign: "center", marginTop: 40, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: 8, padding: 18, marginBottom: 12, borderWidth: 2, borderColor: theme.border },
  name: { fontFamily: FONTS.heading, color: theme.text, fontSize: 18, letterSpacing: 0.5 },
  meta: { color: theme.textDim, marginTop: 3, fontSize: 14 },
  chev: { color: theme.gold, fontSize: 28 },
  fabWrap: { position: "absolute", bottom: 24, alignSelf: "center" },
  fab: { backgroundColor: theme.primary, paddingHorizontal: 26, paddingVertical: 14, borderColor: theme.gold },
  fabText: { fontFamily: FONTS.heading, color: "#23170a", fontSize: 16, letterSpacing: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: theme.card, borderRadius: 8, padding: 20, borderWidth: 2, borderColor: theme.border },
  modalTitle: { fontFamily: FONTS.heading, color: theme.text, fontSize: 20, marginBottom: 14, letterSpacing: 1 },
  input: { backgroundColor: theme.cardAlt, color: theme.text, borderRadius: 6, padding: 14, marginBottom: 16, fontSize: 17, borderWidth: 1, borderColor: theme.border },
  mBtn: { flex: 1, padding: 14, borderRadius: 6, alignItems: "center" },
  mBtnText: { fontFamily: FONTS.heading, color: theme.text, letterSpacing: 1 },
});
