package com.anics.nativeapp.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "favorites")
data class FavoriteEntity(
    @PrimaryKey
    val id: String = java.util.UUID.randomUUID().toString(),
    val profileId: String = "default",
    val title: String,
    val url: String,
    val thumbnailUrl: String = "",
    val source: String = "jkanime",
    val addedAt: Long = System.currentTimeMillis(),
    @androidx.room.ColumnInfo(defaultValue = "''")
    val cloudJson: String = ""
) {
    constructor(
        profileId: String,
        title: String,
        url: String,
        thumbnailUrl: String,
        source: String,
        addedAt: Long
    ) : this(
        id = "${profileId}_${url.hashCode()}",
        profileId = profileId,
        title = title,
        url = url,
        thumbnailUrl = thumbnailUrl,
        source = source,
        addedAt = addedAt
    )
}

@Dao
interface FavoriteDao {
    @Query("DELETE FROM favorites")
    suspend fun deleteAll()

    @Query("SELECT * FROM favorites WHERE profileId = :profileId ORDER BY addedAt DESC")
    fun getFavoritesForProfile(profileId: String): Flow<List<FavoriteEntity>>

    @Query("SELECT * FROM favorites ORDER BY addedAt DESC")
    suspend fun getAllFavoritesSync(): List<FavoriteEntity>

    @Query("SELECT EXISTS(SELECT 1 FROM favorites WHERE profileId = :profileId AND url = :url)")
    suspend fun isFavorite(profileId: String, url: String): Boolean

    @Query("SELECT EXISTS(SELECT 1 FROM favorites WHERE profileId = :profileId AND (url = :url OR url = :cleanUrl OR url = :slashUrl OR url = :canonicalUrl OR url = :canonicalClean))")
    suspend fun isFavoriteFlexible(profileId: String, url: String, cleanUrl: String, slashUrl: String, canonicalUrl: String, canonicalClean: String): Boolean

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(fav: FavoriteEntity)

    @Query("DELETE FROM favorites WHERE profileId = :profileId AND url = :url")
    suspend fun deleteFavorite(profileId: String, url: String)

    @Query("DELETE FROM favorites WHERE id = :id")
    suspend fun deleteFavoriteById(id: String)

    @Query("SELECT COUNT(*) FROM favorites")
    suspend fun getFavoritesCount(): Int
}
