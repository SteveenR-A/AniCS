package com.anics.nativeapp.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PlaybackState(
    val isPlaying: Boolean = false,
    val isLoading: Boolean = true,
    val currentPositionMs: Long = 0L,
    val durationMs: Long = 0L,
    val error: String? = null,
    val ended: Boolean = false
)

@OptIn(UnstableApi::class)
class PlayerController(private val context: Context) {

    private var exoPlayer: ExoPlayer? = null
    private var pendingResumeFraction: Double? = null

    private val _playbackState = MutableStateFlow(PlaybackState())
    val playbackState: StateFlow<PlaybackState> = _playbackState.asStateFlow()

    fun initializePlayer(): ExoPlayer {
        if (exoPlayer == null) {
            exoPlayer = ExoPlayer.Builder(context).build().apply {
                playWhenReady = true
                addListener(object : Player.Listener {
                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        _playbackState.value = _playbackState.value.copy(isPlaying = isPlaying)
                    }

                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_READY && duration > 0) {
                            pendingResumeFraction?.let { seekTo((duration * it).toLong()) }
                            pendingResumeFraction = null
                        }
                        val isLoading = playbackState == Player.STATE_BUFFERING
                        _playbackState.value = _playbackState.value.copy(
                            isLoading = isLoading,
                            ended = playbackState == Player.STATE_ENDED,
                            durationMs = duration.coerceAtLeast(0L),
                            currentPositionMs = currentPosition.coerceAtLeast(0L)
                        )
                    }

                    override fun onPlayerError(error: PlaybackException) {
                        _playbackState.value = _playbackState.value.copy(
                            isLoading = false,
                            isPlaying = false,
                            error = error.localizedMessage ?: "Error de reproducción"
                        )
                    }
                })
            }
        }
        return exoPlayer!!
    }

    fun prepareStream(
        directUrl: String,
        isHls: Boolean,
        referer: String? = null,
        userAgent: String? = null,
        startPositionMs: Long = 0L,
        resumeFraction: Double? = null
    ) {
        resetPlayback()
        pendingResumeFraction = resumeFraction?.takeIf { it > 0 && it < 0.9 }
        val player = initializePlayer()

        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(20000)

        referer?.let { httpDataSourceFactory.setDefaultRequestProperties(mapOf("Referer" to it)) }
        userAgent?.let { httpDataSourceFactory.setUserAgent(it) }

        val mediaItem = MediaItem.fromUri(directUrl)
        val mediaSource: MediaSource = if (isHls || directUrl.contains(".m3u8")) {
            HlsMediaSource.Factory(httpDataSourceFactory).createMediaSource(mediaItem)
        } else {
            ProgressiveMediaSource.Factory(httpDataSourceFactory).createMediaSource(mediaItem)
        }

        player.setMediaSource(mediaSource)
        if (startPositionMs > 0L) {
            player.seekTo(startPositionMs)
        }
        player.prepare()
        player.play()
    }

    fun updatePosition(): Pair<Long, Long> {
        val position = exoPlayer?.currentPosition?.coerceAtLeast(0) ?: 0L
        val duration = exoPlayer?.duration?.coerceAtLeast(0) ?: 0L
        _playbackState.value = _playbackState.value.copy(currentPositionMs = position, durationMs = duration)
        return position to duration
    }
    fun reportError(message: String) { _playbackState.value = _playbackState.value.copy(error = message, isLoading = false) }
    fun pause() { exoPlayer?.pause() }
    fun togglePlayPause() {
        exoPlayer?.let {
            if (it.isPlaying) it.pause() else it.play()
        }
    }

    fun seekRelative(offsetMs: Long) {
        exoPlayer?.let {
            val target = (it.currentPosition + offsetMs).coerceIn(0L, it.duration.coerceAtLeast(0L))
            it.seekTo(target)
            _playbackState.value = _playbackState.value.copy(currentPositionMs = target)
        }
    }

    fun seekTo(positionMs: Long) {
        exoPlayer?.let {
            it.seekTo(positionMs)
            _playbackState.value = _playbackState.value.copy(currentPositionMs = positionMs)
        }
    }

    fun resetPlayback() {
        pendingResumeFraction = null
        exoPlayer?.stop()
        exoPlayer?.clearMediaItems()
        _playbackState.value = PlaybackState()
    }

    fun release() {
        exoPlayer?.release()
        exoPlayer = null
        _playbackState.value = PlaybackState()
    }
}
