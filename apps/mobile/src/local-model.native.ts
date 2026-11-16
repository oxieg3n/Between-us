import { Platform, TurboModuleRegistry } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import type { LocalModelAdapter } from "./journal-intelligence";
import {
  createPrivateModelAdapter, LOCAL_MODEL, modelAssetMatches, withModelDownloadFile,
  type LocalModelStatus, type PrivateModelContext,
} from "./local-model-contract";
export { LOCAL_MODEL } from "./local-model-contract";

type NativeRuntime = {
  toggleNativeLog(enabled: boolean): Promise<void>;
  initLlama(options: {
    model: string; n_ctx: number; n_threads: number; n_gpu_layers: number;
    n_parallel: number; use_mmap: boolean;
  }): Promise<PrivateModelContext>;
};
let context: PrivateModelContext | undefined;
let lifecycle = Promise.resolve();
let version = 0;
let pending = 0;
let download: AbortController | undefined;
let message = "Optional on-device model not loaded. Local conversation starters are available.";

function nativeAvailable() {
  try {
    return (Platform.OS === "android" || Platform.OS === "ios") && !!TurboModuleRegistry.get("RNLlama");
  } catch { return false; }
}
async function retire(selected: PrivateModelContext) {
  if (context === selected) {
    context = undefined;
    message = "The local model was unloaded after a cleanup failure. Local starters still work.";
  }
  try { await selected.release(); } catch { /* No private native error is surfaced. */ }
}
const generation = createPrivateModelAdapter({
  context: () => pending === 0 ? context : undefined,
  version: () => version,
  retire,
});

export function getLocalModelStatus(): LocalModelStatus {
  const available = nativeAvailable();
  return {
    available, ready: available && !!context && pending === 0,
    message: available ? message : "This build uses local conversation starters. The optional native language-model module is unavailable in Expo Go or unsupported builds.",
  };
}
export function getLocalModelAdapter(): LocalModelAdapter | undefined {
  return getLocalModelStatus().ready ? generation.adapter : undefined;
}
function assertCurrent(expected: number) {
  if (version !== expected) throw new Error("Model setup was cancelled. Local starters still work.");
}
function modelFiles() {
  const directory = new Directory(Paths.document, "between-us-model-assets");
  return { directory, model: new File(directory, LOCAL_MODEL.filename), partial: new File(directory, LOCAL_MODEL.filename + ".download") };
}
async function verify(file: File, expected: number) {
  assertCurrent(expected);
  if (!file.exists || file.size !== LOCAL_MODEL.bytes) throw new Error("The optional model is missing or incomplete. Download it explicitly to continue.");
  message = "Checking the optional model download…";
  // SDK 58 streams bounded chunks through native SHA-256, away from the JS thread.
  const digest = await file.digest("SHA-256");
  assertCurrent(expected);
  if (!file.exists || !modelAssetMatches(file.size, digest)) throw new Error("The optional model failed its integrity check. It was not loaded.");
}
async function releaseCurrent() {
  await generation.stopAndDrain();
  const selected = context; context = undefined;
  if (selected) {
    try { await selected.clearCache(true); } finally { await selected.release(); }
  }
}
function manage(work: (expected: number) => Promise<void>, requiresNative = true): Promise<void> {
  const expected = ++version; pending += 1;
  download?.abort();
  const stopping = generation.stopAndDrain();
  const operation = lifecycle.then(async () => {
    assertCurrent(expected);
    if (requiresNative && !nativeAvailable()) throw new Error("The optional native model is unavailable in this build. Local starters still work.");
    await stopping;
    assertCurrent(expected);
    await work(expected);
  }).catch(() => {
    if (expected === version) message = "The optional model could not be set up. Local conversation starters still work. Check storage, connection and build support before retrying.";
    throw new Error(expected === version ? message : "Model setup was cancelled. Local starters still work.");
  }).finally(() => { pending -= 1; });
  lifecycle = operation.catch(() => undefined);
  return operation;
}
async function initialize(file: File, expected: number) {
  assertCurrent(expected);
  // Do not import llama.rn before the TurboModule check; Expo Go must retain its fallback.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Importing this native package before the guard breaks unsupported builds.
  const runtime = require("llama.rn") as NativeRuntime;
  await runtime.toggleNativeLog(false);
  assertCurrent(expected);
  message = "Loading the optional model on this device…";
  const loaded = await runtime.initLlama({ model: file.uri, n_ctx: 1024, n_threads: 2, n_gpu_layers: 0, n_parallel: 1, use_mmap: true });
  if (version !== expected) { await loaded.release(); assertCurrent(expected); }
  context = loaded;
  message = "Experimental on-device model loaded. Review every starter before sharing.";
}
export function loadDownloadedModel(): Promise<void> {
  return manage(async (expected) => {
    await releaseCurrent();
    const { model } = modelFiles();
    await verify(model, expected);
    await initialize(model, expected);
  });
}
export function downloadAndLoadModel(): Promise<void> {
  return manage(async (expected) => {
    await releaseCurrent();
    if (Paths.availableDiskSpace < 1024 * 1024 * 1024) throw new Error("At least 1 GiB of free storage is needed for this optional model setup.");
    const { directory, model, partial } = modelFiles();
    directory.create({ intermediates: true, idempotent: true });
    if (partial.exists) partial.delete();
    const controller = new AbortController(); download = controller;
    message = "Downloading the optional 369 MiB model. Journal text is never included.";
    try {
      await withModelDownloadFile(partial, (uri) => new File(uri), async () => {
        await File.downloadFileAsync(LOCAL_MODEL.url, partial, { signal: controller.signal });
        await verify(partial, expected);
        assertCurrent(expected);
        await partial.move(model, { overwrite: true });
        await initialize(model, expected);
      });
    } finally {
      if (download === controller) download = undefined;
    }
  });
}
export function unloadLocalModel(): Promise<void> {
  return manage(async () => {
    await releaseCurrent();
    message = "The optional model is unloaded. Downloaded weights remain on this device; local starters still work.";
  }, false);
}
