import { requireOptionalNativeModule } from "expo-modules-core";

export interface BetweenUsProtection {
  protectAndroidRecents?(): Promise<boolean>;
  prepareVaultDirectory(): Promise<string | null>;
  protectVaultDirectory(): Promise<boolean>;
  prepareMessageOutboxDirectory(): Promise<string | null>;
  protectMessageOutboxDirectory(): Promise<boolean>;
}

export function getBetweenUsProtection(): BetweenUsProtection | null {
  return requireOptionalNativeModule<BetweenUsProtection>("BetweenUsProtection");
}
