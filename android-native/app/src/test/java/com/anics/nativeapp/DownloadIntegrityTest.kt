package com.anics.nativeapp

import android.content.Context
import android.net.Uri
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.anics.nativeapp.data.local.AppDatabase
import com.anics.nativeapp.data.local.DownloadEntity
import com.anics.nativeapp.downloads.LocalLibrary
import com.anics.nativeapp.downloads.StorageManager
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadIntegrityTest {
    private val context get() = ApplicationProvider.getApplicationContext<Context>()

    @Test fun defaultTargetCreatesAnimeDirectoryAndCanBeReadAfterClosingWriter() {
        val storage = StorageManager(context)
        val path = storage.createDownloadTarget("", "Fixture-${java.util.UUID.randomUUID()}", 4)
        val file = File(path)
        try {
            assertTrue(file.parentFile!!.isDirectory)
            assertTrue(path.startsWith(context.getExternalFilesDir(null)!!.absolutePath) || path.startsWith(context.filesDir.absolutePath))
            storage.openOutputStreamForAppend(path, false).first.use { it.write(ByteArray(2048) { 3 }) }
            assertEquals(2048L, storage.requireReadableVideo(path, 2048))
            assertEquals(2048L, storage.requireReadableVideo(Uri.fromFile(file).toString(), 2048))
        } finally { file.parentFile!!.deleteRecursively() }
    }

    @Test fun rejectsMissingEmptyAndTruncatedFilesAndParentThatIsAFile() {
        val storage = StorageManager(context)
        val root = File(context.cacheDir, "integrity-${java.util.UUID.randomUUID()}").apply { mkdirs() }
        fun rejected(block: () -> Unit) {
            try { block(); fail("El destino inválido fue aceptado") } catch (e: Exception) { assertFalse(e.localizedMessage.isNullOrBlank()) }
        }
        try {
            val file = File(root, "video.mp4")
            rejected { storage.requireReadableVideo(file.path) }
            file.writeBytes(byteArrayOf()); rejected { storage.requireReadableVideo(file.path) }
            file.writeBytes(ByteArray(500)); rejected { storage.requireReadableVideo(file.path, 1000) }
            assertEquals(500L, storage.requireReadableVideo(file.path, 500))
            rejected { storage.openOutputStreamForAppend(File(file, "child.mp4").path) }
        } finally { root.deleteRecursively() }
    }

    @Test fun reconcilesCompletedRowsWithoutDeletingFilesOrTouchingActiveTransfers() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        val file = File(context.cacheDir, "truncated-${java.util.UUID.randomUUID()}.mp4").apply { writeBytes(ByteArray(500)) }
        try {
            fun row(id: String, path: String, status: String = "completed", bytes: Long = 1000) = DownloadEntity(id,
                animeTitle = "Fixture", episodeNumber = 1, streamUrl = "", outputPath = path, status = status,
                progress = 1f, downloadedBytes = bytes, totalBytes = bytes, createdAt = "2026-10-05")
            val dao = db.downloadDao()
            dao.insertBatch(listOf(row("missing", File(context.cacheDir, "absent.mp4").path), row("partial", file.path),
                row("valid", Uri.fromFile(file).toString(), bytes = 500), row("running", file.path, "downloading")))
            LocalLibrary(context, dao).validateCompletedDownloads()
            assertEquals("failed", dao.getDownloadById("missing")!!.status)
            assertTrue(dao.getDownloadById("missing")!!.error!!.contains("no existe"))
            assertEquals("failed", dao.getDownloadById("partial")!!.status)
            assertTrue(dao.getDownloadById("partial")!!.error!!.contains("incompleta"))
            assertEquals("completed", dao.getDownloadById("valid")!!.status)
            assertEquals("downloading", dao.getDownloadById("running")!!.status)
            assertTrue(file.exists())
        } finally { db.close(); file.delete() }
    }
}
