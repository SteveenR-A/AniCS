package com.anics.nativeapp.player

import androidx.annotation.OptIn
import androidx.activity.compose.BackHandler
import kotlinx.coroutines.delay
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    title: String,
    episodeText: String,
    controller: PlayerController,
    onBack: () -> Unit,
    onProgress: (Long, Long) -> Unit = { _, _ -> },
    onEnded: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val playbackState by controller.playbackState.collectAsState()
    var showHud by remember { mutableStateOf(true) }

    val exoPlayer = remember { controller.initializePlayer() }

    val progressCallback by rememberUpdatedState(onProgress)
    val lifecycleOwner = LocalLifecycleOwner.current
    BackHandler(onBack = onBack)
    LaunchedEffect(playbackState.ended) { if (playbackState.ended) onEnded() }
    LaunchedEffect(title, episodeText) {
        var ticks = 0
        while (true) {
            val (position, duration) = controller.updatePosition()
            if (++ticks % 40 == 0 && duration > 0) progressCallback(position, duration)
            delay(250)
        }
    }
    DisposableEffect(lifecycleOwner, controller) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) {
                val (position, duration) = controller.updatePosition()
                if (duration > 0) progressCallback(position, duration)
                controller.pause()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            val (position, duration) = controller.updatePosition()
            if (duration > 0) progressCallback(position, duration)
            lifecycleOwner.lifecycle.removeObserver(observer)
            controller.resetPlayback()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = {
                        // 1 solo toque alterna el HUD sin pausar
                        showHud = !showHud
                    },
                    onDoubleTap = { offset ->
                        val width = size.width
                        when {
                            offset.x < width * 0.35f -> {
                                // Doble toque lateral izquierdo: retroceder 10s
                                controller.seekRelative(-10_000L)
                            }
                            offset.x > width * 0.65f -> {
                                // Doble toque lateral derecho: avanzar 10s
                                controller.seekRelative(10_000L)
                            }
                            else -> {
                                // Doble toque en el centro: Play/Pausa
                                controller.togglePlayPause()
                            }
                        }
                    }
                )
            }
    ) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = exoPlayer
                    useController = false
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        if (playbackState.isLoading) {
            CircularProgressIndicator(
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.align(Alignment.Center)
            )
        }

        playbackState.error?.let { Text(it, color = Color.White, modifier = Modifier.align(Alignment.Center).padding(24.dp)) }

        // HUD Controls Overlay
        AnimatedVisibility(
            visible = showHud,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.45f))
            ) {
                // Top Bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Volver",
                            tint = Color.White
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = title,
                            color = Color.White,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1
                        )
                        Text(
                            text = episodeText,
                            color = Color.LightGray,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }

                // Center Play/Pause button
                IconButton(
                    onClick = { controller.togglePlayPause() },
                    modifier = Modifier
                        .size(64.dp)
                        .align(Alignment.Center)
                ) {
                    Icon(
                        imageVector = if (playbackState.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = if (playbackState.isPlaying) "Pausar" else "Reproducir",
                        tint = Color.White,
                        modifier = Modifier.size(48.dp)
                    )
                }

                // Bottom Bar: Progress & Timers
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .padding(16.dp)
                ) {
                    val duration = playbackState.durationMs.coerceAtLeast(1L)
                    val current = playbackState.currentPositionMs.coerceIn(0L, duration)
                    val progressFraction = (current.toFloat() / duration.toFloat()).coerceIn(0f, 1f)

                    Slider(
                        value = progressFraction,
                        onValueChange = { fraction ->
                            controller.seekTo((fraction * duration).toLong())
                        },
                        colors = SliderDefaults.colors(
                            thumbColor = MaterialTheme.colorScheme.primary,
                            activeTrackColor = MaterialTheme.colorScheme.primary,
                            inactiveTrackColor = Color.DarkGray
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = formatTime(current),
                            color = Color.White,
                            fontSize = 12.sp
                        )
                        Text(
                            text = formatTime(duration),
                            color = Color.LightGray,
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }
    }
}

private fun formatTime(millis: Long): String {
    val totalSeconds = (millis / 1000).coerceAtLeast(0)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format("%02d:%02d", minutes, seconds)
}
