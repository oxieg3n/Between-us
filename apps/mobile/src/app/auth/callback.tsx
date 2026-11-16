import { useEffect, useRef, useState } from "react";
import { BackHandler, ScrollView, StyleSheet, Text } from "react-native";
import * as Linking from "expo-linking";
import { Stack, router } from "expo-router";
import { Body, Button, Heading, Paper } from "../../ui";
import { useAppearance } from "../../appearance";
import { accountClient } from "../../production/client";
import { authRedirectTo } from "../../production/auth-redirect";
import { authCallbackCode, AuthCallbackActiveSessionError, createAuthCallbackExchange } from "../../production/auth-callback-policy";
import { AuthMutationBusyError } from "../../production/auth-mutation";

const failedLinkMessage = "Return to account access and request a new link, or enter the eight-digit code from the email. Open links in the same app and device where you started.";

const complete = createAuthCallbackExchange(async code => {
  if (!accountClient) throw new Error();
  const response = await accountClient.auth.exchangeCodeForSession(code);
  // The installed SDK returns redirectType, though its public AuthTokenResponse omits the field.
  const redirectType = "redirectType" in response.data ? response.data.redirectType : null;
  if (redirectType !== null && typeof redirectType !== "string") throw new Error();
  return { error: response.error, data: { ...response.data, redirectType } };
}, async () => {
  if (!accountClient) throw new Error();
  const { data, error } = await accountClient.auth.getSession();
  return { session: data.session, error };
});

export default function AuthCallback() {
  const url = Linking.useLinkingURL(), mounted = useRef(false);
  const [pending, setPending] = useState(true), [failed, setFailed] = useState(false);
  const [failureMessage, setFailureMessage] = useState(failedLinkMessage);
  const { theme } = useAppearance();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!url) {
      const timer = setTimeout(() => { setFailed(true); setPending(false); }, 5000);
      return () => clearTimeout(timer);
    }
    let current = true;
    void (async () => {
      await Promise.resolve(); if (!current) return;
      setPending(true); setFailed(false); setFailureMessage(failedLinkMessage);
      try {
        const code = authCallbackCode(url, authRedirectTo());
        const destination = await complete(code);
        if (current && mounted.current) router.replace(destination);
      } catch (error) {
        if (current && mounted.current) { setFailureMessage(error instanceof AuthCallbackActiveSessionError || error instanceof AuthMutationBusyError ? error.message : failedLinkMessage); setFailed(true); setPending(false); }
      }
    })();
    return () => { current = false; };
  }, [url]);
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => pending);
    return () => back.remove();
  }, [pending]);
  return <ScrollView contentContainerStyle={styles.page}>
    <Stack.Screen options={{ gestureEnabled: false }} />
    <Heading large>Between Us</Heading>
    <Paper>
      <Heading>{failed ? "Account link unavailable" : "Completing your account link"}</Heading>
      <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 18, lineHeight: 28 }}>{failed ? failureMessage : "Checking the link with the account service. Please keep this screen open."}</Text>
      <Body muted>A confirmation or recovery link does not grant guardian access, verify a family relationship or unlock a private journal.</Body>
      {failed && <Button label="Return to account access" onPress={() => router.replace("/accounts")} />}
    </Paper>
  </ScrollView>;
}
const styles = StyleSheet.create({ page: { flexGrow: 1, padding: 24, gap: 24, justifyContent: "center" } });
