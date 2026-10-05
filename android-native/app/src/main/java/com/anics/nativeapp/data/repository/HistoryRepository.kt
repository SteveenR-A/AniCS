package com.anics.nativeapp.data.repository

import com.anics.nativeapp.data.local.HistoryDao
import com.anics.nativeapp.data.local.HistoryEntity
import androidx.room.withTransaction
import kotlinx.serialization.json.*
import com.anics.nativeapp.data.local.TombstoneEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

class HistoryRepository(private val database: com.anics.nativeapp.data.local.AppDatabase) : com.anics.nativeapp.player.PlaybackHistory {
    private val historyDao = database.historyDao()

    fun getHistoryForProfile(profileId: String): Flow<List<HistoryEntity>> {
        return historyDao.getHistoryForProfile(profileId)
    }

    override suspend fun getHistoryItem(profileId: String, episodeUrl: String): HistoryEntity? {
        return historyDao.getHistoryItem(profileId, episodeUrl)
    }

    override suspend fun getEpisodeProgress(profileId: String, title: String, episode: Int): HistoryEntity? {
        val key = com.anics.nativeapp.sync.SyncContract.titleKey(title)
        return historyDao.getHistoryForProfile(profileId).first().firstOrNull {
            it.episodeNumber == episode && com.anics.nativeapp.sync.SyncContract.titleKey(it.animeTitle) == key
        }
    }

    override suspend fun recordProgress(
        profileId: String,
        animeTitle: String,
        animeUrl: String,
        episodeNumber: Int,
        episodeUrl: String,
        thumbnailUrl: String,
        source: String,
        progressSeconds: Long,
        durationSeconds: Long
    ) {
        val previous = historyDao.getHistoryItem(profileId, episodeUrl)
            ?: getEpisodeProgress(profileId, animeTitle, episodeNumber)
        val completed = previous?.completed == true || (previous?.watchProgress ?: 0.0) >= .9 ||
            durationSeconds > 0 && progressSeconds >= (durationSeconds * 0.9)
        val entity = HistoryEntity(
            profileId = profileId,
            animeTitle = animeTitle,
            animeUrl = animeUrl,
            episodeNumber = episodeNumber,
            episodeUrl = episodeUrl,
            thumbnailUrl = thumbnailUrl,
            source = source,
            progressSeconds = progressSeconds,
            durationSeconds = durationSeconds,
            completed = completed,
            lastWatchedAt = System.currentTimeMillis()
        )
        historyDao.upsert(entity.copy(id = previous?.id ?: entity.id, cloudJson = previous?.cloudJson ?: "",
            watchProgress = if (durationSeconds > 0) (progressSeconds.toDouble() / durationSeconds).coerceIn(0.0, 1.0) else previous?.watchProgress))
    }

    suspend fun clearHistory(profileId: String) {
        database.withTransaction {
            val payload = buildJsonObject { put("type", "clear"); put("key", profileId); put("profileId", profileId); put("deletedAt", com.anics.nativeapp.sync.SyncContract.iso(System.currentTimeMillis())) }
            database.tombstoneDao().upsert(TombstoneEntity("history-clear:" + profileId, "deletedHistory", payload.toString()))
            historyDao.clearHistoryForProfile(profileId)
        }
    }

    suspend fun deleteItem(profileId: String, episodeUrl: String) {
        database.withTransaction {
            val entry = historyDao.getHistoryItem(profileId, episodeUrl) ?: return@withTransaction
            val key = com.anics.nativeapp.sync.SyncContract.historyKey(buildJsonObject {
                put("animeTitle", entry.animeTitle); put("animeUrl", entry.animeUrl); put("episodeNumber", entry.episodeNumber); put("profileId", profileId)
            })
            val payload = buildJsonObject { put("type", "episode"); put("key", key); put("profileId", profileId); put("deletedAt", com.anics.nativeapp.sync.SyncContract.iso(System.currentTimeMillis())) }
            database.tombstoneDao().upsert(TombstoneEntity("history:" + key, "deletedHistory", payload.toString()))
            historyDao.deleteItem(profileId, episodeUrl)
        }
    }
}
