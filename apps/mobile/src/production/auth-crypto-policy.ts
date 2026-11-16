export type AuthCryptoHost = {
  crypto?: { getRandomValues?: (value: ArrayBufferView) => ArrayBufferView; subtle?: { digest?: (algorithm: string | { name: string }, value: ArrayBuffer | ArrayBufferView) => Promise<ArrayBuffer> } };
  TextEncoder?: unknown; btoa?: unknown;
};
type NativeCryptoPorts = { fill(value: Uint8Array): void; sha256(value: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> };

/** PKCE compatibility only, NOT full WebCrypto. Mobile JWT claims must use the verified server RPC. */
export function installNativePkceCrypto(host: AuthCryptoHost, ports: NativeCryptoPorts): boolean {
  try {
    if (typeof host.TextEncoder !== "function" || typeof host.btoa !== "function") return false;
    ports.fill(new Uint8Array(1)); // Verify the native RNG is callable before permitting Auth construction.
    if (!host.crypto) Object.defineProperty(host, "crypto", { value: {}, configurable: true });
    const crypto = host.crypto!;
    if (typeof crypto.getRandomValues !== "function") Object.defineProperty(crypto, "getRandomValues", { configurable: true, value: (value: ArrayBufferView) => {
      if (!ArrayBuffer.isView(value) || !/^\[object (?:Uint8|Uint8Clamped|Uint16|Uint32|Int8|Int16|Int32|BigInt64|BigUint64)Array\]$/.test(Object.prototype.toString.call(value)) || value.byteLength > 65536) throw new Error("Secure account randomness is unavailable for this input.");
      ports.fill(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      return value;
    } });
    if (!crypto.subtle) Object.defineProperty(crypto, "subtle", { value: {}, configurable: true });
    if (typeof crypto.subtle!.digest !== "function") Object.defineProperty(crypto.subtle!, "digest", { configurable: true, value: async (algorithm: string | { name: string }, value: ArrayBuffer | ArrayBufferView) => {
      if ((typeof algorithm === "string" ? algorithm : algorithm?.name) !== "SHA-256" || !(value instanceof ArrayBuffer || ArrayBuffer.isView(value)) || value.byteLength > 65536) throw new Error("Only native SHA-256 account challenges are supported.");
      const input = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return ports.sha256(Uint8Array.from(input));
    } });
    return typeof crypto.getRandomValues === "function" && typeof crypto.subtle?.digest === "function";
  } catch { return false; }
}
