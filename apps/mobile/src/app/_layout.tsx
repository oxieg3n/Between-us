import { Slot } from "expo-router";
import Head from "expo-router/head";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppearanceProvider, useAppearance } from "../appearance";
function Navigation() {
  const { theme } = useAppearance();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Slot />
    </View>
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
