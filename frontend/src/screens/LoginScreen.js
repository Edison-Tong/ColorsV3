import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { theme, FONTS } from "../theme";
import { Torn, TornButton } from "../components/Torn";
import { BackendSwitcher } from "../components/BackendSwitcher";

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username || !password) return setError("Enter a username and password");
    setBusy(true);
    setError("");
    try {
      const user = await api.login(username.trim(), password);
      await signIn(user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
      <Text style={styles.crest}>⚔️</Text>
      <Text style={styles.logo}>The <Text style={{ color: theme.gold }}>Keep</Text></Text>
      <Text style={styles.sub}>— a contest of warbands —</Text>

      <Torn style={styles.card}>
        <TextInput style={styles.input} placeholder="Name, traveler" placeholderTextColor={theme.textDim} autoCapitalize="none" value={username} onChangeText={setUsername} />
        <TextInput style={styles.input} placeholder="Secret word" placeholderTextColor={theme.textDim} secureTextEntry value={password} onChangeText={setPassword} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <TornButton style={styles.btn} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#23170a" /> : <Text style={styles.btnText}>Enter the Keep</Text>}
        </TornButton>
        <TouchableOpacity onPress={() => navigation.navigate("Register")}>
          <Text style={styles.link}>No banner yet? Enlist here</Text>
        </TouchableOpacity>
      </Torn>

      <BackendSwitcher />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, justifyContent: "center", padding: 24 },
  crest: { fontSize: 52, textAlign: "center" },
  logo: { fontFamily: FONTS.display, fontSize: 52, color: theme.text, textAlign: "center" },
  sub: { fontFamily: FONTS.headingReg, color: theme.textDim, textAlign: "center", marginBottom: 28, letterSpacing: 1 },
  card: { backgroundColor: theme.card, borderRadius: 8, padding: 20, borderWidth: 2, borderColor: theme.border },
  input: { backgroundColor: theme.cardAlt, color: theme.text, borderRadius: 6, padding: 14, marginBottom: 12, fontSize: 17, borderWidth: 1, borderColor: theme.border },
  btn: { backgroundColor: theme.primary, borderRadius: 6, padding: 15, alignItems: "center", marginTop: 4, borderWidth: 1, borderColor: theme.gold },
  btnText: { fontFamily: FONTS.heading, color: "#23170a", fontSize: 16, letterSpacing: 1 },
  link: { fontFamily: FONTS.headingReg, color: theme.gold, textAlign: "center", marginTop: 16 },
  error: { color: theme.danger, marginBottom: 8 },
});
