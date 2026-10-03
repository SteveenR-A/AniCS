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
import kotlinx.serialization.json.*

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "anics_settings")

data class AppSettings(
    val defaultSource: String = "jkanime",
    val autoPlayNext: Boolean = true,
    val defaultQuality: String = "auto",
    val themeMode: String = "system",
    val enableCloudSync: Boolean = false,
    val syncUserId: String = "",
    val downloadFolderUri: String = "",
    val allowFallback: Boolean = true,
    val preferredServer: String = "",
    val preferredDownloadServer: String = "",
    val maxConcurrentDownloads: Int = 1,
    val imageCacheMb: Int = 300
)

class SettingsRepository(private val context: Context) {

    private val searchesKey = stringPreferencesKey("recent_searches")
    val recentSearches: Flow<List<String>> = context.dataStore.data.map { prefs ->
        prefs[searchesKey]?.let { runCatching { Json.parseToJsonElement(it).jsonArray.map { value -> value.jsonPrimitive.content } }.getOrDefault(emptyList()) } ?: emptyList()
    }
    suspend fun rememberSearch(query: String) {
        val clean = query.trim().take(200); if (clean.isBlank()) return
        context.dataStore.edit { prefs ->
            val previous = prefs[searchesKey]?.let { runCatching { Json.parseToJsonElement(it).jsonArray.map { value -> value.jsonPrimitive.content } }.getOrDefault(emptyList()) } ?: emptyList()
            prefs[searchesKey] = JsonArray((listOf(clean) + previous.filterNot { it.equals(clean, true) }).take(10).map(::JsonPrimitive)).toString()
        }
    }
    suspend fun forgetSearch(query: String) {
        context.dataStore.edit { prefs ->
            val previous = prefs[searchesKey]?.let { runCatching { Json.parseToJsonElement(it).jsonArray.map { value -> value.jsonPrimitive.content } }.getOrDefault(emptyList()) } ?: emptyList()
            prefs[searchesKey] = JsonArray(previous.filterNot { it == query }.map(::JsonPrimitive)).toString()
        }
    }

    private val cloudSettingsKey = stringPreferencesKey("compatible_settings")
    val syncSettings: Flow<Map<String, String>> = context.dataStore.data.map { prefs ->
        prefs[cloudSettingsKey]?.let { raw ->
            Json.parseToJsonElement(raw).jsonObject.mapValues { it.value.jsonPrimitive.content }
        } ?: emptyMap()
    }

    suspend fun applySyncSettings(values: Map<String, String>) {
        context.dataStore.edit { prefs ->
            val safe = values.filter { (key, value) -> key != "download_dir" || !Regex("^[a-zA-Z]:").containsMatchIn(value) }
            val current = prefs[cloudSettingsKey]?.let { Json.parseToJsonElement(it).jsonObject } ?: JsonObject(emptyMap())
            prefs[cloudSettingsKey] = JsonObject(current + safe.mapValues { JsonPrimitive(it.value) }).toString()
            safe["app_theme"]?.let { prefs[PreferencesKeys.THEME_MODE] = it }
            safe["default_source"]?.let { prefs[PreferencesKeys.DEFAULT_SOURCE] = it }
            safe["auto_play_next"]?.toBooleanStrictOrNull()?.let { prefs[PreferencesKeys.AUTO_PLAY_NEXT] = it }
            safe["default_quality"]?.let { prefs[PreferencesKeys.DEFAULT_QUALITY] = it }
            safe["preferred_server"]?.let { prefs[PreferencesKeys.PREFERRED_SERVER] = it }
            safe["preferred_download_server"]?.let { prefs[PreferencesKeys.DOWNLOAD_SERVER] = it }
            safe["max_concurrent_downloads"]?.toIntOrNull()?.let { prefs[PreferencesKeys.MAX_DOWNLOADS] = it.coerceIn(1, 4) }
            safe["max_image_cache_mb"]?.toIntOrNull()?.let { prefs[PreferencesKeys.IMAGE_CACHE] = it.coerceIn(100, 1024) }
            safe["allow_fallback"]?.toBooleanStrictOrNull()?.let { prefs[PreferencesKeys.ALLOW_FALLBACK] = it }
        }
        values["max_image_cache_mb"]?.toIntOrNull()?.let { context.getSharedPreferences("image_cache", Context.MODE_PRIVATE).edit().putInt("limit_mb", it.coerceIn(100, 1024)).apply() }
    }

    suspend fun updateTheme(theme: String) {
        context.dataStore.edit { it[PreferencesKeys.THEME_MODE] = theme }
        applySyncSettings(mapOf("app_theme" to theme))
    }

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
        val DOWNLOAD_SERVER = stringPreferencesKey("preferred_download_server")
        val MAX_DOWNLOADS = androidx.datastore.preferences.core.intPreferencesKey("max_concurrent_downloads")
        val IMAGE_CACHE = androidx.datastore.preferences.core.intPreferencesKey("max_image_cache_mb")
    }

    val settings: Flow<AppSettings> = context.dataStore.data.map { prefs ->
        AppSettings(
            defaultSource = prefs[PreferencesKeys.DEFAULT_SOURCE] ?: "jkanime",
            autoPlayNext = prefs[PreferencesKeys.AUTO_PLAY_NEXT] ?: true,
            defaultQuality = prefs[PreferencesKeys.DEFAULT_QUALITY] ?: "auto",
            themeMode = prefs[PreferencesKeys.THEME_MODE] ?: "system",
            enableCloudSync = prefs[PreferencesKeys.ENABLE_CLOUD_SYNC] ?: false,
            syncUserId = prefs[PreferencesKeys.SYNC_USER_ID] ?: "",
            downloadFolderUri = prefs[PreferencesKeys.DOWNLOAD_FOLDER_URI] ?: "",
            allowFallback = prefs[PreferencesKeys.ALLOW_FALLBACK] ?: true,
            preferredServer = prefs[PreferencesKeys.PREFERRED_SERVER] ?: "",
            preferredDownloadServer = prefs[PreferencesKeys.DOWNLOAD_SERVER] ?: "",
            maxConcurrentDownloads = (prefs[PreferencesKeys.MAX_DOWNLOADS] ?: 1).coerceIn(1, 4),
            imageCacheMb = prefs[PreferencesKeys.IMAGE_CACHE] ?: 300
        )
    }

    suspend fun updateDefaultSource(source: String) {
        context.dataStore.edit { it[PreferencesKeys.DEFAULT_SOURCE] = source }
        applySyncSettings(mapOf("default_source" to source.toString()))
    }

    suspend fun updateAutoPlayNext(enabled: Boolean) {
        context.dataStore.edit { it[PreferencesKeys.AUTO_PLAY_NEXT] = enabled }
        applySyncSettings(mapOf("auto_play_next" to enabled.toString()))
    }

    suspend fun updateDefaultQuality(quality: String) {
        context.dataStore.edit { it[PreferencesKeys.DEFAULT_QUALITY] = quality }
        applySyncSettings(mapOf("default_quality" to quality.toString()))
    }

    suspend fun updateDownloadFolderUri(uri: String) {
        context.dataStore.edit { it[PreferencesKeys.DOWNLOAD_FOLDER_URI] = uri }
    }

    suspend fun updatePreferredServer(server: String) {
        context.dataStore.edit { it[PreferencesKeys.PREFERRED_SERVER] = server }
        applySyncSettings(mapOf("preferred_server" to server.toString()))
    }
    suspend fun updateDownloadServer(server: String) = applySyncSettings(mapOf("preferred_download_server" to server))
    suspend fun updateMaxDownloads(limit: Int) = applySyncSettings(mapOf("max_concurrent_downloads" to limit.coerceIn(1, 4).toString()))
    suspend fun updateImageCache(limit: Int) {
        context.getSharedPreferences("image_cache", Context.MODE_PRIVATE).edit().putInt("limit_mb", limit.coerceIn(100, 1024)).apply()
        applySyncSettings(mapOf("max_image_cache_mb" to limit.toString()))
    }

    suspend fun updateAllowFallback(allow: Boolean) {
        context.dataStore.edit { it[PreferencesKeys.ALLOW_FALLBACK] = allow }
        applySyncSettings(mapOf("allow_fallback" to allow.toString()))
    }

    suspend fun updateCloudSync(enabled: Boolean, userId: String = "") {
        context.dataStore.edit {
            it[PreferencesKeys.ENABLE_CLOUD_SYNC] = enabled
            it[PreferencesKeys.SYNC_USER_ID] = userId
        }
    }
}
