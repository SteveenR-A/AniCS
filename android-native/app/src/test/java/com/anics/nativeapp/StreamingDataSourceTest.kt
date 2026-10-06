package com.anics.nativeapp

import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.*
import com.anics.nativeapp.player.StreamingDataSourceFactory
import java.io.IOException
import java.io.InterruptedIOException
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(UnstableApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StreamingDataSourceTest {
    private class Upstream(val failure: (DataSpec) -> IOException?, val readFailure: (DataSpec) -> IOException? = { null }) : DataSource.Factory {
        val opened = mutableListOf<DataSpec>()
        val closed = mutableListOf<String>()
        var listenerAttachments = 0
        override fun createDataSource() = object : DataSource {
            private var spec: DataSpec? = null
            override fun addTransferListener(listener: TransferListener) { listenerAttachments++ }
            override fun open(dataSpec: DataSpec): Long {
                spec = dataSpec; opened.add(dataSpec)
                failure(dataSpec)?.let { throw it }
                return 5
            }
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                readFailure(spec!!)?.let { throw it }
                if (length == 0) return 0
                buffer[offset] = 7; return 1
            }
            override fun getUri() = spec?.uri
            override fun getResponseHeaders() = mapOf("Content-Type" to listOf("video/mp2t"))
            override fun close() { closed.add(spec?.uri?.host.orEmpty()) }
        }
    }

    @Test fun failedManifestOrSegmentOpensMirrorPreservingRangeHeadersAndTransferMeasurement() {
        val upstream = Upstream({ if (it.uri.host == "cdn1.ducvomes.com") IOException("CDN unavailable") else null })
        val factory = StreamingDataSourceFactory(upstream)
        val source = factory.createDataSource()
        source.addTransferListener(object : TransferListener {
            override fun onTransferInitializing(source: DataSource, dataSpec: DataSpec, isNetwork: Boolean) {}
            override fun onTransferStart(source: DataSource, dataSpec: DataSpec, isNetwork: Boolean) {}
            override fun onBytesTransferred(source: DataSource, dataSpec: DataSpec, isNetwork: Boolean, bytesTransferred: Int) {}
            override fun onTransferEnd(source: DataSource, dataSpec: DataSpec, isNetwork: Boolean) {}
        })
        val original = DataSpec.Builder().setUri("https://cdn1.ducvomes.com/a%2Fb/seg.ts?token=x%2Fy")
            .setPosition(188).setLength(376).setHttpRequestHeaders(mapOf("Referer" to "https://catalog.example/episode", "User-Agent" to "fixture"))
            .setKey("episode-range").setFlags(DataSpec.FLAG_ALLOW_GZIP).build()
        assertEquals(5L, source.open(original))
        assertEquals(listOf("cdn1.ducvomes.com", "cdn3.ducvomes.com"), upstream.opened.map { it.uri.host })
        assertEquals(listOf("cdn1.ducvomes.com"), upstream.closed)
        val mirrored = upstream.opened.last()
        assertEquals(original.position, mirrored.position); assertEquals(original.length, mirrored.length)
        assertEquals(original.httpRequestHeaders, mirrored.httpRequestHeaders)
        assertEquals(original.key, mirrored.key); assertEquals(original.flags, mirrored.flags)
        assertEquals("cdn3.ducvomes.com", source.uri!!.host)
        assertEquals("video/mp2t", source.responseHeaders["Content-Type"]!!.first())
        assertEquals(2, upstream.listenerAttachments)
        val buffer = ByteArray(1); assertEquals(1, source.read(buffer, 0, 1)); assertEquals(7.toByte(), buffer[0])
        source.close()
        val next = factory.createDataSource()
        next.open(DataSpec(Uri.parse("https://cdn1.ducvomes.com/next.ts")))
        assertEquals("cdn3.ducvomes.com", upstream.opened.last().uri.host)
        next.close()
    }

    @Test fun unrelatedHostDoesNotRotateAndMirrorFailureIsBounded() {
        val upstream = Upstream({ IOException("offline") })
        val source = StreamingDataSourceFactory(upstream).createDataSource()
        assertThrows(IOException::class.java) { source.open(DataSpec(Uri.parse("https://other.example/video.mp4"))) }
        assertEquals(1, upstream.opened.size); assertEquals(1, upstream.closed.size)
        upstream.opened.clear(); upstream.closed.clear()
        assertThrows(IOException::class.java) { source.open(DataSpec(Uri.parse("https://cdn1.ducvomes.com/video.ts"))) }
        assertEquals(4, upstream.opened.size); assertEquals(4, upstream.closed.size)
    }

    @Test fun cancellationDoesNotTryAnotherMirror() {
        val upstream = Upstream({ InterruptedIOException("cancelled") })
        val source = StreamingDataSourceFactory(upstream).createDataSource()
        assertThrows(InterruptedIOException::class.java) { source.open(DataSpec(Uri.parse("https://cdn1.ducvomes.com/video.ts"))) }
        assertEquals(1, upstream.opened.size)
    }

    @Test fun stalledBodyUsesAnotherMirrorWhenMedia3ReopensAtItsConsumedBytePosition() {
        val upstream = Upstream({ null }, { if (it.uri.host == "cdn1.ducvomes.com") IOException("body stalled") else null })
        val source = StreamingDataSourceFactory(upstream).createDataSource()
        val original = DataSpec.Builder().setUri("https://cdn1.ducvomes.com/video.ts").setPosition(188).build()
        source.open(original)
        assertThrows(IOException::class.java) { source.read(ByteArray(1), 0, 1) }
        source.close()
        val resumed = original.subrange(376)
        source.open(resumed)
        assertEquals("cdn3.ducvomes.com", source.uri!!.host)
        assertEquals(564L, upstream.opened.last().position)
        assertEquals(1, source.read(ByteArray(1), 0, 1))
        source.close()
    }
}
