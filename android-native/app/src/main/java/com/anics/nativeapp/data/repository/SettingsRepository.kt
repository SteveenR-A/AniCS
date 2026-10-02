package com.anics.nativeapp.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "anics_settings")

data class AppSettings(
    val defaultSource: String = "jkanime",
    val autoPlayNext: Boolean = true,
    val defaultQuality: String = "auto",
    val themeMode: String = "dark",
    val enableCloudSync: Boolean = false,
    val syncUserId: String = "",
    val downloadFolderUri: String = "",
    val allowFallback: Boolean = true,
    val preferredServer: String = ""
)

class SettingsRepository(private val context: Context) {

    private object PreferencesKeys {
        val DEFAULT_SOURCE = stringPreferencesKey("default_source")
        val AUTO_PLAY_NEXT = booleanPreferencesKey("auto_play_next")
        val DEFAULT_QUALITY = stringPreferencesKey("default_quality")
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val ENABLE_CLOUD_SYNC = booleanPreferencesKey("enable_cloud_sync")
        val SYNC_USER_ID = stringPreferencesKey("sync_user_id")
        val DOWNLOAD_FOLDER_URI = stringPreferencesKey("download_folder_uri")
        val ALLOW_FALLBACK = booleanPreferencesKey("allow_fallback")
        val PREFERRED_SERVER = stringPreferencesKey("preferred_server")
    }

    val settings: Flow<AppSettings> = context.dataStore.data.map { prefs ->
        AppSettings(
            defaultSource = prefs[PreferencesKeys.DEFAULT_SOURCE] ?: "jkanime",
            autoPlayNext = prefs[PreferencesKeys.AUTO_PLAY_NEXT] ?: true,
            defaultQuality = prefs[PreferencesKeys.DEFAULT_QUALITY] ?: "auto",
            themeMode = prefs[PreferencesKeys.THEME_MODE] ?: "dark",
            enableCloudSync = prefs[PreferencesKeys.ENABLE_CLOUD_SYNC] ?: false,
            syncUserId = prefs[PreferencesKeys.SYNC_USER_ID] ?: "",
            downloadFolderUri = prefs[PreferencesKeys.DOWNLOAD_FOLDER_URI] ?: "",
            allowFallback = prefs[PreferencesKeys.ALLOW_FALLBACK] ?: true,
            preferredServer = prefs[PreferencesKeys.PREFERRED_SERVER] ?: ""
        )
    }

    suspend fun updateDefaultSource(source: String) {
        context.dataStore.edit { it[PreferencesKeys.DEFAULT_SOURCE] = source }
    }

    suspend fun updateAutoPlayNext(enabled: Boolean) {
        context.dataStore.edit { it[PreferencesKeys.AUTO_PLAY_NEXT] = enabled }
    }

    suspend fun updateDefaultQuality(quality: String) {
        context.dataStore.edit { it[PreferencesKeys.DEFAULT_QUALITY] = quality }
    }

    suspend fun updateDownloadFolderUri(uri: String) {
        context.dataStore.edit { it[PreferencesKeys.DOWNLOAD_FOLDER_URI] = uri }
    }

    suspend fun updatePreferredServer(server: String) {
        context.dataStore.edit { it[PreferencesKeys.PREFERRED_SERVER] = server }
    }

    suspend fun updateAllowFallback(allow: Boolean) {
        context.dataStore.edit { it[PreferencesKeys.ALLOW_FALLBACK] = allow }
    }

    suspend fun updateCloudSync(enabled: Boolean, userId: String = "") {
        context.dataStore.edit {
            it[PreferencesKeys.ENABLE_CLOUD_SYNC] = enabled
            it[PreferencesKeys.SYNC_USER_ID] = userId
        }
    }
}
