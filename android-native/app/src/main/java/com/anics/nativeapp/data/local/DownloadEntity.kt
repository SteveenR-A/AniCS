package com.anics.nativeapp.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import androidx.room.ColumnInfo
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey
    val id: String,
    val queueOrder: Long = 0,
    val animeTitle: String,
    val episodeNumber: Int,
    val streamUrl: String,
    val referer: String? = null,
    val outputPath: String,
    val status: String = "queued", // queued, downloading, paused, completed, failed, canceled
    val progress: Float = 0f,
    val downloadedBytes: Long = 0,
    val totalBytes: Long? = null,
    @ColumnInfo(defaultValue = "0") val speedBytesPerSecond: Long = 0,
    @ColumnInfo(defaultValue = "''") val animeUrl: String = "",
    @ColumnInfo(defaultValue = "''") val episodeUrl: String = "",
    @ColumnInfo(defaultValue = "''") val thumbnailUrl: String = "",
    @ColumnInfo(defaultValue = "'jkanime'") val source: String = "jkanime",
    val error: String? = null,
    val createdAt: String
)

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads ORDER BY queueOrder ASC")
    fun getAllDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE status = :status ORDER BY queueOrder ASC")
    fun getDownloadsByStatus(status: String): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE id = :id LIMIT 1")
    suspend fun getDownloadById(id: String): DownloadEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDownload(download: DownloadEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBatch(downloads: List<DownloadEntity>)

    @Update
    suspend fun updateDownload(download: DownloadEntity)

    @Query("UPDATE downloads SET status = :status, progress = :progress, downloadedBytes = :bytes WHERE id = :id")
    suspend fun updateProgress(id: String, status: String, progress: Float, bytes: Long)

    @Query("UPDATE downloads SET status = :status, progress = :progress, downloadedBytes = :bytes, totalBytes = :total, speedBytesPerSecond = :speed, error = :error WHERE id = :id")
    suspend fun updateTransfer(id: String, status: String, progress: Float, bytes: Long, total: Long?, speed: Long = 0, error: String? = null)

    @Query("UPDATE downloads SET status = 'paused', speedBytesPerSecond = 0 WHERE status = 'downloading'")
    suspend fun recoverInterrupted()

    @Query("DELETE FROM downloads WHERE id = :id")
    suspend fun deleteDownload(id: String)
}
