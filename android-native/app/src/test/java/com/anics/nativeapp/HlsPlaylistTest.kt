package com.anics.nativeapp

import com.anics.nativeapp.downloads.HlsPlaylists
import org.junit.Assert.*
import org.junit.Test

class HlsPlaylistTest {
    @Test fun resolvesRelativeSegmentsAndSequenceIv() {
        val playlist = HlsPlaylists.parse("""
            #EXTM3U
            #EXT-X-MEDIA-SEQUENCE:9
            #EXT-X-KEY:METHOD=AES-128,URI="../key"
            #EXTINF:6,
            one.ts
            #EXT-X-KEY:METHOD=NONE
            #EXTINF:6,
            two.ts?token=abc
            #EXT-X-ENDLIST
        """.trimIndent(), "https://example.com/video/list.m3u8")
        assertEquals("https://example.com/key", playlist.segments[0].keyUrl)
        assertEquals(9.toByte(), playlist.segments[0].iv!!.last())
        assertNull(playlist.segments[1].keyUrl)
        assertEquals("https://example.com/video/two.ts?token=abc", playlist.segments[1].url)
    }
    @Test fun choosesHighestBandwidthVariant() {
        val text = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200\nhigh.m3u8"
        assertEquals("https://example.com/high.m3u8", HlsPlaylists.variant(text, "https://example.com/master.m3u8"))
    }
    @Test fun fragmentedMp4IncludesInitialization() {
        val playlist = HlsPlaylists.parse("#EXTM3U\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:4,\n1.m4s\n#EXT-X-ENDLIST", "https://example.com/list.m3u8")
        assertEquals("https://example.com/init.mp4", playlist.initialization)
    }
    @Test fun rejectsLiveDrmAndRanges() {
        listOf("#EXTM3U\n1.ts", "#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI=\"key\"\n1.ts\n#EXT-X-ENDLIST", "#EXTM3U\n#EXT-X-BYTERANGE:4@0\n1.ts\n#EXT-X-ENDLIST").forEach { text ->
            assertThrows(IllegalArgumentException::class.java) { HlsPlaylists.parse(text, "https://example.com/list.m3u8") }
        }
    }
}
