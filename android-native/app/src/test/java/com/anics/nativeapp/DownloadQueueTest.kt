package com.anics.nativeapp

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.anics.nativeapp.data.local.AppDatabase
import com.anics.nativeapp.data.repository.SettingsRepository
import com.anics.nativeapp.downloads.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.net.ServerSocket
import java.util.concurrent.Executors
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadQueueTest {
    private suspend fun await(check: suspend () -> Boolean) {
        withTimeout(15000) { while (!check()) { org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofMillis(50)); delay(20) } }
    }
    @Test fun queueHonorsLimitPausesResumesByRangeAndPreservesMetadata() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        val dao = db.downloadDao()
        val settings = SettingsRepository(context)
        settings.updateMaxDownloads(1)
        val payload = ByteArray(2 * 1024 * 1024) { (it % 251).toByte() }
        val ranges = CopyOnWriteArrayList<Int>()
        val active = AtomicInteger(); val peak = AtomicInteger()
        val executor = Executors.newCachedThreadPool()
        val server = ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"))
        executor.submit {
            while (!server.isClosed) {
                val socket = try { server.accept() } catch (_: java.io.IOException) { break }
                executor.submit { socket.use {
                val concurrent = active.incrementAndGet(); peak.updateAndGet { maxOf(it, concurrent) }
                try {
                    val reader = socket.getInputStream().bufferedReader()
                    val headers = mutableListOf<String>()
                    while (true) { val line = reader.readLine() ?: break; if (line.isEmpty()) break; headers.add(line) }
                    val start = headers.firstOrNull { it.startsWith("Range:", true) }?.substringAfter("bytes=")?.substringBefore('-')?.toInt() ?: 0
                    ranges.add(start)
                    socket.getOutputStream().use { out ->
                        val range = if (start > 0) "Content-Range: bytes $start-${payload.lastIndex}/${payload.size}\r\n" else ""
                        out.write("HTTP/1.1 ${if (start > 0) "206 Partial Content" else "200 OK"}\r\nContent-Type: video/mp4\r\nContent-Length: ${payload.size-start}\r\n${range}Connection: close\r\n\r\n".toByteArray())
                        var offset = start; while (offset < payload.size) { val count = minOf(8192, payload.size - offset); out.write(payload, offset, count); out.flush(); offset += count; Thread.sleep(8) }
                    }
                } catch (_: java.io.IOException) { } finally { active.decrementAndGet() }
                } }
            }
        }
        val manager = DownloadManager(context, dao)
        try {
            val url = "http://127.0.0.1:${server.localPort}/video.mp4"
            val title = "Queue fixture ${java.util.UUID.randomUUID()}"
            manager.enqueueRequests((1..3).map { DownloadRequest("$it", title, it, url, animeUrl = "https://catalog/anime", thumbnailUrl = "https://catalog/cover.jpg") })
            await { dao.getDownloadById("1")!!.downloadedBytes > 0 }
            assertEquals("queued", dao.getDownloadById("2")!!.status)
            assertEquals(1, peak.get())
            manager.pauseDownload("1")
            val paused = dao.getDownloadById("1")!!
            assertEquals("paused", paused.status)
            val offset = StorageManager(context).getFileLength(paused.outputPath)
            assertTrue(offset > 0 && offset < payload.size)
            manager.pauseDownload("2"); manager.pauseDownload("3")
            manager.resumeDownload("1")
            await { dao.getDownloadById("1")!!.status == "completed" }
            assertTrue(ranges.contains(offset.toInt()))
            assertArrayEquals(payload, java.io.File(paused.outputPath).readBytes())
            val completed = dao.getDownloadById("1")!!
            assertEquals(payload.size.toLong(), completed.totalBytes)
            assertEquals("https://catalog/anime", completed.animeUrl)
            assertEquals("https://catalog/cover.jpg", completed.thumbnailUrl)
            manager.enqueueRequests(listOf(DownloadRequest("duplicate", title, 1, url)))
            assertNull(dao.getDownloadById("duplicate"))
            settings.updateMaxDownloads(2)
            manager.resumeDownload("2"); manager.resumeDownload("3")
            await { active.get() == 2 }
            manager.cancelDownload("2"); manager.cancelDownload("3")
            assertNull(dao.getDownloadById("2")); assertNull(dao.getDownloadById("3"))
            assertEquals(2, peak.get())
        } finally { manager.close(); server.close(); executor.shutdownNow(); delay(100); db.close() }
    }
}
