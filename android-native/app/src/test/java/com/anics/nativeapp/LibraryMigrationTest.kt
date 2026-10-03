package com.anics.nativeapp

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.anics.nativeapp.data.local.*
import com.anics.nativeapp.downloads.TauriLibraryMetadata
import com.anics.nativeapp.downloads.*
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LibraryMigrationTest {
    @Test fun scanAutomaticallyRecoversSharedMetadataCoverAndExistingVideos() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val root = java.io.File(context.cacheDir, "Anime-${java.util.UUID.randomUUID()}").apply { mkdirs() }
        val folder = java.io.File(root, "Black Lagoon").apply { mkdirs() }
        java.io.File(folder, "Ep001.mp4").writeBytes(ByteArray(500))
        val bridge = java.io.File(root, ".anics").apply { mkdirs() }
        java.io.File(bridge, "covers").mkdirs()
        val cover = java.io.File(bridge, "covers/Black Lagoon.jpg").apply { writeBytes(ByteArray(200)) }
        java.io.File(bridge, "library.json").writeText("""[{"title":"Black Lagoon","animeUrl":"https://catalog/black-lagoon","thumbnailUrl":"https://catalog/cover.jpg","source":"jkanime","localCover":"covers/Black Lagoon.jpg"}]""")
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        try {
            val library = LocalLibrary(context, db.downloadDao()) { DocumentFile.fromFile(root) }
            assertEquals(1, library.scan("selected-tree"))
            val row = db.downloadDao().getAllDownloads().first().single()
            assertEquals("https://catalog/black-lagoon", row.animeUrl)
            assertEquals(Uri.fromFile(cover).toString(), row.thumbnailUrl)
            assertEquals("completed", row.status)
            assertEquals(1, library.scan("selected-tree"))
            assertEquals(1, db.downloadDao().getAllDownloads().first().size)
            assertTrue(cover.exists()); assertTrue(java.io.File(folder, "Ep001.mp4").exists())
        } finally { db.close(); root.deleteRecursively() }
    }
    @Test fun localSharedCoverIsPreferredAndBlankNativeDataDoesNotHideTauriMetadata() {
        val shared = LibraryMetadata("Anime", "https://catalog/anime", "content://covers/anime", "donghua")
        val combined = mergeLibraryMetadata(LibraryMetadata("Anime"), shared)!!
        assertEquals(shared.animeUrl, combined.animeUrl); assertEquals(shared.thumbnailUrl, combined.thumbnailUrl)
        assertEquals("donghua", combined.source)
        var calls = 0
        val recovered = resolveSharedCovers(listOf(shared.copy(localCover = "../../private.jpg"))) { calls++; "outside" }
        assertEquals(0, calls); assertEquals(shared.thumbnailUrl, recovered.values.single().thumbnailUrl)
    }
    @Test fun upgradingDatabasePreservesExistingDownloads() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val name = "migration-${java.util.UUID.randomUUID()}.db"
        val db = Room.databaseBuilder(context, AppDatabase::class.java, name).build()
        db.downloadDao().insertDownload(DownloadEntity("old", animeTitle = "Existing", episodeNumber = 4, streamUrl = "", outputPath = "/saved.mp4", status = "completed", createdAt = "2026-10-02"))
        db.close()
        SQLiteDatabase.openDatabase(context.getDatabasePath(name).path, null, SQLiteDatabase.OPEN_READWRITE).use { old ->
            old.execSQL("ALTER TABLE downloads RENAME TO downloads_v3")
            old.execSQL("CREATE TABLE downloads (id TEXT NOT NULL PRIMARY KEY, queueOrder INTEGER NOT NULL, animeTitle TEXT NOT NULL, episodeNumber INTEGER NOT NULL, streamUrl TEXT NOT NULL, referer TEXT, outputPath TEXT NOT NULL, status TEXT NOT NULL, progress REAL NOT NULL, downloadedBytes INTEGER NOT NULL, totalBytes INTEGER, error TEXT, createdAt TEXT NOT NULL)")
            old.execSQL("INSERT INTO downloads SELECT id, queueOrder, animeTitle, episodeNumber, streamUrl, referer, outputPath, status, progress, downloadedBytes, totalBytes, error, createdAt FROM downloads_v3")
            old.execSQL("DROP TABLE downloads_v3")
            old.version = 2
        }
        val upgraded = Room.databaseBuilder(context, AppDatabase::class.java, name).addMigrations(AppDatabase.MIGRATION_2_3).build()
        try {
            val row = upgraded.downloadDao().getDownloadById("old")!!
            assertEquals("Existing", row.animeTitle); assertEquals("/saved.mp4", row.outputPath)
            assertEquals("completed", row.status); assertEquals("jkanime", row.source); assertEquals(0L, row.speedBytesPerSecond)
        } finally { upgraded.close(); context.deleteDatabase(name) }
    }
    @Test fun importingTauriMetadataKeepsOriginalDatabaseUntouched() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val file = java.io.File(context.cacheDir, "exported-tauri.db")
        SQLiteDatabase.openOrCreateDatabase(file, null).use { db ->
            db.execSQL("CREATE TABLE watch_history (anime_title TEXT, anime_url TEXT, thumbnail_url TEXT, source TEXT)")
            db.execSQL("INSERT INTO watch_history VALUES ('Black Lagoon', 'https://catalog/black-lagoon', 'https://catalog/cover.jpg', 'jkanime')")
        }
        val before = file.readBytes()
        val library = TauriLibraryMetadata(context)
        assertEquals(1, library.importDatabase(Uri.fromFile(file)))
        assertEquals("https://catalog/cover.jpg", library.read().values.single().thumbnailUrl)
        assertArrayEquals(before, file.readBytes())
    }
}
