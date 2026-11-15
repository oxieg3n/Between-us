import type { LocalModelAdapter } from "./journal-intelligence";
import type { LocalModelStatus } from "./local-model-contract";
export { LOCAL_MODEL } from "./local-model-contract";

export function getLocalModelStatus(): LocalModelStatus {
  return { available: false, ready: false, message: "This build uses local conversation starters. An on-device language model requires a compatible native development build." };
}
export async function downloadAndLoadModel(): Promise<void> {
  throw new Error("Model setup is unavailable in this build. Local conversation starters still work.");
}
export async function loadDownloadedModel(): Promise<void> {
  throw new Error("Model loading is unavailable in this build. Local conversation starters still work.");
}
export async function unloadLocalModel(): Promise<void> { /* No native context on this platform. */ }
export function getLocalModelAdapter(): LocalModelAdapter | undefined { return undefined; }
