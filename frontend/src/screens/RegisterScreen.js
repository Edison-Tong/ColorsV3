import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { theme } from "../theme";

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
      <View style={styles.card}>
        <Text style={styles.title}>Create Account</Text>
        <TextInput style={styles.input} placeholder="Username (must be unique)" placeholderTextColor={theme.textDim} autoCapitalize="none" value={username} onChangeText={setUsername} />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor={theme.textDim} secureTextEntry value={password} onChangeText={setPassword} />
        <TextInput style={styles.input} placeholder="Confirm password" placeholderTextColor={theme.textDim} secureTextEntry value={confirm} onChangeText={setConfirm} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create & Log In</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, justifyContent: "center", padding: 24 },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.border },
  title: { color: theme.text, fontSize: 22, fontWeight: "700", marginBottom: 16 },
  input: { backgroundColor: theme.cardAlt, color: theme.text, borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 16 },
  btn: { backgroundColor: theme.primary, borderRadius: 10, padding: 15, alignItems: "center", marginTop: 4 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: theme.danger, marginBottom: 8 },
});
