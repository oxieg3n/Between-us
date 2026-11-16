import ExpoModulesCore
import Foundation

/** No arbitrary path API. Every write reasserts and reads back the platform backup flag. */
public final class BetweenUsProtectionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BetweenUsProtection")

    AsyncFunction("prepareVaultDirectory") { () -> String? in
      do { return try self.protectedDirectory().absoluteString } catch { return nil }
    }

    AsyncFunction("protectVaultDirectory") { () -> Bool in
      do { _ = try self.protectedDirectory(); return true } catch { return false }
    }

    AsyncFunction("prepareMessageOutboxDirectory") { () -> String? in
      do { return try self.protectedDirectory(.messageOutbox).absoluteString } catch { return nil }
    }

    AsyncFunction("protectMessageOutboxDirectory") { () -> Bool in
      do { _ = try self.protectedDirectory(.messageOutbox); return true } catch { return false }
    }
  }

  private enum ProtectedStore: String {
    case vaults = "BetweenUsPrivateVaults"
    case messageOutbox = "BetweenUsApprovedMessageOutbox"
  }

  private func protectedDirectory(_ store: ProtectedStore = .vaults) throws -> URL {
    let manager = FileManager.default
    let home = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true).resolvingSymlinksInPath().standardizedFileURL
    let appSupport = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).resolvingSymlinksInPath().standardizedFileURL
    guard appSupport.path == home.appendingPathComponent("Library/Application Support", isDirectory: true).standardizedFileURL.path else { throw ProtectionFailure() }
    if store == .messageOutbox {
      let legacy = appSupport.appendingPathComponent(ProtectedStore.vaults.rawValue, isDirectory: true).standardizedFileURL
      guard legacy.resolvingSymlinksInPath().standardizedFileURL.path == legacy.path else { throw ProtectionFailure() }
      if manager.fileExists(atPath: legacy.path) {
        let legacyNames = try manager.contentsOfDirectory(atPath: legacy.path)
        // Never strand an earlier uncertain command behind an empty replacement database.
        guard !legacyNames.contains(where: { $0.hasPrefix("message-outbox-v1-") }) else { throw ProtectionFailure() }
      }
    }
    let expected = appSupport.appendingPathComponent(store.rawValue, isDirectory: true).standardizedFileURL
    guard expected.resolvingSymlinksInPath().standardizedFileURL.path == expected.path else { throw ProtectionFailure() }
    try manager.createDirectory(at: expected, withIntermediateDirectories: false)
    let root = expected.resolvingSymlinksInPath().standardizedFileURL
    guard root.deletingLastPathComponent().path == appSupport.path else { throw ProtectionFailure() }
    let children = try manager.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isSymbolicLinkKey, .isRegularFileKey], options: [])
    guard children.count <= 128 else { throw ProtectionFailure() }
    try protect(root)
    for child in children {
      let flags = try child.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey])
      guard flags.isSymbolicLink == false, flags.isRegularFile == true,
        child.resolvingSymlinksInPath().standardizedFileURL.deletingLastPathComponent().path == root.path else { throw ProtectionFailure() }
      try protect(child)
    }
    return root
  }

  private func protect(_ resource: URL) throws {
    var url = resource
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
    // Read a fresh URL to avoid accepting a cached write value as verification.
    let fresh = URL(fileURLWithPath: url.path, isDirectory: url.hasDirectoryPath)
    guard try fresh.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true else { throw ProtectionFailure() }
  }

  private struct ProtectionFailure: Error {}
}
