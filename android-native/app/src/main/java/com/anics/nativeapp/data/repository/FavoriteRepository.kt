package com.anics.nativeapp.data.repository

import com.anics.nativeapp.data.local.FavoriteDao
import com.anics.nativeapp.data.local.FavoriteEntity
import kotlinx.coroutines.flow.Flow

class FavoriteRepository(private val favoriteDao: FavoriteDao) {

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
            favoriteDao.deleteFavorite(profileId, url)
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
        favoriteDao.deleteFavorite(profileId, animeUrl)
    }
}
