package com.anics.nativeapp

import com.anics.nativeapp.downloads.LocalEpisodeNames
import com.anics.nativeapp.updates.UpdateVersions
import org.junit.Assert.*
import org.junit.Test

class NativeUpdateAndLibraryTest {
    @Test fun duplicateDonghuaCardsAreSafeForComposeAndKeepDifferentEpisodes() {
        val card = com.anics.nativeapp.ffi.NativeAnimeResult("Donghua", "https://catalog/anime", "", null, "1", null, null, null, null, null, "mundodonghua", null)
        val rows = com.anics.nativeapp.data.repository.safeCards(listOf(card, card.copy(), card.copy(episode = "2"), card.copy(url = "")))
        assertEquals(2, rows.size)
        assertEquals(listOf("1", "2"), rows.map { it.episode })
    }
    @Test fun unsupportedServersDoNotEnterAutomaticPlayback() {
        val mega = com.anics.nativeapp.ffi.NativeVideoServer("Mega", "https://mega.nz/123", true, null)
        val magi = com.anics.nativeapp.ffi.NativeVideoServer("Magi", "https://jkanime.net/jkplayer/magi", false, null)
        assertFalse(com.anics.nativeapp.downloads.ServerSupport.playable(mega))
        assertTrue(com.anics.nativeapp.downloads.ServerSupport.playable(magi))
        assertEquals(listOf(magi, mega), com.anics.nativeapp.downloads.ServerSupport.ordered(listOf(mega, magi, magi)))
    }
    @Test fun versionsCompareNumerically() {
        assertTrue(UpdateVersions.isNewer("v0.10.0", "0.3.0-preview"))
        assertFalse(UpdateVersions.isNewer("v0.3.0", "0.3.0-preview"))
        assertFalse(UpdateVersions.isNewer("v0.2.9", "0.3.0-preview"))
        assertFalse(UpdateVersions.isNewer("nonsense", "0.3.0-preview"))
    }
    @Test fun tauriFolderAndEpisodeNamesAreRecognized() {
        assertEquals("Naruto Shippuden" to 12, LocalEpisodeNames.parse("Ep012.mp4", "Naruto_Shippuden"))
        assertEquals("Solo Leveling" to 3, LocalEpisodeNames.parse("Solo_Leveling_Ep003.mp4", null))
        assertEquals("Donghua" to 21, LocalEpisodeNames.parse("Capitulo 21.mkv", "Donghua"))
        assertEquals("Película" to 1, LocalEpisodeNames.parse("Película.mp4", null))
    }
}
