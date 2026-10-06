package com.anics.nativeapp.player

import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.TransferListener
import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException

/** Per-stream mirror memory. HLS manifests, keys and segments all use this factory. */
@OptIn(UnstableApi::class)
internal class StreamingDataSourceFactory(private val upstream: DataSource.Factory) : DataSource.Factory {
    @Volatile private var rememberedHost: String? = null

    override fun createDataSource(): DataSource = object : DataSource {
        private val listeners = mutableListOf<TransferListener>()
        @Volatile private var source: DataSource? = null
        @Volatile private var closed = false
        private var mirrorUrl: String? = null

        override fun addTransferListener(transferListener: TransferListener) {
            listeners.add(transferListener)
            source?.addTransferListener(transferListener)
        }

        override fun open(dataSpec: DataSpec): Long {
            closed = false
            mirrorUrl = null
            val candidates = if (dataSpec.httpMethod == DataSpec.HTTP_METHOD_GET)
                streamingCdnCandidates(dataSpec.uri.toString(), rememberedHost) else listOf(dataSpec.uri.toString())
            var lastError: IOException? = null
            for (url in candidates) {
                if (closed || Thread.currentThread().isInterrupted) throw InterruptedIOException("Carga cancelada")
                val next = upstream.createDataSource()
                source = next
                listeners.forEach(next::addTransferListener)
                try {
                    // Retain byte range, headers (Referer/UA), flags and cache key on every attempt.
                    val length = next.open(dataSpec.buildUpon().setUri(url).build())
                    if (closed) throw InterruptedIOException("Carga cancelada")
                    if (candidates.size > 1) {
                        rememberedHost = Uri.parse(url).host
                        mirrorUrl = url
                    }
                    return length
                } catch (error: IOException) {
                    runCatching { next.close() }
                    source = null
                    val status = (error as? HttpDataSource.InvalidResponseCodeException)?.responseCode
                    if (closed || Thread.currentThread().isInterrupted ||
                        (error is InterruptedIOException && error !is SocketTimeoutException) ||
                        (status != null && status !in listOf(403, 404, 408, 410, 429, 500, 502, 503, 504))) throw error
                    lastError = error
                }
            }
            throw lastError ?: IOException("No se pudo abrir el video")
        }

        override fun read(buffer: ByteArray, offset: Int, length: Int): Int = try {
            (source ?: throw IOException("La fuente no está abierta")).read(buffer, offset, length)
        } catch (error: IOException) {
            // Let Media3 reopen at its last consumed byte; do not splice bodies inside read().
            if (!closed && !Thread.currentThread().isInterrupted) mirrorUrl?.let { url ->
                val failedHost = Uri.parse(url).host
                rememberedHost = streamingCdnCandidates(url).map { Uri.parse(it).host }.firstOrNull { it != failedHost }
            }
            throw error
        }

        override fun getUri(): Uri? = source?.uri
        override fun getResponseHeaders(): Map<String, List<String>> = source?.responseHeaders ?: emptyMap()
        override fun close() { closed = true; try { source?.close() } finally { source = null } }
    }
}
