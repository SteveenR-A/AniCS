package com.anics.nativeapp

import com.anics.nativeapp.downloads.DownloadSizes
import com.anics.nativeapp.downloads.HlsPlaylists
import org.junit.Assert.*
import org.junit.Test

class DownloadSizesTest {
    @Test fun exactHttpSizeWinsOverSegmentEstimate() {
        val size = DownloadSizes.info(1024, 8192, .5f)
        assertEquals(8192L, size.total)
        assertFalse(size.estimated)
        assertEquals(.125f, size.fraction!!, .0001f)
    }

    @Test fun hlsUsesDurationWeightedProgressAndMarksTheSizeAsAnEstimate() {
        val playlist = HlsPlaylists.parse("#EXTM3U\n#EXTINF:4,\n1.ts\n#EXTINF:12,\n2.ts\n#EXT-X-ENDLIST", "https://example.test/list.m3u8")
        val size = DownloadSizes.info(1024, null, playlist.progress(1))
        assertEquals(.25f, size.fraction!!, .0001f)
        assertEquals(4096L, size.total)
        assertTrue(size.estimated)
        assertEquals(1f, playlist.progress(2), .0001f)
        val completed = DownloadSizes.info(3072, 3072, 1f)
        assertEquals(3072L, completed.total)
        assertFalse(completed.estimated)
    }

    @Test fun missingDurationsFallBackToSegmentCountAndUnknownFilesHaveNoFakeTotal() {
        val playlist = HlsPlaylists.parse("#EXTM3U\n1.ts\n2.ts\n#EXT-X-ENDLIST", "https://example.test/list.m3u8")
        assertEquals(.5f, playlist.progress(1), .0001f)
        listOf(0f, Float.NaN, Float.POSITIVE_INFINITY, -.5f).forEach { progress ->
            val size = DownloadSizes.info(1000, null, progress)
            assertNull(size.total); assertNull(size.fraction); assertFalse(size.estimated)
        }
        assertNull(DownloadSizes.info(0, null, .5f).total)
    }

    @Test fun acceptsOneByteRangesOrFullResponseLengthsAndRejectsInvalidMetadata() {
        assertEquals(12345L, DownloadSizes.probeResponseTotal(206, 1, "bytes 0-0/12345"))
        assertEquals(12345L, DownloadSizes.probeResponseTotal(206, -1, "bytes 0-0/12345"))
        assertEquals(12345L, DownloadSizes.probeResponseTotal(200, 12345, null))
        assertNull(DownloadSizes.probeResponseTotal(200, -1, null))
        assertNull(DownloadSizes.probeResponseTotal(206, 2, "bytes 0-0/12345"))
        assertNull(DownloadSizes.probeResponseTotal(206, 1, "bytes 1-1/12345"))
        assertNull(DownloadSizes.probeResponseTotal(206, 1, "bytes 0-0/*"))
        assertNull(DownloadSizes.probeResponseTotal(403, 12345, null))
    }
}
