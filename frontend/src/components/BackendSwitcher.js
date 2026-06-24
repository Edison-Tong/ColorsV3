// Dev-only chip to flip the app between the local PC backend and the deployed one.
// Renders nothing in production builds (ALLOW_ENV_SWITCH is false there), so TestFlight
// testers are locked to the prod backend.
import { useState } from "react";
import { TouchableOpacity, Text, StyleSheet, Alert } from "react-native";
import { ENV, ALLOW_ENV_SWITCH } from "../config";
import { getEnvName, getBackendUrl, setBackendEnv } from "../api";
import { theme, FONTS } from "../theme";

export function BackendSwitcher() {
  if (!ALLOW_ENV_SWITCH) return null;
  const [env, setEnv] = useState(getEnvName());
  const names = Object.keys(ENV);

  const cycle = async () => {
    const next = names[(names.indexOf(env) + 1) % names.length];
    await setBackendEnv(next);
    setEnv(next);
    Alert.alert("Backend switched", `Now using ${next.toUpperCase()}\n${ENV[next]}\n\nLog in again if your account lives on the other server.`);
  };

  const isLocal = env === "local";
  return (
    <TouchableOpacity style={[styles.chip, { borderColor: isLocal ? theme.warn : theme.good }]} onPress={cycle} activeOpacity={0.8}>
      <Text style={[styles.text, { color: isLocal ? theme.warn : theme.good }]}>
        {isLocal ? "🛠 LOCAL" : "🌐 PROD"} · tap to switch
      </Text>
      <Text style={styles.url} numberOfLines={1}>{getBackendUrl()}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: "center", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1.5, backgroundColor: theme.card, marginTop: 14 },
  text: { fontFamily: FONTS.heading, fontSize: 12, letterSpacing: 1, textAlign: "center" },
  url: { color: theme.textDim, fontSize: 10, textAlign: "center", marginTop: 2 },
});
