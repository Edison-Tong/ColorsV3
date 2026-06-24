import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { theme } from "../theme";

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
      <Text style={styles.logo}>Colors<Text style={{ color: theme.primary }}>V3</Text></Text>
      <Text style={styles.sub}>Tactical team battler</Text>

      <View style={styles.card}>
        <TextInput style={styles.input} placeholder="Username" placeholderTextColor={theme.textDim} autoCapitalize="none" value={username} onChangeText={setUsername} />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor={theme.textDim} secureTextEntry value={password} onChangeText={setPassword} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Log In</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate("Register")}>
          <Text style={styles.link}>No account? Create one</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, justifyContent: "center", padding: 24 },
  logo: { fontSize: 44, fontWeight: "800", color: theme.text, textAlign: "center" },
  sub: { color: theme.textDim, textAlign: "center", marginBottom: 28 },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.border },
  input: { backgroundColor: theme.cardAlt, color: theme.text, borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 16 },
  btn: { backgroundColor: theme.primary, borderRadius: 10, padding: 15, alignItems: "center", marginTop: 4 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  link: { color: theme.primary, textAlign: "center", marginTop: 16 },
  error: { color: theme.danger, marginBottom: 8 },
});
