package com.anics.nativeapp

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.anics.nativeapp.data.local.AppDatabase
import com.anics.nativeapp.downloads.DownloadManager
import com.anics.nativeapp.downloads.DownloadRequest
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.net.ServerSocket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DirectDownloadSizeTest {
    @Test fun rangeProbePublishesTotalBeforeBodyForAServerWithoutContentLength() {
        runBlocking {
            val context = ApplicationProvider.getApplicationContext<Context>()
            val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
            val executor = Executors.newCachedThreadPool()
            val server = ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"))
            val releaseBody = CountDownLatch(1)
            val ranges = CopyOnWriteArrayList<String>()
            val referers = CopyOnWriteArrayList<String>()
            val video = ByteArray(2048) { (it % 127).toByte() }
            executor.submit {
                while (!server.isClosed) {
                    val socket = try { server.accept() } catch (_: java.io.IOException) { break }
                    executor.submit { socket.use {
                        val reader = socket.getInputStream().bufferedReader()
                        reader.readLine()
                        var range = ""
                        while (true) {
                            val header = reader.readLine() ?: break
                            if (header.isEmpty()) break
                            if (header.startsWith("Range:", true)) range = header.substringAfter(':').trim()
                            if (header.startsWith("Referer:", true)) referers.add(header.substringAfter(':').trim())
                        }
                        val out = socket.getOutputStream()
                        if (range.isNotEmpty()) {
                            ranges.add(range)
                            out.write("HTTP/1.1 206 Partial Content\r\nContent-Type: video/mp4\r\nContent-Range: bytes 0-0/${video.size}\r\nContent-Length: 1\r\nConnection: close\r\n\r\n".toByteArray())
                            out.write(video.take(1).toByteArray()); out.flush()
                        } else {
                            out.write("HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nConnection: close\r\n\r\n".toByteArray()); out.flush()
                            if (releaseBody.await(20, TimeUnit.SECONDS)) { out.write(video); out.flush() }
                        }
                    } }
                }
            }
            val manager = DownloadManager(context, db.downloadDao())
            var path: String? = null
            try {
                manager.enqueueRequests(listOf(DownloadRequest("direct-size", "Direct ${java.util.UUID.randomUUID()}", 1,
                    "http://127.0.0.1:${server.localPort}/video", "https://catalog.example/episode")))
                withTimeout(15000) { while (db.downloadDao().getDownloadById("direct-size")?.totalBytes == null) delay(20) }
                val running = db.downloadDao().getDownloadById("direct-size")!!
                path = running.outputPath
                assertEquals("downloading", running.status)
                assertEquals(2048L, running.totalBytes)
                assertEquals(0L, running.downloadedBytes)
                assertEquals(listOf("bytes=0-0"), ranges.toList())
                assertEquals(listOf("https://catalog.example/episode", "https://catalog.example/episode"), referers.toList())
                releaseBody.countDown()
                withTimeout(15000) { while (db.downloadDao().getDownloadById("direct-size")!!.status !in listOf("completed", "failed")) delay(20) }
                val finished = db.downloadDao().getDownloadById("direct-size")!!
                assertEquals(finished.error, "completed", finished.status)
                assertArrayEquals(video, java.io.File(finished.outputPath).readBytes())
            } finally {
                releaseBody.countDown(); manager.close(); server.close(); executor.shutdownNow(); delay(100)
                path?.let { java.io.File(it).delete() }; db.close()
            }
        }
    }
}
