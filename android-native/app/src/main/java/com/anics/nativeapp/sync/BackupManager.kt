package com.anics.nativeapp.sync

import com.anics.nativeapp.data.local.AppDatabase
import com.anics.nativeapp.data.repository.SettingsRepository

/** Same offline JSON schema used by the Tauri export/import dialogs. */
class BackupManager(database: AppDatabase, settings: SettingsRepository) {
    private val sync = SyncRepository(database, settings)
    suspend fun createBackupJson(): String = sync.exportCurrentLocalData().toString()
    suspend fun restoreBackupJson(raw: String) {
        require(raw.length <= 10 * 1024 * 1024) { "El respaldo supera el límite de 10 MB" }
        val payload = SyncContract.validate(raw)
        val remote = if (SyncContract.settings(payload, "settingsMobile").isEmpty()) kotlinx.serialization.json.JsonObject(payload + ("settingsMobile" to SyncContract.settings(payload, "settings"))) else payload
        sync.mergeSyncData(remote)
    }
}
