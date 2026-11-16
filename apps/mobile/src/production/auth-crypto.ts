/** Browser uses its own secure-context WebCrypto. Never add weak randomness or a plain challenge. */
export function installAuthCrypto(): boolean {
  return typeof globalThis.crypto?.getRandomValues === "function" && typeof globalThis.crypto?.subtle?.digest === "function" && typeof TextEncoder === "function" && typeof btoa === "function";
}
