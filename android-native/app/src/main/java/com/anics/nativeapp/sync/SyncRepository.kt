package com.anics.nativeapp.sync

import com.anics.nativeapp.data.local.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

class SyncRepository(
    private val database: AppDatabase,
    private val json: Json = Json { ignoreUnknownKeys = true; prettyPrint = false }
) {

    /**
     * Fusión bidireccional determinista entre datos locales y remotos (esquema v2).
     * Respeta lápidas (tombstones) para no resucitar elementos borrados.
     */
    suspend fun mergeSyncData(remote: SyncDataV2): SyncDataV2 = withContext(Dispatchers.IO) {
        val tombstones = remote.syncMeta.tombstones

        // 1. Fusión de Perfiles
        val localProfiles = database.profileDao().getAllProfilesSync()
        val mergedProfilesMap = mutableMapOf<String, ProfileSyncDto>()

        localProfiles.forEach { p ->
            mergedProfilesMap[p.id] = ProfileSyncDto(p.id, p.name, p.avatar, p.createdAt)
        }
        remote.profiles.forEach { p ->
            if (!mergedProfilesMap.containsKey(p.id)) {
                mergedProfilesMap[p.id] = p
                database.profileDao().insert(
                    ProfileEntity(p.id, p.name, p.avatar, isActive = false, createdAt = p.createdAt)
                )
            }
        }

        // 2. Fusión de Favoritos
        val deletedFavoriteUrls = tombstones
            .filter { it.entityType == "favorite" }
            .map { it.profileId to it.entityKey }
            .toSet()

        val localFavorites = database.favoriteDao().getAllFavoritesSync()
        val mergedFavoritesMap = mutableMapOf<Pair<String, String>, FavoriteSyncDto>()

        localFavorites.forEach { fav ->
            val key = fav.profileId to fav.url
            if (!deletedFavoriteUrls.contains(key)) {
                mergedFavoritesMap[key] = FavoriteSyncDto(
                    fav.profileId, fav.title, fav.url, fav.thumbnailUrl, fav.source, fav.addedAt
                )
            }
        }
        remote.favorites.forEach { fav ->
            val key = fav.profileId to fav.url
            if (!deletedFavoriteUrls.contains(key) && !mergedFavoritesMap.containsKey(key)) {
                mergedFavoritesMap[key] = fav
                database.favoriteDao().upsert(
                    FavoriteEntity(fav.profileId, fav.title, fav.url, fav.thumbnailUrl, fav.source, fav.addedAt)
                )
            }
        }

        // 3. Fusión de Historial
        val deletedHistoryUrls = tombstones
            .filter { it.entityType == "history" }
            .map { it.profileId to it.entityKey }
            .toSet()

        val localHistory = database.historyDao().getAllHistorySync()
        val mergedHistoryMap = mutableMapOf<Pair<String, String>, HistorySyncDto>()

        localHistory.forEach { h ->
            val key = h.profileId to h.episodeUrl
            if (!deletedHistoryUrls.contains(key)) {
                mergedHistoryMap[key] = HistorySyncDto(
                    h.profileId, h.animeTitle, h.animeUrl, h.episodeNumber, h.episodeUrl,
                    h.thumbnailUrl, h.source, h.progressSeconds, h.durationSeconds,
                    h.completed, h.lastWatchedAt
                )
            }
        }

        remote.history.forEach { remH ->
            val key = remH.profileId to remH.episodeUrl
            if (!deletedHistoryUrls.contains(key)) {
                val existing = mergedHistoryMap[key]
                if (existing == null || remH.lastWatchedAt > existing.lastWatchedAt) {
                    mergedHistoryMap[key] = remH
                    database.historyDao().upsert(
                        HistoryEntity(
                            profileId = remH.profileId,
                            animeTitle = remH.animeTitle,
                            animeUrl = remH.animeUrl,
                            episodeNumber = remH.episodeNumber,
                            episodeUrl = remH.episodeUrl,
                            thumbnailUrl = remH.thumbnailUrl,
                            source = remH.source,
                            progressSeconds = remH.progressSeconds,
                            durationSeconds = remH.durationSeconds,
                            completed = remH.completed,
                            lastWatchedAt = remH.lastWatchedAt
                        )
                    )
                }
            }
        }

        SyncDataV2(
            syncMeta = SyncMetaDto(
                schemaVersion = 2,
                deviceId = remote.syncMeta.deviceId,
                lastSyncAt = System.currentTimeMillis(),
                tombstones = tombstones
            ),
            profiles = mergedProfilesMap.values.toList(),
            history = mergedHistoryMap.values.toList(),
            favorites = mergedFavoritesMap.values.toList(),
            settingsMobile = remote.settingsMobile,
            updatedAt = System.currentTimeMillis()
        )
    }

    suspend fun exportCurrentLocalData(deviceId: String): SyncDataV2 = withContext(Dispatchers.IO) {
        val profiles = database.profileDao().getAllProfilesSync().map {
            ProfileSyncDto(it.id, it.name, it.avatar, it.createdAt)
        }
        val favorites = database.favoriteDao().getAllFavoritesSync().map {
            FavoriteSyncDto(it.profileId, it.title, it.url, it.thumbnailUrl, it.source, it.addedAt)
        }
        val history = database.historyDao().getAllHistorySync().map {
            HistorySyncDto(
                it.profileId, it.animeTitle, it.animeUrl, it.episodeNumber, it.episodeUrl,
                it.thumbnailUrl, it.source, it.progressSeconds, it.durationSeconds,
                it.completed, it.lastWatchedAt
            )
        }

        SyncDataV2(
            syncMeta = SyncMetaDto(
                schemaVersion = 2,
                deviceId = deviceId,
                lastSyncAt = System.currentTimeMillis(),
                tombstones = emptyList()
            ),
            profiles = profiles,
            history = history,
            favorites = favorites,
            updatedAt = System.currentTimeMillis()
        )
    }
}
