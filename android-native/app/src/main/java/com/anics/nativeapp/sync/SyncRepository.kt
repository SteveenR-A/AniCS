package com.anics.nativeapp.sync

import androidx.room.withTransaction
import com.anics.nativeapp.data.local.*
import com.anics.nativeapp.data.repository.SettingsRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import com.anics.nativeapp.sync.SyncContract.array
import com.anics.nativeapp.sync.SyncContract.favoriteKey
import com.anics.nativeapp.sync.SyncContract.historyKey
import com.anics.nativeapp.sync.SyncContract.isLocal
import com.anics.nativeapp.sync.SyncContract.iso
import com.anics.nativeapp.sync.SyncContract.json
import com.anics.nativeapp.sync.SyncContract.merge
import com.anics.nativeapp.sync.SyncContract.pid
import com.anics.nativeapp.sync.SyncContract.settings
import com.anics.nativeapp.sync.SyncContract.text
import com.anics.nativeapp.sync.SyncContract.time
import com.anics.nativeapp.sync.SyncContract.validate

class SyncRepository(private val database: AppDatabase, private val settingsRepository: SettingsRepository) {
    private fun stored(raw: String) = if (raw.isBlank()) JsonObject(emptyMap()) else json.parseToJsonElement(raw).jsonObject
    suspend fun exportCurrentLocalData(): JsonObject = database.withTransaction {
        val profiles = database.profileDao().getAllProfilesSync().map { p -> JsonObject(stored(p.cloudJson) + buildJsonObject {
            put("id", p.id); put("name", p.name); put("avatar", p.avatar); put("color", p.color); put("isActive", p.isActive); put("createdAt", iso(p.createdAt))
        }) }
        val favorites = database.favoriteDao().getAllFavoritesSync().map { f -> JsonObject(stored(f.cloudJson) + buildJsonObject {
            put("profileId", f.profileId); put("title", f.title); put("url", f.url); put("thumbnailUrl", f.thumbnailUrl); put("source", f.source)
            // Do not invent an addedAt for remote legacy favorites with no timestamp.
            if (f.addedAt > 0) put("addedAt", iso(f.addedAt))
        }) }
        val history = database.historyDao().getAllHistorySync().map { h -> JsonObject(stored(h.cloudJson) + buildJsonObject {
            put("id", text(stored(h.cloudJson), "id", h.id)); put("profileId", h.profileId); put("animeTitle", h.animeTitle); put("animeUrl", h.animeUrl)
            put("episodeNumber", h.episodeNumber); put("episodeUrl", h.episodeUrl); put("thumbnailUrl", h.thumbnailUrl); put("source", h.source)
            put("watchProgress", h.watchProgress ?: if (h.durationSeconds > 0) (h.progressSeconds.toDouble() / h.durationSeconds).coerceIn(0.0, 1.0) else 0.0)
            put("watchedAt", iso(h.lastWatchedAt))
        }) }.filterNot(::isLocal)
        val settings = JsonObject(settingsRepository.syncSettings.first().mapValues { JsonPrimitive(it.value) })
        val hashes = buildJsonObject {
            for ((name, value) in listOf("profiles" to JsonArray(profiles), "history" to JsonArray(history), "favorites" to JsonArray(favorites), "settings" to settings)) {
                put(name, java.security.MessageDigest.getInstance("SHA-256").digest(value.toString().toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 255) })
            }
        }
        val tombstones = database.tombstoneDao().getAll()
        buildJsonObject {
            put("syncMeta", buildJsonObject {
                put("fileHashes", hashes); put("schemaVersion", 2); put("appVersion", com.anics.nativeapp.BuildConfig.VERSION_NAME); put("lastModifiedAt", iso(System.currentTimeMillis())); put("lastModifiedDevice", "android")
                for (collection in listOf("deletedFavorites", "deletedProfiles", "deletedHistory")) put(collection, JsonArray(tombstones.filter { it.collection == collection }.map { json.parseToJsonElement(it.payload) }))
            })
            put("profiles", JsonArray(profiles)); put("favorites", JsonArray(favorites)); put("history", JsonArray(history))
            put("settings", settings); put("settingsMobile", settings)
        }
    }

    suspend fun mergeSyncData(remote: JsonObject): JsonObject = withContext(Dispatchers.IO) {
        val validated = validate(remote) // Fail before any mutation.
        val merged = database.withTransaction {
            val local = exportCurrentLocalData()
            val result = merge(local, validated)
            val activeId = database.profileDao().getActiveProfile()?.id
            val profiles = array(result, "profiles")
            val chosenId = profiles.firstOrNull { text(it, "id") == activeId }?.let { text(it, "id") } ?: profiles.firstOrNull()?.let { text(it, "id") }
            val localFiles = database.historyDao().getAllHistorySync().filter { h -> isLocal(buildJsonObject { put("source", h.source); put("episodeUrl", h.episodeUrl); put("animeUrl", h.animeUrl) }) }
            database.profileDao().deleteAll(); database.favoriteDao().deleteAll(); database.historyDao().deleteAll()
            profiles.forEach { p -> database.profileDao().insert(ProfileEntity(id = text(p, "id"), name = text(p, "name"), avatar = text(p, "avatar", "user"),
                color = text(p, "color", "#6366F1"), isActive = text(p, "id") == chosenId, createdAt = time(text(p, "createdAt")), cloudJson = p.toString())) }
            array(result, "favorites").forEach { f -> database.favoriteDao().upsert(FavoriteEntity(id = favoriteKey(f), profileId = pid(f), title = text(f, "title"), url = text(f, "url"),
                thumbnailUrl = text(f, "thumbnailUrl"), source = text(f, "source", "jkanime"), addedAt = text(f, "addedAt").takeIf { it.isNotBlank() }?.let(::time) ?: 0, cloudJson = f.toString())) }
            array(result, "history").forEach { h ->
                val ratio = h["watchProgress"]!!.jsonPrimitive.double
                database.historyDao().upsert(HistoryEntity(id = historyKey(h), profileId = pid(h), animeTitle = text(h, "animeTitle"), animeUrl = text(h, "animeUrl"),
                    episodeNumber = h["episodeNumber"]!!.jsonPrimitive.int, episodeUrl = text(h, "episodeUrl"), thumbnailUrl = text(h, "thumbnailUrl"), source = text(h, "source", "jkanime"),
                    completed = ratio >= 0.9, lastWatchedAt = time(text(h, "watchedAt")), cloudJson = h.toString(), watchProgress = ratio))
            }
            localFiles.forEach { database.historyDao().upsert(it) }
            val meta = settings(result, "syncMeta")
            for (collection in listOf("deletedFavorites", "deletedProfiles", "deletedHistory")) array(meta, collection).forEach { t ->
                database.tombstoneDao().upsert(TombstoneEntity(collection + t.toString(), collection, t.toString()))
            }
            result
        }
        val mobileSettings = settings(merged, "settingsMobile")
        val generalSettings = settings(merged, "settings")
        val effectiveSettings = (generalSettings + mobileSettings).toMutableMap()
        if (!mobileSettings.containsKey("app_theme")) {
            effectiveSettings.remove("app_theme")
        }
        settingsRepository.applySyncSettings(effectiveSettings.mapValues { it.value.jsonPrimitive.content })
        merged
    }
}
