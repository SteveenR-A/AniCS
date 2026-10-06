package com.anics.nativeapp.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.SeekParameters
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
    val bufferedPositionMs: Long = 0L,
    val error: String? = null,
    val speed: Float = 1f,
    val muted: Boolean = false,
    val ended: Boolean = false,
    val availableQualities: List<String> = emptyList()
)

@OptIn(UnstableApi::class)
class PlayerController(private val context: Context) : PlaybackEngine {

    private var exoPlayer: ExoPlayer? = null
    private var pendingResumeFraction: Double? = null

    private val _playbackState = MutableStateFlow(PlaybackState())
    val playbackState: StateFlow<PlaybackState> = _playbackState.asStateFlow()

    fun initializePlayer(): ExoPlayer {
        if (exoPlayer == null) {
            exoPlayer = ExoPlayer.Builder(context).build().apply {
                // Start at a decodable sync frame instead of decoding/discarding a long GOP.
                setSeekParameters(SeekParameters.CLOSEST_SYNC)
                playWhenReady = true
                addListener(object : Player.Listener {
                    override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {
                        val heights = tracks.groups.filter { it.type == androidx.media3.common.C.TRACK_TYPE_VIDEO }.flatMap { group ->
                            (0 until group.length).filter { group.isTrackSupported(it) }.map { group.getTrackFormat(it).height }
                        }.filter { it > 0 }.distinct().sortedDescending().map { "${it}p" }
                        _playbackState.value = _playbackState.value.copy(availableQualities = heights)
                    }
                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        _playbackState.value = _playbackState.value.copy(isPlaying = isPlaying)
                    }

                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_READY && duration > 0) {
                            pendingResumeFraction?.let { fraction -> pendingResumeFraction = null; seekTo((duration * fraction).toLong()) }
                        }
                        val isLoading = playbackState == Player.STATE_BUFFERING
                        _playbackState.value = _playbackState.value.copy(
                            isLoading = isLoading,
                            ended = playbackState == Player.STATE_ENDED,
                            durationMs = duration.coerceAtLeast(0L),
                            currentPositionMs = currentPosition.coerceAtLeast(0L),
                            bufferedPositionMs = bufferedPosition.coerceAtLeast(0L)
                        )
                    }

                    override fun onTimelineChanged(timeline: androidx.media3.common.Timeline, reason: Int) {
                        if (duration > 0) pendingResumeFraction?.let { fraction ->
                            pendingResumeFraction = null
                            seekTo((duration * fraction).toLong())
                        }
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

    override fun prepareStream(
        directUrl: String,
        isHls: Boolean,
        referer: String?,
        userAgent: String?,
        startPositionMs: Long,
        resumeFraction: Double?,
        autoPlay: Boolean
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
            HlsMediaSource.Factory(httpDataSourceFactory)
                .setExtractorFactory(playbackHlsExtractorsFactory()).createMediaSource(mediaItem)
        } else {
            ProgressiveMediaSource.Factory(httpDataSourceFactory, playbackExtractorsFactory())
                .createMediaSource(mediaItem)
        }

        player.setMediaSource(mediaSource)
        if (startPositionMs > 0L) {
            player.seekTo(startPositionMs)
        }
        player.prepare()
        player.playWhenReady = autoPlay
    }

    override fun updatePosition(): Pair<Long, Long> {
        val position = exoPlayer?.currentPosition?.coerceAtLeast(0) ?: 0L
        val duration = exoPlayer?.duration?.coerceAtLeast(0) ?: 0L
        val buffered = exoPlayer?.bufferedPosition?.coerceAtLeast(0) ?: 0L
        _playbackState.value = _playbackState.value.copy(currentPositionMs = position, durationMs = duration, bufferedPositionMs = buffered)
        return position to duration
    }
    fun reportError(message: String) { _playbackState.value = _playbackState.value.copy(error = message, isLoading = false) }
    fun pause() { exoPlayer?.pause() }
    fun play() { exoPlayer?.play() }
    fun setSpeed(speed: Float) { exoPlayer?.setPlaybackSpeed(speed); _playbackState.value = _playbackState.value.copy(speed = speed) }
    override fun setQuality(quality: String) {
        val player = exoPlayer ?: return
        val height = quality.removeSuffix("p").toIntOrNull()
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon().clearVideoSizeConstraints()
            .apply { if (height != null) setMaxVideoSize(Int.MAX_VALUE, height) }.build()
    }
    fun toggleMute() { exoPlayer?.let { it.volume = if (it.volume == 0f) 1f else 0f; _playbackState.value = _playbackState.value.copy(muted = it.volume == 0f) } }
    fun togglePlayPause() {
        exoPlayer?.let {
            if (it.isPlaying) it.pause() else it.play()
        }
    }

    fun seekRelative(offsetMs: Long) {
        exoPlayer?.let { seekTo(it.currentPosition + offsetMs) }
    }

    fun seekTo(positionMs: Long) {
        exoPlayer?.let { player ->
            if (seekPlayback(player, positionMs)) {
                // Media3 may adjust the request to a nearby keyframe; use its actual position.
                updatePosition()
            }
        }
    }

    override fun resetPlayback() {
        pendingResumeFraction = null
        exoPlayer?.stop()
        exoPlayer?.clearMediaItems()
        _playbackState.value = PlaybackState(speed = exoPlayer?.playbackParameters?.speed ?: 1f, muted = exoPlayer?.volume == 0f)
    }

    fun release() {
        exoPlayer?.release()
        exoPlayer = null
        _playbackState.value = PlaybackState()
    }
}
