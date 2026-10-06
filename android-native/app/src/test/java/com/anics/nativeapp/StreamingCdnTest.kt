package com.anics.nativeapp

import com.anics.nativeapp.player.streamingCdnCandidates
import org.junit.Assert.*
import org.junit.Test

class StreamingCdnTest {
    @Test fun mirrorsOnlyChangeTheHostAndPreserveEncodedPathAndSignedQuery() {
        val suffix = "/anime%2F1/index.m3u8?token=cdn2.ducvomes.com%2Fabc&key=x+y#fragment"
        val candidates = streamingCdnCandidates("https://cdn2.ducvomes.com$suffix")
        assertEquals("https://cdn1.ducvomes.com$suffix", candidates.first())
        assertTrue(candidates.contains("https://cdn2.ducvomes.com$suffix"))
        assertTrue(candidates.all { it.substringAfter(".com") == suffix })
        assertEquals(4, candidates.distinct().size)
    }

    @Test fun successfulMirrorIsTriedFirstForTheNextSegment() {
        val urls = streamingCdnCandidates("https://cdn5.ducvomes.com/seg.ts", "cdn3.ducvomes.com")
        assertEquals("https://cdn3.ducvomes.com/seg.ts", urls.first())
        assertTrue(urls.contains("https://cdn5.ducvomes.com/seg.ts"))
    }

    @Test fun neverRewritesOtherProvidersLocalFilesPortsOrUntrustedAuthorities() {
        listOf("http://127.0.0.1:1234/video?path=cdn2.ducvomes.com", "https://example.org/cdn2.ducvomes.com?token=x",
            "https://cdn2.ducvomes.com.evil.example/video", "https://cdn2.ducvomes.com:8443/video",
            "https://user:pass@cdn2.ducvomes.com/video", "content://video/3", "not a URI").forEach {
            assertEquals(listOf(it), streamingCdnCandidates(it))
        }
    }

    @Test fun ignoresUntrustedRememberedHostsAndHandlesUppercaseHosts() {
        val url = "HTTPS://CDN2.DUCVOMES.COM/seg.ts"
        val candidates = streamingCdnCandidates(url, "evil.example")
        assertEquals("HTTPS://cdn1.ducvomes.com/seg.ts", candidates.first())
        assertFalse(candidates.any { "evil.example" in it })
    }
}
