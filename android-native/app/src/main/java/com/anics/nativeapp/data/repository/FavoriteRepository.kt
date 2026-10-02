package com.anics.nativeapp.data.repository

import com.anics.nativeapp.data.local.FavoriteDao
import com.anics.nativeapp.data.local.FavoriteEntity
import kotlinx.coroutines.flow.Flow
import androidx.room.withTransaction
import com.anics.nativeapp.data.local.TombstoneEntity
import kotlinx.serialization.json.*

class FavoriteRepository(private val database: com.anics.nativeapp.data.local.AppDatabase) {
    private val favoriteDao = database.favoriteDao()

    fun getFavoritesForProfile(profileId: String): Flow<List<FavoriteEntity>> {
        return favoriteDao.getFavoritesForProfile(profileId)
    }

    suspend fun isFavorite(profileId: String, animeUrl: String): Boolean {
        return favoriteDao.isFavorite(profileId, animeUrl)
    }

    suspend fun toggleFavorite(
        profileId: String,
        title: String,
        url: String,
        thumbnailUrl: String,
        source: String
    ): Boolean {
        val current = favoriteDao.isFavorite(profileId, url)
        return if (current) {
            removeFavorite(profileId, url)
            false
        } else {
            favoriteDao.upsert(
                FavoriteEntity(
                    profileId = profileId,
                    title = title,
                    url = url,
                    thumbnailUrl = thumbnailUrl,
                    source = source,
                    addedAt = System.currentTimeMillis()
                )
            )
            true
        }
    }

    suspend fun removeFavorite(profileId: String, animeUrl: String) {
        database.withTransaction {
            val payload = buildJsonObject { put("url", animeUrl); put("profileId", profileId); put("deletedAt", com.anics.nativeapp.sync.SyncContract.iso(System.currentTimeMillis())) }
            database.tombstoneDao().upsert(TombstoneEntity("favorite:$profileId:$animeUrl", "deletedFavorites", payload.toString()))
            favoriteDao.deleteFavorite(profileId, animeUrl)
        }
    }
}
