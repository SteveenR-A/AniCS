package com.anics.nativeapp

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.anics.nativeapp.data.local.AppDatabase
import com.anics.nativeapp.downloads.*
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.net.ServerSocket
import java.util.concurrent.Executors
import java.util.concurrent.CopyOnWriteArrayList

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class HlsDownloadTest {
    @Test fun downloadsAndDecryptsFiniteHlsWithoutSavingTheManifestAsVideo() {
        runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        val key = ByteArray(16) { it.toByte() }
        val first = ByteArray(1024) { (it % 127).toByte() }
        val second = ByteArray(512) { (it % 89).toByte() }
        val iv = java.nio.ByteBuffer.allocate(16).putLong(0).putLong(1).array()
        val cipher = javax.crypto.Cipher.getInstance("AES/CBC/PKCS5Padding")
        cipher.init(javax.crypto.Cipher.ENCRYPT_MODE, javax.crypto.spec.SecretKeySpec(key, "AES"), javax.crypto.spec.IvParameterSpec(iv))
        val playlist = "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:1\n#EXT-X-KEY:METHOD=AES-128,URI=\"key\"\n#EXTINF:6,\n1.ts\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:6,\n2.ts\n#EXT-X-ENDLIST"
        val responses = mapOf("/list.m3u8" to playlist.toByteArray(), "/key" to key, "/1.ts" to cipher.doFinal(first), "/2.ts" to second)
        val referers = CopyOnWriteArrayList<String>()
        val executor = Executors.newCachedThreadPool()
        val server = ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"))
        executor.submit {
            while (!server.isClosed) {
                val socket = try { server.accept() } catch (_: java.io.IOException) { break }
                executor.submit { socket.use {
                    val reader = socket.getInputStream().bufferedReader()
                    val path = reader.readLine().split(' ')[1]
                    while (true) {
                        val line = reader.readLine() ?: break
                        if (line.isEmpty()) break
                        if (line.startsWith("Referer:", true)) referers.add(line.substringAfter(':').trim())
                    }
                    val data = responses[path] ?: ByteArray(0)
                    val type = if (path.endsWith(".m3u8")) "application/vnd.apple.mpegurl" else "application/octet-stream"
                    socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Type: $type\r\nContent-Length: ${data.size}\r\nConnection: close\r\n\r\n".toByteArray() + data)
                } }
            }
        }
        val manager = DownloadManager(context, db.downloadDao())
        try {
            manager.enqueueRequests(listOf(DownloadRequest("hls-fixture", "HLS ${java.util.UUID.randomUUID()}", 1, "http://127.0.0.1:${server.localPort}/list.m3u8", "https://catalog.example/episode")))
            withTimeout(15000) { while (db.downloadDao().getDownloadById("hls-fixture")!!.status !in listOf("completed", "failed")) delay(20) }
            val row = db.downloadDao().getDownloadById("hls-fixture")!!
            assertEquals(row.error, "completed", row.status)
            assertTrue(row.outputPath.endsWith(".ts"))
            assertArrayEquals(first + second, java.io.File(row.outputPath).readBytes())
            assertEquals((first.size + second.size).toLong(), row.totalBytes)
            assertTrue(referers.size >= 4)
            assertTrue(referers.all { it == "https://catalog.example/episode" })
            java.io.File(row.outputPath).delete()
        } finally { manager.close(); server.close(); executor.shutdownNow(); delay(100); db.close() }
        }
    }
}
