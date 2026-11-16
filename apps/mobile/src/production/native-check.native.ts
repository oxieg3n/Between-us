import { Platform } from "react-native";
/** Synthetic native integration check, never an author vault or a production diagnostic upload. */
export async function checkNativeStorage(): Promise<Record<string, unknown>> {
  if (!__DEV__ || Platform.OS === "web")
    return { available: false, reason: "Native development builds only." };
  const SQLite = await import("expo-sqlite");
  const Crypto = await import("expo-crypto");
  const { File, Directory } = await import("expo-file-system");
  const { getBetweenUsProtection } =
    await import("../../modules/between-us-protection");
  const protection = getBetweenUsProtection();
  const directory = await protection?.prepareVaultDirectory();
  if (!protection || !directory)
    return {
      available: false,
      reason: "Required fixed-path native protection is unavailable.",
    };
  const name = `native-qa-${Crypto.randomUUID()}.db`;
  let db: Awaited<ReturnType<typeof SQLite.openDatabaseAsync>> | undefined;
  try {
    db = await SQLite.openDatabaseAsync(
      name,
      { useNewConnection: true },
      directory,
    );
    const cipher = await db.getFirstAsync<{ cipher_version: string }>(
      "PRAGMA cipher_version",
    );
    if (!cipher?.cipher_version)
      return {
        available: false,
        reason: "SQLCipher is absent. No schema or plaintext was written.",
      };
    const key = Array.from(await Crypto.getRandomBytesAsync(32), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    await db.execAsync(
      `PRAGMA key = "x'${key}'"; PRAGMA journal_mode=DELETE; CREATE TABLE synthetic_check(value TEXT NOT NULL);`,
    );
    await db.runAsync(
      "INSERT INTO synthetic_check(value) VALUES(?)",
      "FICTIONAL NATIVE CIPHER TEST",
    );
    await db.closeAsync();
    db = undefined;
    const excludedAfterWrite = await protection.protectVaultDirectory();
    const bytes = await new File(new Directory(directory), name).bytes();
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    let wrongKeyDenied = false;
    const wrong = await SQLite.openDatabaseAsync(
      name,
      { useNewConnection: true },
      directory,
    );
    try {
      await wrong.execAsync(`PRAGMA key = "x'${"00".repeat(32)}'"`);
      await wrong.getFirstAsync("SELECT * FROM synthetic_check");
    } catch {
      wrongKeyDenied = true;
    } finally {
      await wrong.closeAsync();
    }
    db = await SQLite.openDatabaseAsync(
      name,
      { useNewConnection: true },
      directory,
    );
    await db.execAsync(`PRAGMA key = "x'${key}'"`);
    const result = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM synthetic_check",
    );
    return {
      available: true,
      platform: Platform.OS,
      cipherVersion: cipher.cipher_version,
      excludedAfterWrite,
      ciphertextHeader: !raw.startsWith("SQLite format 3"),
      sentinelAbsentFromCiphertext: !raw.includes(
        "FICTIONAL NATIVE CIPHER TEST",
      ),
      wrongKeyDenied,
      correctKeyRoundTrip: result?.value === "FICTIONAL NATIVE CIPHER TEST",
      nativeRecentsProtected:
        Platform.OS === "android"
          ? await protection.protectAndroidRecents?.()
          : null,
      nativeGlobalRandom:
        typeof globalThis.crypto?.getRandomValues === "function",
      nativeSha256Digest: typeof globalThis.crypto?.subtle?.digest === 'function',
      nativeAsymmetricImport: typeof globalThis.crypto?.subtle?.importKey === 'function',
      nativeAsymmetricVerify: typeof globalThis.crypto?.subtle?.verify === 'function',
      physicalBiometricOrBackupRestoreTested: false,
    };
  } finally {
    await db?.closeAsync();
    await SQLite.deleteDatabaseAsync(name, directory);
    await protection.protectVaultDirectory();
  }
}
