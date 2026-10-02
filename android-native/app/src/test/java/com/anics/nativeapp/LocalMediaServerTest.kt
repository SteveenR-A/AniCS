package com.anics.nativeapp

import com.anics.nativeapp.downloads.LocalMediaServer
import java.net.Socket
import java.net.URI
import java.io.ByteArrayInputStream
import org.junit.Assert.*
import org.junit.Test

class LocalMediaServerTest {
    private fun request(url: String, method: String = "GET", range: String? = null): Pair<String, String> {
        val uri = URI(url)
        return Socket(uri.host, uri.port).use { socket ->
            socket.soTimeout = 10000
            val header = range?.let { "Range: $it\r\n" } ?: ""
            socket.getOutputStream().write("$method ${uri.rawPath}?${uri.rawQuery} HTTP/1.1\r\nHost: localhost\r\n${header}\r\n".toByteArray())
            val response = socket.getInputStream().readBytes().toString(Charsets.UTF_8)
            response.substringBefore("\r\n\r\n") to response.substringAfter("\r\n\r\n")
        }
    }
    @Test fun rangeRequestsStreamOnlyTheRequestedBytes() {
        LocalMediaServer { ByteArrayInputStream("0123456789".toByteArray()) }.use { server ->
            val url = server.videoUrl("/fixture.mp4", 10)
            val (header, body) = request(url, range = "bytes=2-5")
            assertTrue(header.startsWith("HTTP/1.1 206")); assertTrue(header.contains("Content-Range: bytes 2-5/10")); assertEquals("2345", body)
            assertEquals("789", request(url, range = "bytes=-3").second)
            assertEquals("56789", request(url, range = "bytes=5-").second)
        }
    }
    @Test fun headAndInvalidRangesBehaveLikeTheTauriServer() {
        LocalMediaServer { ByteArrayInputStream("0123456789".toByteArray()) }.use { server ->
            val url = server.videoUrl("/fixture.mp4", 10)
            val (header, body) = request(url, method = "HEAD")
            assertTrue(header.startsWith("HTTP/1.1 200")); assertTrue(header.contains("Content-Length: 10")); assertEquals("", body)
            assertTrue(request(url, range = "bytes=10-").first.startsWith("HTTP/1.1 416"))
            assertTrue(request(url, range = "bytes=3-1").first.startsWith("HTTP/1.1 416"))
        }
    }
    @Test fun onlyRegisteredFilesWithTheSessionTokenAreReadable() {
        LocalMediaServer { ByteArrayInputStream("0123456789".toByteArray()) }.use { server ->
            val url = server.videoUrl("/fixture.mp4", 10)
            assertEquals("0123456789", request(url).second)
            assertTrue(request(url.substringBefore("&token=")).first.startsWith("HTTP/1.1 403"))
            assertTrue(request(url.replace("fixture.mp4", "other.mp4")).first.startsWith("HTTP/1.1 404"))
        }
    }
}
