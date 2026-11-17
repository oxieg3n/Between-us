import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Body, Button, Heading } from "../ui";
import { useAppearance } from "../appearance";
import { checkNativeStorage } from "../production/native-check";
export default function NativeCheck() {
  const { theme } = useAppearance();
  const [result, setResult] = useState<Record<string, unknown> | null>(null),
    [busy, setBusy] = useState(false);
  if (!__DEV__)
    return (
      <SafeAreaView>
        <Body>Development diagnostics are unavailable.</Body>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
        <Heading>Native storage verification</Heading>
        <Body>
          1116-FinanceCheckpoints-r3. Synthetic temporary data only. This does
          not certify device biometrics or production readiness.
        </Body>
        <Button
          label="Run native storage check"
          disabled={busy}
          primary
          onPress={() => {
            setBusy(true);
            void checkNativeStorage()
              .then(setResult)
              .catch(() =>
                setResult({
                  available: false,
                  error:
                    "Native check failed. No private error details were logged.",
                }),
              )
              .finally(() => setBusy(false));
          }}
        />
        {result && (
          <Text
            selectable
            style={{ color: theme.text, fontSize: 16, lineHeight: 24 }}
          >
            {JSON.stringify(result, null, 2)}
          </Text>
        )}
        <Button
          label="Return to Between Us"
          onPress={() => router.replace("/accounts")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
