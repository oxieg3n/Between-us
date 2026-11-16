import { createVaultController } from "./core";
import { VaultError, type VaultController, type NativeVaultConfiguration } from "./types";
export type { NativeVaultConfiguration } from "./types";

/** Web and unsupported runtimes never persist private content. */
export function createNativeVaultController(configuration?: NativeVaultConfiguration): VaultController {
  const unsupported = async (): Promise<never> => { throw new VaultError("unsupported"); };
  return createVaultController({
    supported: async () => false, authenticate: async () => false,
    randomBytes: unsupported, uuid: () => { throw new VaultError("unsupported"); },
    now: () => new Date().toISOString(), monotonicNow: () => performance.now(),
    credentials: { read: unsupported, write: unsupported, remove: unsupported },
    files: { exists: unsupported, list: unsupported, remove: unsupported },
    open: unsupported, protectFiles: unsupported,
    onLock: configuration?.onLock,
    onConceal: configuration?.onConceal,
  });
}

export async function createProtectedNativeVaultController(configuration?: Pick<NativeVaultConfiguration, "onLock" | "onConceal">): Promise<VaultController> {
  return createNativeVaultController(configuration ? { ...configuration, directory: "", protectAndVerifyDirectory: async () => false } : undefined);
}
