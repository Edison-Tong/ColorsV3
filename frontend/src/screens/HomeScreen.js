import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../AuthContext";
import { theme, FONTS } from "../theme";
import { TornButton } from "../components/Torn";

export default function HomeScreen({ navigation }) {
  const { user, signOut } = useAuth();
  return (
    <View style={styles.wrap}>
      <Text style={styles.hi}>Hail, <Text style={{ color: theme.gold }}>{user?.username}</Text></Text>

      <TornButton style={styles.tile} onPress={() => navigation.navigate("TeamList")}>
        <Text style={styles.tileIcon}>🛡️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.tileTitle}>Warbands</Text>
          <Text style={styles.tileSub}>Muster and arm your company of six</Text>
        </View>
      </TornButton>

      <TornButton style={styles.tile} onPress={() => navigation.navigate("BattleLobby")}>
        <Text style={styles.tileIcon}>⚔️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.tileTitle}>Battle</Text>
          <Text style={styles.tileSub}>Host or answer a summons by token</Text>
        </View>
      </TornButton>

      <TouchableOpacity style={styles.signout} onPress={signOut}>
        <Text style={styles.signoutText}>Abandon post</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, padding: 20 },
  hi: { fontFamily: FONTS.display, color: theme.text, fontSize: 30, marginVertical: 16 },
  tile: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: theme.card, borderRadius: 8, padding: 20, borderWidth: 2, borderColor: theme.border, marginBottom: 14 },
  tileIcon: { fontSize: 36 },
  tileTitle: { fontFamily: FONTS.heading, color: theme.text, fontSize: 20, letterSpacing: 1 },
  tileSub: { color: theme.textDim, marginTop: 2, fontSize: 15 },
  signout: { marginTop: "auto", padding: 16, alignItems: "center" },
  signoutText: { fontFamily: FONTS.headingReg, color: theme.danger, letterSpacing: 1 },
});
