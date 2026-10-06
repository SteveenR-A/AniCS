package com.anics.nativeapp.downloads

import java.net.HttpURLConnection
import java.net.URL

data class DownloadSizeInfo(val total: Long?, val estimated: Boolean, val fraction: Float?)

object DownloadSizes {
    /** HLS progress comes from completed segment durations. Never use its estimate for integrity checks. */
    fun info(bytes: Long, total: Long?, segmentProgress: Float): DownloadSizeInfo {
        if (total != null && total > 0) return DownloadSizeInfo(total, false, (bytes.toDouble() / total).toFloat().coerceIn(0f, 1f))
        if (bytes > 0 && segmentProgress.isFinite() && segmentProgress > 0f && segmentProgress <= 1f) {
            val estimate = (bytes.toDouble() / segmentProgress).coerceAtMost(Long.MAX_VALUE.toDouble()).toLong().coerceAtLeast(bytes)
            return DownloadSizeInfo(estimate, true, segmentProgress)
        }
        return DownloadSizeInfo(null, false, null)
    }

    /** A one-byte range response must describe exactly that range before its total can be trusted. */
    fun probeResponseTotal(code: Int, length: Long, contentRange: String?): Long? = when (code) {
        HttpURLConnection.HTTP_OK -> length.takeIf { it > 0 }
        HttpURLConnection.HTTP_PARTIAL -> {
            val match = Regex("bytes\\s+0-0/(\\d+)", RegexOption.IGNORE_CASE).matchEntire(contentRange.orEmpty().trim())
            match?.groupValues?.get(1)?.toLongOrNull()?.takeIf { it > 0 && (length == -1L || length == 1L) }
        }
        else -> null
    }

    /** Best effort: request headers for a single byte, never consume a second copy of the video. */
    fun probe(url: String, referer: String?, onOpen: (HttpURLConnection) -> Unit, onClose: (HttpURLConnection) -> Unit): Long? {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 5000; readTimeout = 5000; instanceFollowRedirects = true
            setRequestProperty("Range", "bytes=0-0")
            setRequestProperty("Accept-Encoding", "identity")
            setRequestProperty("User-Agent", USER_AGENT)
            referer?.let { setRequestProperty("Referer", it) }
        }
        onOpen(connection)
        return try {
            val code = connection.responseCode
            val type = connection.contentType.orEmpty()
            if (type.contains("text/html", true) || type.contains("mpegurl", true)) null
            else probeResponseTotal(code, connection.contentLengthLong, connection.getHeaderField("Content-Range"))
        } catch (_: java.io.IOException) { null }
        finally { onClose(connection); connection.disconnect() }
    }

    const val USER_AGENT = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36"
}
