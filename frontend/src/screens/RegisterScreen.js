import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { theme, FONTS } from "../theme";
import { Torn, TornButton } from "../components/Torn";

export default function RegisterScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username || !password) return setError("Enter a username and password");
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    setError("");
    try {
      const user = await api.register(username.trim(), password);
      await signIn(user); // auto-login after registering
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
      <Torn style={styles.card}>
        <Text style={styles.title}>Enlist a New Banner</Text>
        <TextInput style={styles.input} placeholder="Choose a name (must be unique)" placeholderTextColor={theme.textDim} autoCapitalize="none" value={username} onChangeText={setUsername} />
        <TextInput style={styles.input} placeholder="Secret word" placeholderTextColor={theme.textDim} secureTextEntry value={password} onChangeText={setPassword} />
        <TextInput style={styles.input} placeholder="Repeat secret word" placeholderTextColor={theme.textDim} secureTextEntry value={confirm} onChangeText={setConfirm} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <TornButton style={styles.btn} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#23170a" /> : <Text style={styles.btnText}>Take the Oath</Text>}
        </TornButton>
      </Torn>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, justifyContent: "center", padding: 24 },
  card: { backgroundColor: theme.card, borderRadius: 8, padding: 20, borderWidth: 2, borderColor: theme.border },
  title: { fontFamily: FONTS.heading, color: theme.text, fontSize: 22, marginBottom: 16, letterSpacing: 1 },
  input: { backgroundColor: theme.cardAlt, color: theme.text, borderRadius: 6, padding: 14, marginBottom: 12, fontSize: 17, borderWidth: 1, borderColor: theme.border },
  btn: { backgroundColor: theme.primary, borderRadius: 6, padding: 15, alignItems: "center", marginTop: 4, borderWidth: 1, borderColor: theme.gold },
  btnText: { fontFamily: FONTS.heading, color: "#23170a", fontSize: 16, letterSpacing: 1 },
  error: { color: theme.danger, marginBottom: 8 },
});
