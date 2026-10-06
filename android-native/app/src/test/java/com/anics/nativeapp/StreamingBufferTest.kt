package com.anics.nativeapp

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Timeline
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.LoadControl
import androidx.media3.exoplayer.analytics.PlayerId
import androidx.media3.exoplayer.source.MediaSource.MediaPeriodId
import com.anics.nativeapp.player.streamingLoadControl
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(UnstableApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StreamingBufferTest {
    private fun params(seconds: Float, rebuffering: Boolean = false) = LoadControl.Parameters(
        PlayerId.UNSET, Timeline.EMPTY, MediaPeriodId("episode"), 0, (seconds * 1_000_000).toLong(),
        1f, true, rebuffering, C.TIME_UNSET)

    @Test fun refillBuildsAReserveRatherThanRestartingWithOnlyFiveSecondsAfterAStall() {
        val control = streamingLoadControl()
        control.onPrepared(PlayerId.UNSET)
        try {
            assertFalse(control.shouldStartPlayback(params(2.5f)))
            assertTrue(control.shouldStartPlayback(params(4f)))
            assertFalse(control.shouldStartPlayback(params(5f, rebuffering = true)))
            assertTrue(control.shouldStartPlayback(params(10f, rebuffering = true)))
            assertTrue(control.shouldContinueLoading(params(55f)))
            assertTrue(control.shouldContinueLoading(params(90f)))
            assertFalse(control.shouldContinueLoading(params(120f)))
            assertFalse(control.shouldContinueLoading(params(90f)))
            assertTrue(control.shouldContinueLoading(params(59f)))
            assertEquals(15_000_000L, control.getBackBufferDurationUs(PlayerId.UNSET))
            assertTrue(control.retainBackBufferFromKeyframe(PlayerId.UNSET))
        } finally { control.onReleased(PlayerId.UNSET) }
    }

    @Test fun reachingTheByteTargetStopsLoadingAndDoesNotDeadlockWaitingForMoreSeconds() {
        val control = streamingLoadControl()
        control.onPrepared(PlayerId.UNSET)
        val allocator = control.allocator
        val allocations = List(64 * 1024 * 1024 / allocator.individualAllocationLength) { allocator.allocate() }
        try {
            assertFalse(control.shouldContinueLoading(params(2f)))
            assertTrue(control.shouldStartPlayback(params(2f, rebuffering = true)))
        } finally {
            allocations.forEach(allocator::release)
            control.onReleased(PlayerId.UNSET)
        }
    }
}
