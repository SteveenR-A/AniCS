package com.anics.nativeapp.sync

import com.anics.nativeapp.data.local.AppDatabase
import com.anics.nativeapp.data.local.FavoriteEntity
import com.anics.nativeapp.data.local.HistoryEntity
import com.anics.nativeapp.data.local.ProfileEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class AniCSBackup(
    val version: Int = 2,
    val exportedAt: Long = System.currentTimeMillis(),
    val appVariant: String = "android-native",
    val profiles: List<ProfileBackupDto> = emptyList(),
    val history: List<HistoryBackupDto> = emptyList(),
    val favorites: List<FavoriteBackupDto> = emptyList()
)

@Serializable
data class ProfileBackupDto(
    val id: String,
    val name: String,
    val avatar: String,
    val createdAt: Long
)

@Serializable
data class HistoryBackupDto(
    val profileId: String,
    val animeTitle: String,
    val animeUrl: String,
    val episodeNumber: Int,
    val episodeUrl: String,
    val thumbnailUrl: String,
    val source: String,
    val progressSeconds: Long,
    val durationSeconds: Long,
    val completed: Boolean,
    val lastWatchedAt: Long
)

@Serializable
data class FavoriteBackupDto(
    val profileId: String,
    val title: String,
    val url: String,
    val thumbnailUrl: String,
    val source: String,
    val addedAt: Long
)

class BackupManager(
    private val database: AppDatabase,
    private val json: Json = Json { ignoreUnknownKeys = true; prettyPrint = true }
) {

    suspend fun createBackupJson(): String = withContext(Dispatchers.IO) {
        val profiles = database.profileDao().getAllProfilesSync().map {
            ProfileBackupDto(it.id, it.name, it.avatar, it.createdAt)
        }
        val history = database.historyDao().getAllHistorySync().map {
            HistoryBackupDto(
                it.profileId, it.animeTitle, it.animeUrl, it.episodeNumber, it.episodeUrl,
                it.thumbnailUrl, it.source, it.progressSeconds, it.durationSeconds,
                it.completed, it.lastWatchedAt
            )
        }
        val favorites = database.favoriteDao().getAllFavoritesSync().map {
            FavoriteBackupDto(it.profileId, it.title, it.url, it.thumbnailUrl, it.source, it.addedAt)
        }

        val backup = AniCSBackup(
            profiles = profiles,
            history = history,
            favorites = favorites
        )

        json.encodeToString(backup)
    }

    suspend fun restoreBackupJson(backupJson: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val backup = json.decodeFromString<AniCSBackup>(backupJson)

            // Restaurar perfiles
            backup.profiles.forEach { p ->
                database.profileDao().insert(
                    ProfileEntity(p.id, p.name, p.avatar, isActive = false, createdAt = p.createdAt)
                )
            }

            // Restaurar favoritos
            backup.favorites.forEach { f ->
                database.favoriteDao().upsert(
                    FavoriteEntity(f.profileId, f.title, f.url, f.thumbnailUrl, f.source, f.addedAt)
                )
            }

            // Restaurar historial
            backup.history.forEach { h ->
                database.historyDao().upsert(
                    HistoryEntity(
                        h.profileId, h.animeTitle, h.animeUrl, h.episodeNumber, h.episodeUrl,
                        h.thumbnailUrl, h.source, h.progressSeconds, h.durationSeconds,
                        h.completed, h.lastWatchedAt
                    )
                )
            }

            true
        } catch (_: Exception) {
            false
        }
    }
}
