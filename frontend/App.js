import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";

import { AuthProvider, useAuth } from "./src/AuthContext";
import { theme } from "./src/theme";

import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import HomeScreen from "./src/screens/HomeScreen";
import TeamListScreen from "./src/screens/TeamListScreen";
import TeamViewScreen from "./src/screens/TeamViewScreen";
import CharCreationScreen from "./src/screens/CharCreationScreen";
import BattleLobbyScreen from "./src/screens/BattleLobbyScreen";
import BattleScreen from "./src/screens/BattleScreen";

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: theme.bg, card: theme.card, text: theme.text, border: theme.border, primary: theme.primary },
};

const screenOptions = {
  headerStyle: { backgroundColor: theme.card },
  headerTintColor: theme.text,
  headerTitleStyle: { fontWeight: "700" },
  contentStyle: { backgroundColor: theme.bg },
};

function Routes() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {!user ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ title: "Create Account" }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: "ColorsV3" }} />
          <Stack.Screen name="TeamList" component={TeamListScreen} options={{ title: "Your Teams" }} />
          <Stack.Screen name="TeamView" component={TeamViewScreen} options={{ title: "Team" }} />
          <Stack.Screen name="CharCreation" component={CharCreationScreen} options={{ title: "New Character" }} />
          <Stack.Screen name="BattleLobby" component={BattleLobbyScreen} options={{ title: "Battle" }} />
          <Stack.Screen name="Battle" component={BattleScreen} options={{ title: "Battle", headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <Routes />
      </NavigationContainer>
    </AuthProvider>
  );
}
