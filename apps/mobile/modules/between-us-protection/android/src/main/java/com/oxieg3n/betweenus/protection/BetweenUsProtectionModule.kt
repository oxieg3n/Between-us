package com.oxieg3n.betweenus.protection

import android.net.Uri
import android.os.Build
import android.view.WindowManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/** Fixed own-app path only. No caller-supplied path, content, logging or key handling. */
class BetweenUsProtectionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BetweenUsProtection")

    AsyncFunction("protectAndroidRecents") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) { promise.resolve(false) }
      else activity.runOnUiThread {
        try {
          if (Build.VERSION.SDK_INT >= 33) activity.setRecentsScreenshotEnabled(false)
          else activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
          promise.resolve(true)
        } catch (_: Exception) { promise.resolve(false) }
      }
    }

    AsyncFunction("prepareVaultDirectory") {
      try { protectedDirectory()?.let { Uri.fromFile(it).toString() } } catch (_: Exception) { null }
    }

    AsyncFunction("protectVaultDirectory") {
      try { protectedDirectory() != null } catch (_: Exception) { false }
    }

    AsyncFunction("prepareMessageOutboxDirectory") {
      try { protectedDirectory(ProtectedStore.MESSAGE_OUTBOX)?.let { Uri.fromFile(it).toString() } } catch (_: Exception) { null }
    }

    AsyncFunction("protectMessageOutboxDirectory") {
      try { protectedDirectory(ProtectedStore.MESSAGE_OUTBOX) != null } catch (_: Exception) { false }
    }
  }

  private enum class ProtectedStore(val directoryName: String) {
    VAULTS("between-us-vaults"),
    MESSAGE_OUTBOX("between-us-message-outbox")
  }

  private fun protectedDirectory(store: ProtectedStore = ProtectedStore.VAULTS): File? {
    val context = appContext.reactContext?.applicationContext ?: return null
    val appRoot = File(context.applicationInfo.dataDir).canonicalFile
    val noBackup = context.noBackupFilesDir.canonicalFile
    if (noBackup.parentFile != appRoot || noBackup != File(appRoot, "no_backup").canonicalFile || !noBackup.isDirectory) return null
    if (store == ProtectedStore.MESSAGE_OUTBOX) {
      val legacy = File(noBackup, ProtectedStore.VAULTS.directoryName)
      if (legacy.canonicalFile != legacy.absoluteFile) return null
      if (legacy.exists()) {
        if (!legacy.isDirectory) return null
        val legacyFiles = legacy.listFiles() ?: return null
        // Do not hide an earlier uncertain command by starting an empty replacement outbox.
        if (legacyFiles.any { it.name.startsWith("message-outbox-v1-") }) return null
      }
    }
    val expected = File(noBackup, store.directoryName)
    if (expected.canonicalFile != expected.absoluteFile) return null
    if (!expected.exists() && !expected.mkdir()) return null
    val directory = expected.canonicalFile
    if (!directory.isDirectory || directory.parentFile != noBackup) return null
    val files = directory.listFiles() ?: return null
    // Fixed-purpose SQLite stores and their sidecars need no nested directories or symlinks.
    if (files.size > 128 || files.any { !it.isFile || it.canonicalFile != it.absoluteFile || it.canonicalFile.parentFile != directory }) return null
    return directory
  }
}
