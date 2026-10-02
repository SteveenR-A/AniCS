package com.anics.nativeapp.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "history")
data class HistoryEntity(
    @PrimaryKey
    val id: String = java.util.UUID.randomUUID().toString(),
    val profileId: String = "default",
    val animeTitle: String,
    val animeUrl: String,
    val episodeNumber: Int,
    val episodeUrl: String,
    val thumbnailUrl: String = "",
    val source: String = "jkanime",
    val progressSeconds: Long = 0L,
    val durationSeconds: Long = 0L,
    val completed: Boolean = false,
    val lastWatchedAt: Long = System.currentTimeMillis(),
    @androidx.room.ColumnInfo(defaultValue = "''")
    val cloudJson: String = "",
    @androidx.room.ColumnInfo(defaultValue = "NULL")
    val watchProgress: Double? = null
) {
    constructor(
        profileId: String,
        animeTitle: String,
        animeUrl: String,
        episodeNumber: Int,
        episodeUrl: String,
        thumbnailUrl: String,
        source: String,
        progressSeconds: Long,
        durationSeconds: Long,
        completed: Boolean,
        lastWatchedAt: Long
    ) : this(
        id = "${profileId}_${episodeUrl.hashCode()}",
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
        lastWatchedAt = lastWatchedAt
    )
}

@Dao
interface HistoryDao {
    @Query("DELETE FROM history")
    suspend fun deleteAll()

    @Query("SELECT * FROM history WHERE profileId = :profileId ORDER BY lastWatchedAt DESC")
    fun getHistoryForProfile(profileId: String): Flow<List<HistoryEntity>>

    @Query("SELECT * FROM history ORDER BY lastWatchedAt DESC")
    suspend fun getAllHistorySync(): List<HistoryEntity>

    @Query("SELECT * FROM history WHERE profileId = :profileId AND episodeUrl = :episodeUrl LIMIT 1")
    suspend fun getHistoryItem(profileId: String, episodeUrl: String): HistoryEntity?

    @Query("SELECT * FROM history WHERE profileId = :profileId AND animeUrl = :animeUrl ORDER BY episodeNumber DESC LIMIT 1")
    suspend fun getLastWatchedEpisode(profileId: String, animeUrl: String): HistoryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entry: HistoryEntity)

    @Query("DELETE FROM history WHERE profileId = :profileId AND episodeUrl = :episodeUrl")
    suspend fun deleteItem(profileId: String, episodeUrl: String)

    @Query("DELETE FROM history WHERE profileId = :profileId")
    suspend fun clearHistoryForProfile(profileId: String)
}
