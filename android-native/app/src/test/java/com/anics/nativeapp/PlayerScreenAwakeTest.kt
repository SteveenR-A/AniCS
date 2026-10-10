package com.anics.nativeapp

import android.view.View
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.anics.nativeapp.player.PlaybackState
import com.anics.nativeapp.player.PlayerScreenAwake
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PlayerScreenAwakeTest {
    @get:Rule val compose = createComposeRule()

    @Test fun pausingDuringPlaybackOrBufferingAllowsScreenTimeout() {
        val playing = PlaybackState(isPlaying = true, isLoading = false, playWhenReady = true)
        assertTrue(playing.keepScreenOn)
        assertFalse(playing.copy(isPlaying = false, playWhenReady = false).keepScreenOn)
        val buffering = playing.copy(isPlaying = false, isLoading = true)
        assertTrue(buffering.keepScreenOn)
        assertFalse(buffering.copy(playWhenReady = false).keepScreenOn)
        assertFalse(playing.copy(ended = true).keepScreenOn)
        assertFalse(playing.copy(error = "Failed").keepScreenOn)
        assertFalse(PlaybackState().keepScreenOn)
    }

    @Test fun screenOnFollowsPauseForegroundAndDisposal() {
        val owner = object : LifecycleOwner {
            val registry = LifecycleRegistry(this)
            override val lifecycle: Lifecycle get() = registry
        }
        var enabled by mutableStateOf(true)
        var mounted by mutableStateOf(true)
        lateinit var host: View
        compose.runOnIdle { owner.registry.currentState = Lifecycle.State.STARTED }
        compose.setContent {
            host = LocalView.current
            CompositionLocalProvider(LocalLifecycleOwner provides owner) {
                if (mounted) PlayerScreenAwake(enabled)
            }
        }
        compose.runOnIdle { assertTrue(host.keepScreenOn); enabled = false }
        compose.runOnIdle { assertFalse(host.keepScreenOn); enabled = true }
        compose.runOnIdle { assertTrue(host.keepScreenOn); owner.registry.currentState = Lifecycle.State.CREATED }
        compose.runOnIdle { assertFalse(host.keepScreenOn); owner.registry.currentState = Lifecycle.State.STARTED }
        compose.runOnIdle { assertTrue(host.keepScreenOn); mounted = false }
        compose.runOnIdle { assertFalse(host.keepScreenOn) }
    }
}
