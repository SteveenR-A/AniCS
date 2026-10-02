package com.anics.nativeapp.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "tombstones")
data class TombstoneEntity(@PrimaryKey val id: String, val collection: String, val payload: String)
@Dao
interface TombstoneDao {
    @Query("SELECT * FROM tombstones") suspend fun getAll(): List<TombstoneEntity>
    @Query("SELECT * FROM tombstones") fun observe(): Flow<List<TombstoneEntity>>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(value: TombstoneEntity)
}
