import { useState, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import { api } from "../api";
import { weaponsData } from "../data/weaponsData";
import { theme, FONTS, STAT_LABELS, WEAPON_GLYPH } from "../theme";
import { computeAllStats } from "../logic/combat";
import { Torn, TornButton } from "../components/Torn";

const STAT_KEYS = ["health", "strength", "defense", "magick", "resistance", "speed", "skill", "knowledge", "luck"];
const STAT_CAP = 70;
const STAT_MIN = 4;
const STAT_MAX = 12;
const SIZE_REQ = { 1: 1, 2: 2, 3: 2, 4: 1 };

const baseStats = () => STAT_KEYS.reduce((o, k) => ((o[k] = STAT_MIN), o), {});

export default function CharCreationScreen({ route, navigation }) {
  const { teamId, existing = [] } = route.params;

  // Composition availability from the rest of the team.
  const sizeCounts = existing.reduce((a, c) => ((a[c.size] = (a[c.size] || 0) + 1), a), {});
  const mageCount = existing.filter((c) => c.type === "mage").length;
  const mageFull = mageCount >= 2;

  const [name, setName] = useState("");
  const [type, setType] = useState(null);
  const [size, setSize] = useState(null);
  const [weapon, setWeapon] = useState(null);
  const [abilities, setAbilities] = useState([]);
  const [specials, setSpecials] = useState([]);
  const [stats, setStats] = useState(baseStats());
  const [busy, setBusy] = useState(false);

  const total = STAT_KEYS.reduce((s, k) => s + stats[k], 0);

  const weaponList = useMemo(() => {
    const want = type === "mage" ? "magick" : "melee";
    return Object.values(weaponsData.weapons).filter((w) => w.type === want);
  }, [type]);

  const abilityList = weapon ? weaponsData.weaponAbilities[weapon] || [] : [];
  const specialList = weapon ? weaponsData.mageSpecialAbilities[weapon] || [] : [];

  const pickType = (t) => {
    if (t === "mage" && mageFull) return Alert.alert("Limit", "Team already has 2 mages");
    setType(t); setWeapon(null); setAbilities([]); setSpecials([]);
  };
  const pickSize = (s) => {
    if ((sizeCounts[s] || 0) >= SIZE_REQ[s]) return Alert.alert("Limit", `Team already has the max size-${s} characters`);
    setSize(s);
  };
  const pickWeapon = (w) => { setWeapon(w); setAbilities([]); setSpecials([]); };

  const toggleAbility = (n) => setAbilities((p) => p.includes(n) ? p.filter((x) => x !== n) : p.length >= 2 ? p : [...p, n]);
  const toggleSpecial = (n) => setSpecials((p) => p.includes(n) ? p.filter((x) => x !== n) : p.length >= 3 ? p : [...p, n]);

  const changeStat = (k, d) => {
    setStats((prev) => {
      const v = prev[k] + d;
      if (v < STAT_MIN) return prev;
      if (d > 0 && k !== "health" && v > STAT_MAX) return prev;
      if (d > 0 && total + d > STAT_CAP) return prev;
      return { ...prev, [k]: v };
    });
  };

  const preview = useMemo(() => {
    if (!weapon || !type) return null;
    return computeAllStats({ ...stats, type, size: size || 0, base_weapon: weapon }, null);
  }, [stats, weapon, type, size]);

  const validate = () => {
    if (!name.trim()) return "Enter a name";
    if (!type) return "Choose a type";
    if (!size) return "Choose a size";
    if (!weapon) return "Choose a weapon";
    if (abilities.length !== 2) return "Pick exactly 2 abilities";
    if (type === "mage" && specials.length !== 3) return "Pick exactly 3 special abilities";
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) return Alert.alert("Hold on", err);
    setBusy(true);
    try {
      await api.createCharacter(teamId, {
        name: name.trim(), type, size, base_weapon: weapon,
        abilities, specials: type === "mage" ? specials : [], stats,
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Field label="Name">
        <TextInput style={styles.input} placeholder="Character name" placeholderTextColor={theme.textDim} value={name} onChangeText={setName} />
      </Field>

      <Field label="Type">
        <View style={styles.chipRow}>
          <Chip active={type === "melee"} onPress={() => pickType("melee")} label="⚔️ Melee" />
          <Chip active={type === "mage"} disabled={mageFull} onPress={() => pickType("mage")} label={`✨ Mage${mageFull ? " (full)" : ""}`} />
        </View>
      </Field>

      <Field label="Size">
        <View style={styles.chipRow}>
          {[1, 2, 3, 4].map((s) => {
            const full = (sizeCounts[s] || 0) >= SIZE_REQ[s];
            return <Chip key={s} active={size === s} disabled={full} onPress={() => pickSize(s)} label={`Size ${s}${full ? " ✓" : ""}`} />;
          })}
        </View>
        <Text style={styles.note}>Team needs: one size 4, two size 3, two size 2, one size 1.</Text>
      </Field>

      {type && (
        <Field label="Weapon">
          <View style={styles.chipRow}>
            {weaponList.map((w) => (
              <Chip key={w.value} active={weapon === w.value} onPress={() => pickWeapon(w.value)} label={`${WEAPON_GLYPH[w.value]} ${w.label}`} />
            ))}
          </View>
        </Field>
      )}

      {weapon && (
        <Field label={`Weapon Abilities (${abilities.length}/2)`}>
          {abilityList.map((a) => (
            <AbilityRow key={a.name} a={a} active={abilities.includes(a.name)} onPress={() => toggleAbility(a.name)} />
          ))}
        </Field>
      )}

      {weapon && type === "mage" && (
        <Field label={`Mage Special Abilities (${specials.length}/3)`}>
          {specialList.map((a) => (
            <AbilityRow key={a.name} a={a} special active={specials.includes(a.name)} onPress={() => toggleSpecial(a.name)} />
          ))}
        </Field>
      )}

      <Field label="Stats">
        <View style={[styles.totalBar, total === STAT_CAP && { borderColor: theme.good }]}>
          <Text style={styles.totalText}>Points used: <Text style={{ color: total === STAT_CAP ? theme.good : theme.warn, fontWeight: "800" }}>{total}/{STAT_CAP}</Text></Text>
        </View>
        {STAT_KEYS.map((k) => (
          <View key={k} style={styles.statRow}>
            <Text style={styles.statLabel}>{STAT_LABELS[k]}</Text>
            <View style={styles.stepper}>
              <Stepper symbol="−" disabled={stats[k] <= STAT_MIN} onPress={() => changeStat(k, -1)} />
              <Text style={styles.statVal}>{stats[k]}</Text>
              <Stepper symbol="+" disabled={(k !== "health" && stats[k] >= STAT_MAX) || total >= STAT_CAP} onPress={() => changeStat(k, 1)} />
            </View>
          </View>
        ))}
        <Text style={styles.note}>Each stat 4–12 (Health uncapped). {STAT_CAP} points total.</Text>
      </Field>

      {preview && (
        <Torn style={styles.previewCard}>
          <Text style={styles.previewTitle}>Computed (with weapon{size ? " + size" : ""})</Text>
          <Text style={styles.previewText}>
            Power {preview.power} · Prot {type === "mage" ? preview.protection.magic : preview.protection.melee} · Acc {preview.accuracy} · Eva {preview.evasion} · Crit {preview.critical} · Block {preview.block}
          </Text>
        </Torn>
      )}

      <TornButton style={styles.submit} wrapStyle={busy && { opacity: 0.6 }} onPress={submit} disabled={busy}>
        <Text style={styles.submitText}>{busy ? "Mustering…" : "⚜️ Muster Champion"}</Text>
      </TornButton>
    </ScrollView>
  );
}

const Field = ({ label, children }) => (
  <View style={{ marginBottom: 18 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);
const Chip = ({ active, disabled, onPress, label }) => (
  <TouchableOpacity disabled={disabled} onPress={onPress}
    style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}>
    <Text style={[styles.chipText, active && { color: "#fff" }, disabled && { color: theme.textDim }]}>{label}</Text>
  </TouchableOpacity>
);
const Stepper = ({ symbol, disabled, onPress }) => (
  <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.stepBtn, disabled && { opacity: 0.3 }]}>
    <Text style={styles.stepText}>{symbol}</Text>
  </TouchableOpacity>
);
const AbilityRow = ({ a, active, special, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[styles.abRow, active && styles.abRowActive]}>
    <View style={{ flex: 1 }}>
      <Text style={styles.abName}>{a.name} {active ? "✓" : ""}</Text>
      <Text style={styles.abEffect}>{special ? a.description : a.effect}</Text>
      <Text style={styles.abMeta}>{special ? `range ${a.range} · ${a.effect}` : `hit ${a["hit%"]}% · range ${a.range} · ${a.type}`}</Text>
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  input: { backgroundColor: theme.cardAlt, color: theme.text, borderRadius: 6, padding: 14, fontSize: 17, borderWidth: 1, borderColor: theme.border },
  fieldLabel: { fontFamily: FONTS.heading, color: theme.gold, fontSize: 16, marginBottom: 8, letterSpacing: 1 },
  note: { color: theme.textDim, fontSize: 12, marginTop: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: theme.cardAlt, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6, borderWidth: 1, borderColor: theme.border },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipDisabled: { opacity: 0.45 },
  chipText: { color: theme.text, fontWeight: "600" },
  abRow: { backgroundColor: theme.cardAlt, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  abRowActive: { borderColor: theme.primary, backgroundColor: "#222a4d" },
  abName: { color: theme.text, fontWeight: "700" },
  abEffect: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  abMeta: { color: theme.warn, fontSize: 11, marginTop: 3 },
  totalBar: { backgroundColor: theme.cardAlt, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  totalText: { color: theme.text, fontWeight: "600" },
  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  statLabel: { color: theme.text, fontSize: 15 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" },
  stepText: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: -2 },
  statVal: { color: theme.text, fontSize: 18, fontWeight: "700", width: 28, textAlign: "center" },
  previewCard: { backgroundColor: theme.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, marginBottom: 18 },
  previewTitle: { color: theme.text, fontWeight: "700", marginBottom: 4 },
  previewText: { color: theme.warn, fontSize: 13 },
  submit: { backgroundColor: theme.good, borderRadius: 8, padding: 16, alignItems: "center", borderWidth: 1, borderColor: theme.gold },
  submitText: { fontFamily: FONTS.heading, color: "#0e1505", fontSize: 16, letterSpacing: 1 },
});
