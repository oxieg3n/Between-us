import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { LOCAL_WEB_AUTH_CALLBACK, NATIVE_AUTH_CALLBACK } from "./auth-callback-policy";

/** Only the explicit local-review and registered native callback are enabled. No Expo Go callback. */
export function authRedirectTo(): string {
  const unavailable = () => new Error("Account links require the registered native build or local review address.");
  if (Platform.OS === "web") {
    const url = Linking.createURL("auth/callback");
    if (url !== LOCAL_WEB_AUTH_CALLBACK) throw unavailable();
    return url;
  }
  if (!["android", "ios"].includes(Platform.OS) || !Linking.collectManifestSchemes().includes("between-us") || Linking.resolveScheme({ scheme: "between-us", isSilent: true }) !== "between-us") throw unavailable();
  // Use the registered destination, never a packager hostUri that createURL can append in development.
  return NATIVE_AUTH_CALLBACK;
}
