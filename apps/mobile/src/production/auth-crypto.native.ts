import { requireOptionalNativeModule } from "expo";
import * as Crypto from "expo-crypto";
import { installNativePkceCrypto, type AuthCryptoHost } from "./auth-crypto-policy";

/** Call before createClient. This exposes RNG/SHA-256 only; never call SDK getClaims on this shim. */
export function installAuthCrypto(): boolean {
  try {
    const native = requireOptionalNativeModule<{ getRandomValues?: unknown; digestAsync?: unknown; digest?: unknown }>("ExpoCrypto");
    if (!native || typeof native.getRandomValues !== "function" || !(typeof native.digestAsync === "function" || typeof native.digest === "function")) return false;
    return installNativePkceCrypto(globalThis as unknown as AuthCryptoHost, {
      fill: value => { Crypto.getRandomValues(value); },
      sha256: value => Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, value),
    });
  } catch { return false; }
}
