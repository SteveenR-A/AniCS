package com.anics.nativeapp.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        ProfileEntity::class,
        HistoryEntity::class,
        FavoriteEntity::class,
        DownloadEntity::class,
        TombstoneEntity::class
    ],
    version = 3,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun profileDao(): ProfileDao
    abstract fun historyDao(): HistoryDao
    abstract fun favoriteDao(): FavoriteDao
    abstract fun tombstoneDao(): TombstoneDao
    abstract fun downloadDao(): DownloadDao

    companion object {
        val MIGRATION_2_3 = object : androidx.room.migration.Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE downloads ADD COLUMN speedBytesPerSecond INTEGER NOT NULL DEFAULT 0")
                for (column in listOf("animeUrl", "episodeUrl", "thumbnailUrl")) db.execSQL("ALTER TABLE downloads ADD COLUMN $column TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE downloads ADD COLUMN source TEXT NOT NULL DEFAULT 'jkanime'")
            }
        }
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase = getDatabase(context)

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "anics_native.db"
                )
                    .addMigrations(object : androidx.room.migration.Migration(1, 2) {
                        override fun migrate(db: SupportSQLiteDatabase) {
                            db.execSQL("CREATE TABLE IF NOT EXISTS tombstones (id TEXT NOT NULL PRIMARY KEY, collection TEXT NOT NULL, payload TEXT NOT NULL)")
                            for (table in listOf("profiles", "history", "favorites")) db.execSQL("ALTER TABLE $table ADD COLUMN cloudJson TEXT NOT NULL DEFAULT ''")
                            db.execSQL("ALTER TABLE history ADD COLUMN watchProgress REAL DEFAULT NULL")
                        }
                    })
                    .addMigrations(MIGRATION_2_3)
                    .addCallback(object : Callback() {
                        override fun onCreate(db: SupportSQLiteDatabase) {
                            super.onCreate(db)
                            // Seed synchronously after Room creates the tables. An async
                            // seed could overwrite a profile imported just after startup.
                            db.execSQL(
                                "INSERT OR IGNORE INTO profiles (id, name, avatar, color, isActive, createdAt, cloudJson) VALUES (?, ?, ?, ?, ?, ?, ?)",
                                arrayOf("default", "Principal", "user", "#6366F1", 1, System.currentTimeMillis(), "")
                            )
                        }
                    })
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
