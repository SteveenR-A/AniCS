package com.anics.nativeapp

import androidx.media3.common.C
import androidx.media3.common.Player
import com.anics.nativeapp.player.seekPlayback
import java.lang.reflect.Proxy
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PlaybackSeekTest {
    private class Timeline(var duration: Long = 120_000, var seekable: Boolean = true, var command: Boolean = true) {
        val seeks = mutableListOf<Long>()
        // Only implement the Player contract used by seeking; fail on unexpected calls.
        val player = Proxy.newProxyInstance(Player::class.java.classLoader, arrayOf(Player::class.java)) { _, method, args ->
            when (method.name) {
                "isCommandAvailable" -> { assertEquals(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM, args!![0]); command }
                "isCurrentMediaItemSeekable" -> seekable
                "getDuration" -> duration
                "seekTo" -> { seeks.add(args!![0] as Long); null }
                else -> error("Unexpected Player call: ${method.name}")
            }
        } as Player
    }

    @Test fun jumpsInBothDirectionsAndClampsToMediaBoundsWithoutChangingPlayState() {
        val timeline = Timeline()
        listOf(40_000L, 30_000L, -10_000L, 200_000L).forEach { assertTrue(seekPlayback(timeline.player, it)) }
        assertEquals(listOf(40_000L, 30_000L, 0L, 120_000L), timeline.seeks)
    }

    @Test fun unknownDurationDoesNotTurnForwardIntoAJumpToTheBeginning() {
        val timeline = Timeline(duration = C.TIME_UNSET)
        assertFalse(seekPlayback(timeline.player, 40_000))
        timeline.duration = 0
        assertFalse(seekPlayback(timeline.player, 40_000))
        assertTrue(timeline.seeks.isEmpty())
        timeline.duration = 120_000
        assertTrue(seekPlayback(timeline.player, 40_000))
    }

    @Test fun nonSeekableMediaAndUnavailableCommandsNeverReceiveSeekRequests() {
        val timeline = Timeline(seekable = false)
        assertFalse(seekPlayback(timeline.player, 40_000))
        timeline.seekable = true; timeline.command = false
        assertFalse(seekPlayback(timeline.player, 40_000))
        assertTrue(timeline.seeks.isEmpty())
    }
}
