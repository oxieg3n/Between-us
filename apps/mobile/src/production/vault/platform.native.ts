import { AppState, Platform } from "react-native";
import type * as SecureStore from "expo-secure-store";
import { Directory, File } from "expo-file-system";
import { getBetweenUsProtection, type BetweenUsProtection } from "../../../modules/between-us-protection";
import { createVaultController } from "./core";
import { createExclusiveVaultFactory } from './exclusive';
import { VaultError, type VaultPorts, type VaultController, type SqlValue, type NativeVaultConfiguration } from "./types";
export type { NativeVaultConfiguration } from "./types";

/** No default directory: persistent mode is unavailable until native exclusion checks exist. */
export function createNativeVaultController(configuration?: NativeVaultConfiguration): VaultController {
  const directory = configuration ? new Directory(configuration.directory) : undefined;
  let protection: BetweenUsProtection | null = null;
  let authenticationDepth = 0;
  let runtime: { sqlite: typeof import("expo-sqlite"); secrets: typeof import("expo-secure-store"); crypto: typeof import("expo-crypto"); auth: typeof import("expo-local-authentication") } | undefined;
  function modules() { if (!runtime) throw new VaultError("unsupported"); return runtime; }
  const options = (alias: string, authenticated: boolean): SecureStore.SecureStoreOptions => ({
    keychainService: alias,
    keychainAccessible: authenticated ? modules().secrets.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY : modules().secrets.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: authenticated,
    authenticationPrompt: "Unlock your private Between Us pages",
  });
  async function protectFiles() {
    if (!directory || !configuration || !protection || !await protection.protectVaultDirectory() || !await configuration.protectAndVerifyDirectory()) throw new VaultError("unsupported");
  }
  async function authenticated<T>(work: () => Promise<T>): Promise<T> {
    authenticationDepth += 1;
    try {
      const value = await work();
      // A successful biometric callback can precede iOS's active event. Keep the privacy cover.
      if (AppState.currentState !== "active") {
        const resumed = await new Promise<boolean>(resolve => {
          let settled = false;
          const finish = (active: boolean) => { if (settled) return; settled = true; clearTimeout(timer); subscription.remove(); resolve(active); };
          const subscription = AppState.addEventListener("change", state => { if (state === "active") finish(true); else if (state === "background") finish(false); });
          const timer = setTimeout(() => finish(false), 2000);
          if (AppState.currentState === "active") finish(true);
          else if (AppState.currentState === "background") finish(false);
        });
        if (!resumed) throw new VaultError("locked");
      }
      return value;
    } finally { authenticationDepth -= 1; }
  }
  const ports: VaultPorts = {
    async supported() {
      if (!directory || !configuration || !["android", "ios"].includes(Platform.OS)) return false;
      try {
        // Missing native modules must return unsupported instead of crashing an importing screen.
        /* eslint-disable @typescript-eslint/no-require-imports */
        runtime = { sqlite: require("expo-sqlite"), secrets: require("expo-secure-store"), crypto: require("expo-crypto"), auth: require("expo-local-authentication") };
        /* eslint-enable @typescript-eslint/no-require-imports */
        const { secrets, auth } = runtime;
        protection = getBetweenUsProtection();
        if (!protection) return false;
        const nativeDirectory = await protection.prepareVaultDirectory();
        if (!nativeDirectory || directory.uri !== new Directory(nativeDirectory).uri) return false;
        if (!await secrets.isAvailableAsync() || !secrets.canUseBiometricAuthentication()) return false;
        if (await auth.getEnrolledLevelAsync() !== auth.SecurityLevel.BIOMETRIC_STRONG) return false;
        await protectFiles();
        return true;
      } catch { return false; }
    },
    async authenticate() {
      try { return (await authenticated(() => modules().auth.authenticateAsync({ promptMessage: "Unlock your private pages", disableDeviceFallback: true, biometricsSecurityLevel: "strong" }))).success; }
      catch { return false; }
    },
    randomBytes: count => modules().crypto.getRandomBytesAsync(count), uuid: () => modules().crypto.randomUUID(),
    now: () => new Date().toISOString(), monotonicNow: () => performance.now(),
    credentials: {
      read: (alias, requiresAuthentication) => requiresAuthentication ? authenticated(() => modules().secrets.getItemAsync(alias, options(alias, true))) : modules().secrets.getItemAsync(alias, options(alias, false)),
      write: (alias, value, requiresAuthentication) => requiresAuthentication ? authenticated(() => modules().secrets.setItemAsync(alias, value, options(alias, true))) : modules().secrets.setItemAsync(alias, value, options(alias, false)),
      remove: (alias, requiresAuthentication) => requiresAuthentication ? authenticated(() => modules().secrets.deleteItemAsync(alias, options(alias, true))) : modules().secrets.deleteItemAsync(alias, options(alias, false)),
    },
    files: {
      async exists(name) { if (!directory) throw new VaultError("unsupported"); return new File(directory, name).exists; },
      async list() { if (!directory) throw new VaultError("unsupported"); return directory.exists ? directory.list().map(file => file.name) : []; },
      async remove(name) { if (!directory) throw new VaultError("unsupported"); const file = new File(directory, name); if (file.exists) file.delete(); },
    },
    async open(name) {
      if (!configuration) throw new VaultError("unsupported");
      const db = await modules().sqlite.openDatabaseAsync(name, { useNewConnection: true }, configuration.directory);
      return {
        exec: sql => db.execAsync(sql),
        run: async (sql, params) => { const result = await db.runAsync(sql, [...params]); return { changes: result.changes }; },
        first: async <T>(sql: string, params: readonly SqlValue[] = []) => (await db.getFirstAsync<T>(sql, [...params])) ?? undefined,
        all: <T>(sql: string, params: readonly SqlValue[] = []) => db.getAllAsync<T>(sql, [...params]),
        close: () => db.closeAsync(),
      };
    },
    protectFiles,
    onLock: configuration?.onLock,
    onConceal: configuration?.onConceal ?? (covered => { if (covered) configuration?.onLock?.("background"); }),
    isActive: () => AppState.currentState === "active",
    onVisibilityChange(handler) {
      const subscription = AppState.addEventListener("change", state => {
        if (state === "active" || state === "inactive" || state === "background") handler(state, authenticationDepth > 0);
        else handler("background", false);
      });
      return () => subscription.remove();
    },
  };
  return createVaultController(ports);
}

/** Uses the module's fixed canonical private directory; a JS callback cannot invent backup proof. */
async function createProtectedControllerUnleased(configuration?: Pick<NativeVaultConfiguration, "onLock" | "onConceal">): Promise<VaultController> {
  try {
    const protection = getBetweenUsProtection();
    const directory = await protection?.prepareVaultDirectory();
    if (protection && directory) return createNativeVaultController({ ...configuration, directory, protectAndVerifyDirectory: () => protection.protectVaultDirectory() });
  } catch { /* Missing native protection stays unsupported; never fall back to a public path. */ }
  return createNativeVaultController();
}

export const createProtectedNativeVaultController = createExclusiveVaultFactory(createProtectedControllerUnleased);
