package com.anics.nativeapp.data.repository

import com.anics.nativeapp.data.local.HistoryDao
import com.anics.nativeapp.data.local.HistoryEntity
import kotlinx.coroutines.flow.Flow

class HistoryRepository(private val historyDao: HistoryDao) {

    fun getHistoryForProfile(profileId: String): Flow<List<HistoryEntity>> {
        return historyDao.getHistoryForProfile(profileId)
    }

    suspend fun getHistoryItem(profileId: String, episodeUrl: String): HistoryEntity? {
        return historyDao.getHistoryItem(profileId, episodeUrl)
    }

    suspend fun recordProgress(
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
        val completed = durationSeconds > 0 && progressSeconds >= (durationSeconds * 0.9)
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
        historyDao.upsert(entity)
    }

    suspend fun clearHistory(profileId: String) {
        historyDao.clearHistoryForProfile(profileId)
    }

    suspend fun deleteItem(profileId: String, episodeUrl: String) {
        historyDao.deleteItem(profileId, episodeUrl)
    }
}
