package com.anics.nativeapp

import com.anics.nativeapp.downloads.LocalEpisodeNames
import com.anics.nativeapp.updates.UpdateVersions
import org.junit.Assert.*
import org.junit.Test

class NativeUpdateAndLibraryTest {
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
