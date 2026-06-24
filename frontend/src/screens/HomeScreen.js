import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../AuthContext";
import { theme } from "../theme";

export default function HomeScreen({ navigation }) {
  const { user, signOut } = useAuth();
  return (
    <View style={styles.wrap}>
      <Text style={styles.hi}>Welcome, <Text style={{ color: theme.primary }}>{user?.username}</Text></Text>

      <TouchableOpacity style={styles.tile} onPress={() => navigation.navigate("TeamList")}>
        <Text style={styles.tileIcon}>🛡️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.tileTitle}>Teams</Text>
          <Text style={styles.tileSub}>Build and manage your teams of 6</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tile} onPress={() => navigation.navigate("BattleLobby")}>
        <Text style={styles.tileIcon}>⚔️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.tileTitle}>Battle</Text>
          <Text style={styles.tileSub}>Host or join a match with a code</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signout} onPress={signOut}>
        <Text style={styles.signoutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, padding: 20 },
  hi: { color: theme.text, fontSize: 24, fontWeight: "700", marginVertical: 16 },
  tile: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: theme.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.border, marginBottom: 14 },
  tileIcon: { fontSize: 34 },
  tileTitle: { color: theme.text, fontSize: 20, fontWeight: "700" },
  tileSub: { color: theme.textDim, marginTop: 2 },
  signout: { marginTop: "auto", padding: 16, alignItems: "center" },
  signoutText: { color: theme.danger, fontWeight: "600" },
});
