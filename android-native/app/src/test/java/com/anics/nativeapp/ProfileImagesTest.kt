package com.anics.nativeapp

import android.graphics.BitmapFactory
import com.anics.nativeapp.ui.components.ProfileImages
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ProfileImagesTest {
    @Test fun presetsExportAsRealPngAndDataAvatarsRoundTrip() {
        val first = ProfileImages.bytes("avatar-1")
        assertEquals(0x89.toByte(), first[0])
        assertEquals(256, BitmapFactory.decodeByteArray(first, 0, first.size).width)
        assertFalse(first.contentEquals(ProfileImages.bytes("avatar-2")))
        val encoded = "data:image/png;base64," + android.util.Base64.encodeToString(first, android.util.Base64.NO_WRAP)
        assertArrayEquals(first, ProfileImages.bytes(encoded))
    }
}
