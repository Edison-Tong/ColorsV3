import { useEffect, useState } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, Text as RNText } from "react-native";
import { useFonts } from "expo-font";
import { initBackend } from "./src/api";
import { Cinzel_400Regular, Cinzel_700Bold } from "@expo-google-fonts/cinzel";
import { MedievalSharp_400Regular } from "@expo-google-fonts/medievalsharp";
import { EBGaramond_500Medium, EBGaramond_700Bold } from "@expo-google-fonts/eb-garamond";

import { AuthProvider, useAuth } from "./src/AuthContext";
import { theme, FONTS } from "./src/theme";

import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import HomeScreen from "./src/screens/HomeScreen";
import TeamListScreen from "./src/screens/TeamListScreen";
import TeamViewScreen from "./src/screens/TeamViewScreen";
import CharCreationScreen from "./src/screens/CharCreationScreen";
import BattleLobbyScreen from "./src/screens/BattleLobbyScreen";
import BattleScreen from "./src/screens/BattleScreen";

// Default every <Text> to the serif body font (individual styles still override for headings).
if (!RNText.defaultProps) RNText.defaultProps = {};
RNText.defaultProps.style = { fontFamily: FONTS.body };

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: theme.bg, card: theme.card, text: theme.text, border: theme.border, primary: theme.gold },
};

const screenOptions = {
  headerStyle: { backgroundColor: theme.card },
  headerShadowVisible: false,
  headerTintColor: theme.gold,
  headerTitleAlign: "center",
  headerTitleStyle: { fontFamily: FONTS.heading, color: theme.text, letterSpacing: 1, fontSize: 18 },
  contentStyle: { backgroundColor: theme.bg },
};

function Routes() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.gold} size="large" />
      </View>
    );
  }
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {!user ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ title: "Enlist" }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: "The Keep" }} />
          <Stack.Screen name="TeamList" component={TeamListScreen} options={{ title: "Your Warbands" }} />
          <Stack.Screen name="TeamView" component={TeamViewScreen} options={{ title: "Warband" }} />
          <Stack.Screen name="CharCreation" component={CharCreationScreen} options={{ title: "Muster a Champion" }} />
          <Stack.Screen name="BattleLobby" component={BattleLobbyScreen} options={{ title: "To Battle" }} />
          <Stack.Screen name="Battle" component={BattleScreen} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Cinzel_400Regular, Cinzel_700Bold, MedievalSharp_400Regular, EBGaramond_500Medium, EBGaramond_700Bold,
  });
  const [backendReady, setBackendReady] = useState(false);
  useEffect(() => { initBackend().finally(() => setBackendReady(true)); }, []);

  if (!fontsLoaded || !backendReady) {
    return <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center" }}><ActivityIndicator color={theme.gold} size="large" /></View>;
  }

  return (
    <AuthProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <Routes />
      </NavigationContainer>
    </AuthProvider>
  );
}
