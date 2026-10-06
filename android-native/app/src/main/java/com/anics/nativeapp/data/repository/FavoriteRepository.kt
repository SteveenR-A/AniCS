package com.anics.nativeapp.data.repository

import com.anics.nativeapp.data.local.FavoriteDao
import com.anics.nativeapp.data.local.FavoriteEntity
import kotlinx.coroutines.flow.Flow
import androidx.room.withTransaction
import com.anics.nativeapp.data.local.TombstoneEntity
import kotlinx.serialization.json.*

fun canonicalAnimeUrl(rawUrl: String): String {
    if (rawUrl.isBlank()) return rawUrl
    val trimmed = rawUrl.trim().trimEnd('/')
    val segments = trimmed.split('/')
    val last = segments.lastOrNull()
    val clean = if (last != null && last.all { it.isDigit() } && segments.size > 3) {
        segments.dropLast(1).joinToString("/")
    } else {
        trimmed
    }
    return if (clean.startsWith("http://", ignoreCase = true) || clean.startsWith("https://", ignoreCase = true)) {
        "$clean/"
    } else {
        clean
    }
}

class FavoriteRepository(private val database: com.anics.nativeapp.data.local.AppDatabase) {
    private val favoriteDao = database.favoriteDao()

    fun getFavoritesForProfile(profileId: String): Flow<List<FavoriteEntity>> {
        return favoriteDao.getFavoritesForProfile(profileId)
    }

    suspend fun isFavorite(profileId: String, animeUrl: String): Boolean {
        if (animeUrl.isBlank()) return false
        val trimmed = animeUrl.trim().trimEnd('/')
        val withSlash = "$trimmed/"
        val canonical = canonicalAnimeUrl(animeUrl)
        val canonicalTrimmed = canonical.trimEnd('/')

        return favoriteDao.isFavoriteFlexible(
            profileId = profileId,
            url = animeUrl,
            cleanUrl = trimmed,
            slashUrl = withSlash,
            canonicalUrl = canonical,
            canonicalClean = canonicalTrimmed
        )
    }

    suspend fun toggleFavorite(
        profileId: String,
        title: String,
        url: String,
        thumbnailUrl: String,
        source: String
    ): Boolean {
        val current = isFavorite(profileId, url)
        return if (current) {
            removeFavorite(profileId, url)
            false
        } else {
            val canonical = canonicalAnimeUrl(url)
            favoriteDao.upsert(
                FavoriteEntity(
                    profileId = profileId,
                    title = title,
                    url = canonical,
                    thumbnailUrl = thumbnailUrl,
                    source = source,
                    addedAt = System.currentTimeMillis()
                )
            )
            true
        }
    }

    suspend fun removeFavorite(profileId: String, animeUrl: String) {
        val trimmed = animeUrl.trim().trimEnd('/')
        val withSlash = "$trimmed/"
        val canonical = canonicalAnimeUrl(animeUrl)
        val canonicalTrimmed = canonical.trimEnd('/')

        database.withTransaction {
            val payload = buildJsonObject { put("url", canonical); put("profileId", profileId); put("deletedAt", com.anics.nativeapp.sync.SyncContract.iso(System.currentTimeMillis())) }
            database.tombstoneDao().upsert(TombstoneEntity("favorite:$profileId:$canonical", "deletedFavorites", payload.toString()))
            favoriteDao.deleteFavorite(profileId, animeUrl)
            if (trimmed != animeUrl) favoriteDao.deleteFavorite(profileId, trimmed)
            if (withSlash != animeUrl) favoriteDao.deleteFavorite(profileId, withSlash)
            if (canonical != animeUrl) favoriteDao.deleteFavorite(profileId, canonical)
            if (canonicalTrimmed != canonical) favoriteDao.deleteFavorite(profileId, canonicalTrimmed)
        }
    }
}
