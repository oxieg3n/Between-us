/** Opaque record references, never authentication or authorization tokens. */
export function newId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure identifier generation is unavailable in this environment.");
  }
  return `local-${globalThis.crypto.randomUUID()}`;
}
