package com.anics.nativeapp

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.anics.nativeapp.data.local.AppDatabase
import com.anics.nativeapp.data.local.DownloadEntity
import com.anics.nativeapp.data.repository.SettingsRepository
import com.anics.nativeapp.downloads.LocalLibrary
import com.anics.nativeapp.downloads.StorageManager
import com.anics.nativeapp.ui.viewmodels.DownloadsViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadDeletionTest {
    private val context get() = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun deleteFileRemovesLocalFile() {
        val storage = StorageManager(context)
        val title = "TestAnime-${UUID.randomUUID()}"
        val path = storage.createDownloadTarget("", title, 1)
        val file = File(path)
        file.writeBytes(ByteArray(1024) { 1 })
        assertTrue(file.exists())

        val deleted = storage.deleteFile(path)
        assertTrue(deleted)
        assertFalse(file.exists())
        file.parentFile?.deleteRecursively()
    }

    @Test
    fun cleanEmptyAnimeFolderPreservesDirectoryWhenOtherVideosRemain() {
        val storage = StorageManager(context)
        val title = "TestAnime-${UUID.randomUUID()}"
        val ep1 = File(storage.createDownloadTarget("", title, 1))
        val ep2 = File(storage.createDownloadTarget("", title, 2))
        ep1.writeBytes(ByteArray(1024) { 1 })
        ep2.writeBytes(ByteArray(1024) { 2 })

        val animeDir = ep1.parentFile!!
        assertTrue(animeDir.isDirectory)

        // Delete ep1
        storage.deleteFile(ep1.absolutePath)
        assertFalse(ep1.exists())

        // Try cleanEmptyAnimeFolderSafely -> ep2 still exists, so animeDir must remain
        storage.cleanEmptyAnimeFolderSafely(title)
        assertTrue(animeDir.exists())
        assertTrue(ep2.exists())

        animeDir.deleteRecursively()
    }

    @Test
    fun cleanEmptyAnimeFolderRemovesResidualsAndDirectoryWhenNoVideosRemain() {
        val storage = StorageManager(context)
        val title = "TestAnime-${UUID.randomUUID()}"
        val ep1 = File(storage.createDownloadTarget("", title, 1))
        ep1.writeBytes(ByteArray(1024) { 1 })
        val animeDir = ep1.parentFile!!

        // Add residual cover image and .nomedia
        File(animeDir, "poster.jpg").writeBytes(ByteArray(100) { 5 })
        File(animeDir, ".nomedia").writeBytes(byteArrayOf())

        // Delete ep1
        storage.deleteFile(ep1.absolutePath)
        assertFalse(ep1.exists())

        // Clean empty folder -> must delete poster, .nomedia, and the anime directory
        val cleaned = storage.cleanEmptyAnimeFolderSafely(title)
        assertTrue(cleaned)
        assertFalse(animeDir.exists())
    }

    @Test
    fun deleteAnimeFolderRemovesEntireFolderAndContents() {
        val storage = StorageManager(context)
        val title = "TestAnime-${UUID.randomUUID()}"
        val ep1 = File(storage.createDownloadTarget("", title, 1))
        val ep2 = File(storage.createDownloadTarget("", title, 2))
        ep1.writeBytes(ByteArray(500) { 1 })
        ep2.writeBytes(ByteArray(500) { 2 })
        val animeDir = ep1.parentFile!!
        File(animeDir, "poster.png").writeBytes(ByteArray(50))

        val deleted = storage.deleteAnimeFolder(title)
        assertTrue(deleted)
        assertFalse(animeDir.exists())
        assertFalse(ep1.exists())
        assertFalse(ep2.exists())
    }

    @Test
    fun viewModelDeleteVideoDeletesFileCleansFolderAndUpdatesDatabase() = runTest {
        val testDispatcher = StandardTestDispatcher(testScheduler)
        Dispatchers.setMain(testDispatcher)
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).allowMainThreadQueries().build()
        val storage = StorageManager(context)
        val title = "TestAnime-${UUID.randomUUID()}"
        val epFile = File(storage.createDownloadTarget("", title, 1))
        epFile.writeBytes(ByteArray(1000) { 1 })

        val entity = DownloadEntity(
            id = "test-ep1",
            animeTitle = title,
            episodeNumber = 1,
            streamUrl = "",
            outputPath = epFile.absolutePath,
            status = "completed",
            progress = 1f,
            downloadedBytes = 1000,
            totalBytes = 1000,
            createdAt = "2026-10-07"
        )
        db.downloadDao().insertDownload(entity)

        val vm = DownloadsViewModel(
            downloadDao = db.downloadDao(),
            library = LocalLibrary(context, db.downloadDao()),
            settingsRepository = SettingsRepository(context),
            context = context,
            savedStateHandle = SavedStateHandle(),
            ioDispatcher = testDispatcher,
            database = db
        )

        val job = vm.deleteVideo("test-ep1")
        var loops = 100
        while (!job.isCompleted && loops-- > 0) {
            testScheduler.advanceUntilIdle()
            org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofMillis(50))
            Thread.sleep(20)
        }
        testScheduler.advanceUntilIdle()

        assertFalse("epFile must be deleted", epFile.exists())
        assertFalse("epFile parent dir must be deleted", epFile.parentFile!!.exists())
        assertNull("database row must be deleted", db.downloadDao().getDownloadById("test-ep1"))

        Dispatchers.resetMain()
        db.close()
    }

    @Test
    fun viewModelDeleteAnimeRemovesAllEpisodesFilesFolderAndDatabaseRows() = runTest {
        val testDispatcher = StandardTestDispatcher(testScheduler)
        Dispatchers.setMain(testDispatcher)
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).allowMainThreadQueries().build()
        val storage = StorageManager(context)
        val title = "Series-${UUID.randomUUID()}"
        val ep1 = File(storage.createDownloadTarget("", title, 1))
        val ep2 = File(storage.createDownloadTarget("", title, 2))
        ep1.writeBytes(ByteArray(1000) { 1 })
        ep2.writeBytes(ByteArray(1000) { 2 })
        val animeDir = ep1.parentFile!!

        db.downloadDao().insertBatch(listOf(
            DownloadEntity("dl-1", animeTitle = title, episodeNumber = 1, streamUrl = "", outputPath = ep1.absolutePath, status = "completed", progress = 1f, downloadedBytes = 1000, totalBytes = 1000, createdAt = "2026-10-07"),
            DownloadEntity("dl-2", animeTitle = title, episodeNumber = 2, streamUrl = "", outputPath = ep2.absolutePath, status = "completed", progress = 1f, downloadedBytes = 1000, totalBytes = 1000, createdAt = "2026-10-07")
        ))

        val vm = DownloadsViewModel(
            downloadDao = db.downloadDao(),
            library = LocalLibrary(context, db.downloadDao()),
            settingsRepository = SettingsRepository(context),
            context = context,
            savedStateHandle = SavedStateHandle(),
            ioDispatcher = testDispatcher,
            database = db
        )

        val job = vm.deleteAnime(title)
        var loops = 100
        while (!job.isCompleted && loops-- > 0) {
            testScheduler.advanceUntilIdle()
            org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofMillis(50))
            Thread.sleep(20)
        }
        testScheduler.advanceUntilIdle()

        assertFalse("animeDir must be deleted", animeDir.exists())
        assertFalse("ep1 must be deleted", ep1.exists())
        assertFalse("ep2 must be deleted", ep2.exists())
        assertEquals("all downloads must be removed", 0, db.downloadDao().getAllDownloadsSnapshot().size)

        Dispatchers.resetMain()
        db.close()
    }
}
