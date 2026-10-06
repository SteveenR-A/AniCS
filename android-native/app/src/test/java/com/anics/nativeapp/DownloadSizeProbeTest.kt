package com.anics.nativeapp

import com.anics.nativeapp.downloads.DownloadSizes
import org.junit.Assert.*
import org.junit.Test
import java.net.HttpURLConnection
import java.net.ServerSocket

class DownloadSizeProbeTest {
    private fun probeResponse(response: String, verify: (List<String>) -> Unit = {}): Long? {
        val server = ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"))
        var headers: List<String> = emptyList()
        val thread = Thread {
            try { server.accept().use { socket ->
                val reader = socket.getInputStream().bufferedReader()
                headers = buildList {
                    while (true) { val line = reader.readLine() ?: break; if (line.isEmpty()) break; add(line) }
                }
                socket.getOutputStream().write(response.toByteArray()); socket.getOutputStream().flush()
            } } catch (_: java.io.IOException) { }
        }.apply { start() }
        var opened: HttpURLConnection? = null
        var closed: HttpURLConnection? = null
        return try {
            val total = DownloadSizes.probe("http://127.0.0.1:${server.localPort}/video?token=fixture", "https://catalog.example/episode",
                { opened = it }, { closed = it })
            thread.join(2000)
            assertNotNull(opened); assertSame(opened, closed)
            verify(headers)
            total
        } finally { server.close(); thread.join(2000) }
    }

    @Test fun sendsSingleByteRangeWithRefererAndIdentityEncoding() {
        val total = probeResponse("HTTP/1.1 206 Partial Content\r\nContent-Type: video/mp4\r\nContent-Range: bytes 0-0/9999\r\nContent-Length: 1\r\nConnection: close\r\n\r\nx") { headers ->
            assertTrue(headers.first().contains("/video?token=fixture"))
            assertTrue(headers.any { it.equals("Range: bytes=0-0", true) })
            assertTrue(headers.any { it.equals("Accept-Encoding: identity", true) })
            assertTrue(headers.any { it == "Referer: https://catalog.example/episode" })
        }
        assertEquals(9999L, total)
    }

    @Test fun serverIgnoringRangeProvidesLengthWithoutRequiringTheWholeBody() {
        assertEquals(54321L, probeResponse("HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nContent-Length: 54321\r\nConnection: close\r\n\r\n"))
    }

    @Test fun ignoresHtmlManifestsAndErrorsInsteadOfUsingTheirSizesAsVideoTotal() {
        for ((code, type) in listOf(200 to "text/html", 200 to "application/vnd.apple.mpegurl", 403 to "video/mp4")) {
            assertNull(probeResponse("HTTP/1.1 $code Response\r\nContent-Type: $type\r\nContent-Length: 100\r\nConnection: close\r\n\r\n"))
        }
    }
}
