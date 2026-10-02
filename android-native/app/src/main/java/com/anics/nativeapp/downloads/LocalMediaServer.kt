package com.anics.nativeapp.downloads

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.*
import java.io.Closeable
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap

/** Loopback streaming for SAF and filesystem videos, with single HTTP Range support. */
class LocalMediaServer(private val openFile: (String) -> java.io.InputStream) : Closeable {
    constructor(context: Context) : this({ path ->
        if (path.startsWith("content://")) context.contentResolver.openInputStream(Uri.parse(path)) ?: throw java.io.FileNotFoundException("No se pudo leer el video") else File(path).inputStream()
    })
    private val accessToken = java.util.UUID.randomUUID().toString()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val files = ConcurrentHashMap<String, Long>()
    private var server: ServerSocket? = null
    @Synchronized fun videoUrl(path: String, length: Long): String {
        require(length > 0) { "El video está vacío o no se puede leer" }
        files[path] = length
        if (server == null) {
            val socket = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
            server = socket
            scope.launch {
                while (isActive) {
                    val client = try { socket.accept() } catch (_: java.io.IOException) { break }
                    launch { client.use { serve(it) } }
                }
            }
        }
        return "http://127.0.0.1:" + server!!.localPort + "/video?path=" + URLEncoder.encode(path, "UTF-8") + "&token=" + accessToken
    }
    private fun serve(socket: Socket) {
        socket.soTimeout = 15000
        try {
            val reader = socket.getInputStream().bufferedReader(Charsets.US_ASCII)
            val request = reader.readLine()?.split(' ') ?: return
            val output = socket.getOutputStream()
            fun error(status: Int) { output.write("HTTP/1.1 $status Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray()); output.flush() }
            if (request.size != 3 || request[0] !in listOf("GET", "HEAD")) { error(405); return }
            val uri = java.net.URI(request[1])
            val query = uri.rawQuery?.split('&')?.associate { it.substringBefore('=') to URLDecoder.decode(it.substringAfter('=', ""), "UTF-8") } ?: emptyMap()
            if (!java.security.MessageDigest.isEqual(accessToken.toByteArray(), (query["token"] ?: "").toByteArray())) { error(403); return }
            val path = query["path"]
            val length = path?.let { files[it] }
            if (uri.path != "/video" || path == null || length == null) { error(404); return }
            var range: String? = null; var lines = 0
            while (true) {
                val line = reader.readLine() ?: return
                if (line.isEmpty()) break
                if (++lines > 64 || line.length > 8192) { error(400); return }
                if (line.startsWith("Range:", ignoreCase = true)) range = line.substringAfter(':').trim()
            }
            var start = 0L; var end = length - 1
            if (range != null) {
                val parts = Regex("""bytes=(\d*)-(\d*)""").matchEntire(range!!)?.groupValues
                if (parts == null || (parts[1].isEmpty() && parts[2].isEmpty())) { error(416); return }
                if (parts[1].isEmpty()) start = (length - (parts[2].toLongOrNull() ?: 0)).coerceAtLeast(0)
                else { start = parts[1].toLongOrNull() ?: length; end = parts[2].toLongOrNull()?.coerceAtMost(end) ?: end }
                if (start > end || start >= length) { output.write("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */$length\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray()); return }
            }
            val input = openFile(path)
            input.use {
                var skipped = 0L
                while (skipped < start) { val count = it.skip(start - skipped); if (count <= 0) { if (it.read() < 0) throw java.io.EOFException(); skipped++ } else skipped += count }
                val status = if (range == null) "200 OK" else "206 Partial Content"
                val contentRange = if (range == null) "" else "Content-Range: bytes $start-$end/$length\r\n"
                output.write("HTTP/1.1 $status\r\nAccept-Ranges: bytes\r\nContent-Type: video/mp4\r\nContent-Length: ${end - start + 1}\r\n${contentRange}Connection: close\r\n\r\n".toByteArray())
                if (request[0] == "GET") {
                    var remaining = end - start + 1; val buffer = ByteArray(65536)
                    while (remaining > 0 && scope.isActive) { val count = it.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt()); if (count < 0) break; output.write(buffer, 0, count); remaining -= count }
                }
                output.flush()
            }
        } catch (_: java.io.IOException) { } catch (_: SecurityException) { } catch (_: IllegalArgumentException) { }
    }
    override fun close() { server?.close(); server = null; scope.cancel(); files.clear() }
}
