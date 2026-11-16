import { Stack } from "expo-router";
import Head from "expo-router/head";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppearanceProvider, useAppearance } from "../appearance";
function Navigation() {
  const { theme } = useAppearance();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        statusBarStyle: theme.name === "Night Harbor" ? "light" : "dark",
        animation: "none",
      }}
    />
  );
}
export default function Layout() {
  return (
    <SafeAreaProvider>
      <Head>
        <title>Between Us · The Open Letter</title>
      </Head>
      <AppearanceProvider>
        <Navigation />
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}
