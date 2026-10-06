package com.anics.nativeapp.player

import android.content.pm.ActivityInfo
import androidx.annotation.OptIn
import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.PlaybackException
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.anics.nativeapp.ui.components.*
import kotlinx.coroutines.delay

@OptIn(UnstableApi::class)
@androidx.compose.runtime.Composable
fun PlayerScreen(controller: PlayerController, viewModel: PlaybackSessionViewModel, onBack: () -> Unit,
    onAutoNext: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    val playback by controller.playbackState.collectAsState()
    val session by viewModel.state.collectAsState()
    val context = LocalContext.current
    val activity = remember(context) { generateSequence(context) { (it as? android.content.ContextWrapper)?.baseContext }.filterIsInstance<android.app.Activity>().firstOrNull() }
    val landscape = LocalConfiguration.current.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
    var hud by remember { mutableStateOf(true) }
    var locked by remember { mutableStateOf(false) }
    var panel by remember { mutableStateOf<String?>(null) }
    var fit by remember { mutableIntStateOf(AspectRatioFrameLayout.RESIZE_MODE_FIT) }
    var feedback by remember { mutableStateOf<String?>(null) }
    var scrubbing by remember { mutableStateOf(false) }
    var scrub by remember { mutableFloatStateOf(0f) }
    val player = remember(controller) { controller.initializePlayer() }
    val lifecycleOwner = LocalLifecycleOwner.current
    val leave by rememberUpdatedState(onBack)
    BackHandler { if (panel != null) panel = null else leave() }
    LaunchedEffect(hud, playback.isPlaying, panel, scrubbing, session.error, playback.error, locked) {
        if (hud && playback.isPlaying && panel == null && !scrubbing && session.error == null && playback.error == null) { delay(3500); hud = false }
    }
    LaunchedEffect(feedback) { if (feedback != null) { delay(1200); feedback = null } }
    LaunchedEffect(session.notice) { if (session.notice != null) { delay(3500); viewModel.dismissNotice() } }
    LaunchedEffect(playback.ended) { if (playback.ended) { hud = true; viewModel.ended() } }
    LaunchedEffect(playback.error, playback.errorCode, session.selectedServer?.url) {
        if (playback.error != null && playback.errorCode in listOf(
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
            PlaybackException.ERROR_CODE_IO_INVALID_HTTP_CONTENT_TYPE,
            PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS)) {
            viewModel.recoverNetworkFailure(player.playWhenReady)
        }
    }
    LaunchedEffect(session.entry?.episodeUrl) {
        var ticks = 0
        while (true) { delay(250); val (position, duration) = controller.updatePosition(); if (++ticks % 40 == 0 && duration > 0 && position > 0) viewModel.saveProgress(position, duration) }
    }
    DisposableEffect(lifecycleOwner, controller) {
        val orientation = activity?.requestedOrientation
        val originalCutoutMode = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            activity?.window?.attributes?.layoutInDisplayCutoutMode
        } else null
        var resumeAfterBackground = false
        activity?.window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        activity?.window?.let { window ->
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                window.attributes.layoutInDisplayCutoutMode =
                    android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
            WindowCompat.getInsetsController(window, window.decorView).apply {
                hide(WindowInsetsCompat.Type.systemBars()); systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        }
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> { resumeAfterBackground = player.isPlaying; viewModel.saveProgress(); controller.pause() }
                Lifecycle.Event.ON_START -> if (resumeAfterBackground) { controller.play(); resumeAfterBackground = false }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            viewModel.saveProgress()
            controller.resetPlayback()
            lifecycleOwner.lifecycle.removeObserver(observer)
            activity?.window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            activity?.window?.let { window ->
                WindowCompat.getInsetsController(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P && originalCutoutMode != null) {
                    window.attributes.layoutInDisplayCutoutMode = originalCutoutMode
                }
            }
            orientation?.let { activity?.requestedOrientation = it }
        }
    }
    Box(modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(factory = { PlayerView(it).apply { this.player = player; useController = false; keepScreenOn = true } },
            update = { it.resizeMode = fit }, modifier = Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().pointerInput(locked) {
            detectTapGestures(onTap = { hud = !hud }, onDoubleTap = { offset ->
                if (!locked) when {
                    offset.x < size.width * .35f -> { controller.seekRelative(-10000); feedback = "−10 s" }
                    offset.x > size.width * .65f -> { controller.seekRelative(10000); feedback = "+10 s" }
                    else -> { controller.togglePlayPause(); hud = true }
                }
            })
        })
        if (playback.isLoading || session.isResolving) CircularProgressIndicator(Modifier.align(Alignment.Center), color = MaterialTheme.colorScheme.primary)
        feedback?.let { Surface(Modifier.align(Alignment.Center), color = Color.Black.copy(alpha = .65f), shape = CircleShape) { Text(it, color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.padding(22.dp)) } }
        AnimatedVisibility(hud && !locked, enter = fadeIn(), exit = fadeOut()) {
            PlayerHud(playback, session, landscape, scrubbing, scrub,
                onBack = { leave() }, onPanel = { panel = it }, onPlay = controller::togglePlayPause,
                onSeek = { controller.seekRelative(it) }, onPrevious = viewModel::previous, onNext = viewModel::next,
                onIntro = { controller.seekRelative(85000) }, onMute = controller::toggleMute,
                onLock = { locked = true; hud = false }, onOrientation = {
                    activity?.requestedOrientation = if (landscape) ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT else ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                }, onScrub = { scrubbing = true; scrub = it }, onScrubEnd = {
                    controller.seekTo((scrub * playback.durationMs).toLong()); scrubbing = false
                })
        }
        if (locked && hud) Surface(Modifier.align(Alignment.TopEnd).safeDrawingPadding().padding(16.dp), shape = CircleShape, color = Color.Black.copy(alpha = .65f)) {
            IconButton(onClick = { locked = false; hud = true }) { Icon(AniIcons.Unlock, "Desbloquear controles", tint = Color.White) }
        }
        val error = session.error ?: playback.error
        if (error != null && !locked && !session.isResolving) Surface(Modifier.align(Alignment.Center).padding(24.dp).widthIn(max = 460.dp), color = Color.Black.copy(alpha = .9f), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("No se pudo reproducir", color = Color.White, fontWeight = FontWeight.Bold)
                Text(error, color = Color.LightGray, style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = viewModel::retry, enabled = !session.isResolving) { Text("Reintentar") }
                    if (session.entry?.source != "local") OutlinedButton(onClick = { panel = "servers" }) { Text("Servidores") }
                }
            }
        }
        session.notice?.takeIf { error == null }?.let { notice -> Surface(Modifier.align(Alignment.TopCenter).safeDrawingPadding().padding(top = 78.dp), color = Color.Black.copy(alpha = .7f), shape = RoundedCornerShape(50)) {
            Text(notice, color = Color.White, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        } }
    }
    if (panel != null) PlayerPanel(panel!!, session, playback, onDismiss = { panel = null },
        onServer = { viewModel.selectServer(it, playback.isPlaying || playback.error != null); panel = null },
        onEpisode = { viewModel.selectEpisode(it); panel = null }, onQuality = { viewModel.selectQuality(it, playback.isPlaying); panel = null },
        onSpeed = controller::setSpeed, onAutoNext = { viewModel.setAutoNext(it); onAutoNext(it) },
        fit = fit, onFit = { fit = it })
}

@kotlin.OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PlayerHud(playback: PlaybackState, session: PlaybackSessionState, landscape: Boolean, scrubbing: Boolean = false, scrub: Float = 0f,
    onBack: () -> Unit, onPanel: (String) -> Unit, onPlay: () -> Unit, onSeek: (Long) -> Unit, onPrevious: () -> Unit, onNext: () -> Unit,
    onIntro: () -> Unit, onMute: () -> Unit, onLock: () -> Unit, onOrientation: () -> Unit, onScrub: (Float) -> Unit, onScrubEnd: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = .7f), Color.Transparent, Color.Black.copy(alpha = .8f))))) {
        Row(Modifier.fillMaxWidth().safeDrawingPadding().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            HudIcon(AniIcons.ArrowLeft, "Volver", onBack)
            Column(Modifier.weight(1f)) {
                Text(session.entry?.animeTitle ?: "Preparando reproducción…", color = Color.White, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
                Text("Episodio ${session.entry?.episodeNumber ?: 1} · ${if (session.entry?.source == "local") "Sin conexión" else session.selectedServer?.name ?: "Buscando servidor"}", color = Color.LightGray, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (session.entry?.source != "local") HudIcon(AniIcons.Server, "Cambiar servidor", { onPanel("servers") })
            HudIcon(AniIcons.ListVideo, "Seleccionar episodio", { onPanel("episodes") })
            HudIcon(AniIcons.Settings, "Opciones de reproducción", { onPanel("settings") })
        }
        if (!playback.isLoading && !session.isResolving) Row(Modifier.align(Alignment.Center), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(28.dp)) {
            HudIcon(AniIcons.RotateCcw, "Retroceder 10 segundos", { onSeek(-10000) }, size = 48)
            Surface(onClick = onPlay, shape = CircleShape, color = Color.Black.copy(alpha = .35f), modifier = Modifier.size(68.dp)) {
                Box(contentAlignment = Alignment.Center) { Icon(if (playback.isPlaying) AniIcons.Pause else AniIcons.Play, if (playback.isPlaying) "Pausar video" else "Reproducir video", tint = Color.White, modifier = Modifier.size(34.dp)) }
            }
            HudIcon(AniIcons.RotateCw, "Avanzar 10 segundos", { onSeek(10000) }, size = 48)
        }
        val insets = WindowInsets.safeDrawing.asPaddingValues()
        val sideInset = maxOf(
            insets.calculateStartPadding(androidx.compose.ui.unit.LayoutDirection.Ltr),
            insets.calculateEndPadding(androidx.compose.ui.unit.LayoutDirection.Ltr)
        )
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
                .padding(bottom = 8.dp)
        ) {
            val duration = playback.durationMs.coerceAtLeast(1)
            val fraction = if (scrubbing) scrub else (playback.currentPositionMs.toFloat() / duration).coerceIn(0f, 1f)
            val bufferedFraction = (playback.bufferedPositionMs.toFloat() / duration).coerceIn(0f, 1f)
            VideoProgressBar(
                fraction = fraction,
                durationMs = playback.durationMs,
                bufferedFraction = bufferedFraction,
                enabled = playback.durationMs > 0 && !session.isResolving,
                isScrubbing = scrubbing,
                onScrub = onScrub,
                onScrubEnd = onScrubEnd,
                modifier = Modifier.fillMaxWidth()
            )
            if (!landscape) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(formatTime((fraction * duration).toLong()), color = Color.White, fontSize = 12.sp)
                    Text(formatTime(playback.durationMs), color = Color.LightGray, fontSize = 12.sp)
                }
            }
            val wide = landscape && LocalConfiguration.current.screenWidthDp >= 700
            val controlSidePadding = if (landscape) maxOf(sideInset, 20.dp) else 16.dp
            FlowRow(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = controlSidePadding),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                HudIcon(AniIcons.SkipBack, "Episodio anterior", onPrevious, enabled = session.previous != null && !session.isResolving)
                HudIcon(if (playback.isPlaying) AniIcons.Pause else AniIcons.Play, if (playback.isPlaying) "Pausar" else "Reproducir", onPlay)
                HudIcon(AniIcons.SkipForward, "Siguiente episodio", onNext, enabled = session.next != null && !session.isResolving)
                if (landscape) Text("${formatTime((fraction * duration).toLong())} / ${formatTime(playback.durationMs)}", color = Color.White, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 10.dp))
                if (wide) Spacer(Modifier.weight(1f))
                HudPill("Intro +85 s", onIntro)
                HudPill("${playback.speed}x", { onPanel("settings") })
                HudIcon(if (playback.muted) AniIcons.VolumeX else AniIcons.Volume2, "Silenciar / activar audio", onMute)
                HudIcon(AniIcons.Lock, "Bloquear controles", onLock)
                HudIcon(if (landscape) AniIcons.Smartphone else AniIcons.Maximize, if (landscape) "Modo vertical" else "Pantalla horizontal", onOrientation)
            }
        }
    }
}

@Composable
private fun HudIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit, enabled: Boolean = true, size: Int = 42) {
    IconButton(onClick, enabled = enabled, modifier = Modifier.size(size.dp)) { Icon(icon, label, tint = Color.White.copy(alpha = if (enabled) 1f else .3f), modifier = Modifier.size(22.dp)) }
}
@Composable
private fun HudPill(label: String, onClick: () -> Unit) {
    Surface(onClick, color = Color.White.copy(alpha = .12f), shape = RoundedCornerShape(50), border = BorderStroke(1.dp, Color.White.copy(alpha = .15f))) {
        Text(label, color = Color.White, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
    }
}

@Composable
fun VideoProgressBar(
    fraction: Float,
    durationMs: Long,
    bufferedFraction: Float = 0f,
    enabled: Boolean = true,
    isScrubbing: Boolean = false,
    onScrub: (Float) -> Unit,
    onScrubEnd: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isDragging by remember { mutableStateOf(false) }
    val dragging = isScrubbing || isDragging
    val trackHeight = if (dragging) 5.dp else 3.5.dp
    val thumbRadius = if (dragging) 7.5.dp else 5.5.dp

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(30.dp)
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    down.consume()
                    isDragging = true
                    val width = size.width.toFloat().coerceAtLeast(1f)
                    val startFraction = (down.position.x / width).coerceIn(0f, 1f)
                    onScrub(startFraction)

                    try {
                        val pointerId = down.id
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == pointerId } ?: break
                            if (change.changedToUp()) {
                                change.consume()
                                break
                            }
                            change.consume()
                            val currentFraction = (change.position.x / width).coerceIn(0f, 1f)
                            onScrub(currentFraction)
                        }
                    } finally {
                        isDragging = false
                        onScrubEnd()
                    }
                }
            },
        contentAlignment = Alignment.CenterStart
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val canvasWidth = size.width
            val canvasHeight = size.height
            val centerY = canvasHeight / 2f
            val trackH = trackHeight.toPx()
            val thumbR = thumbRadius.toPx()

            // 1. Inactive background track: spans from 0 to full width
            drawRect(
                color = Color.White.copy(alpha = 0.22f),
                topLeft = Offset(0f, centerY - trackH / 2f),
                size = Size(canvasWidth, trackH)
            )

            // 2. Buffered track (if any)
            if (bufferedFraction > 0f) {
                val bufferedWidth = canvasWidth * bufferedFraction.coerceIn(0f, 1f)
                drawRect(
                    color = Color.White.copy(alpha = 0.40f),
                    topLeft = Offset(0f, centerY - trackH / 2f),
                    size = Size(bufferedWidth, trackH)
                )
            }

            // 3. Active played track
            val activeWidth = canvasWidth * fraction.coerceIn(0f, 1f)
            drawRect(
                color = Color.White,
                topLeft = Offset(0f, centerY - trackH / 2f),
                size = Size(activeWidth, trackH)
            )

            // 4. Scrubber Thumb
            if (durationMs > 0) {
                val thumbX = activeWidth.coerceIn(thumbR, canvasWidth - thumbR)
                if (dragging) {
                    drawCircle(
                        color = Color.White.copy(alpha = 0.35f),
                        radius = thumbR + 4.dp.toPx(),
                        center = Offset(thumbX, centerY)
                    )
                }
                drawCircle(
                    color = Color.White,
                    radius = thumbR,
                    center = Offset(thumbX, centerY)
                )
            }
        }
    }
}

@kotlin.OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun PlayerPanel(panel: String, session: PlaybackSessionState, playback: PlaybackState, onDismiss: () -> Unit,
    onServer: (com.anics.nativeapp.ffi.NativeVideoServer) -> Unit, onEpisode: (com.anics.nativeapp.ffi.NativeEpisode) -> Unit,
    onQuality: (String) -> Unit, onSpeed: (Float) -> Unit, onAutoNext: (Boolean) -> Unit, fit: Int, onFit: (Int) -> Unit) {
    var unsupported by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    LaunchedEffect(panel, session.entry?.episodeNumber) {
        if (panel == "episodes") {
            val index = session.episodes.indexOfFirst { it.number.toInt() == session.entry?.episodeNumber }
            if (index >= 0) listState.scrollToItem(index)
        }
    }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetMaxWidth = 520.dp, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        // Bound the whole sheet content, including its heading and bottom inset.
        // Bounding only the list allows its last rows to extend below a landscape window.
        Column(Modifier.fillMaxWidth().heightIn(max = (LocalConfiguration.current.screenHeightDp * .8f).dp).navigationBarsPadding()) {
            Text(when(panel) { "servers" -> "Cambiar servidor"; "episodes" -> "Episodios"; else -> "Reproducción" }, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 14.dp))
            LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false).testTag("player-panel-list"), state = listState, contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                when(panel) {
                    "servers" -> {
                        if (session.servers.isEmpty()) item { Text("No hay servidores disponibles. Vuelve a cargar el episodio.") }
                        item { Row(verticalAlignment = Alignment.CenterVertically) { Text("Mostrar no compatibles", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall); Switch(unsupported, { unsupported = it }) } }
                        items(com.anics.nativeapp.downloads.ServerSupport.ordered(session.servers).filter { unsupported || com.anics.nativeapp.downloads.ServerSupport.playable(it) }, key = { it.name + it.url }) { server ->
                            val supported = com.anics.nativeapp.downloads.ServerSupport.playable(server)
                            Surface(onClick = { onServer(server) }, enabled = supported, color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(12.dp)) {
                                Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) { Text(server.name, color = if (supported) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant); Text(if (supported) "Compatible" else "No compatible en esta versión", style = MaterialTheme.typography.labelSmall) }
                                    if (server == session.selectedServer) Icon(AniIcons.Check, "Servidor activo", Modifier.size(18.dp))
                                }
                            }
                        }
                    }
                    "episodes" -> {
                        items(session.episodes, key = { it.url }) { episode ->
                            AniPill("Episodio ${episode.number}" + (episode.title?.let { " · $it" } ?: ""), episode.number.toInt() == session.entry?.episodeNumber, { onEpisode(episode) }, Modifier.fillMaxWidth(), if (episode.watched) AniIcons.CheckCheck else AniIcons.Play)
                        }
                    }
                    else -> {
                        item { Text("Velocidad", fontWeight = FontWeight.SemiBold); FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { listOf(.5f,.75f,1f,1.25f,1.5f,2f).forEach { speed -> AniPill("${speed}x", playback.speed == speed, { onSpeed(speed) }) } } }
                        if (session.media?.qualities?.isNotEmpty() == true || playback.availableQualities.size > 1) item {
                            Text("Calidad", fontWeight = FontWeight.SemiBold)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                AniPill("Automática", session.quality == "auto", { onQuality("auto") })
                                (session.media?.qualities.orEmpty().map { it.label } + playback.availableQualities).distinct().forEach { quality -> AniPill(quality, session.quality == quality, { onQuality(quality) }) }
                            }
                        }
                        item { Text("Ajuste de imagen", fontWeight = FontWeight.SemiBold); FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            AniPill("Original", fit == AspectRatioFrameLayout.RESIZE_MODE_FIT, { onFit(AspectRatioFrameLayout.RESIZE_MODE_FIT) })
                            AniPill("Llenar", fit == AspectRatioFrameLayout.RESIZE_MODE_ZOOM, { onFit(AspectRatioFrameLayout.RESIZE_MODE_ZOOM) })
                            AniPill("Estirar", fit == AspectRatioFrameLayout.RESIZE_MODE_FILL, { onFit(AspectRatioFrameLayout.RESIZE_MODE_FILL) })
                        } }
                        item { com.anics.nativeapp.ui.screens.SettingSwitch("Siguiente episodio automático", "Al terminar el capítulo actual", session.autoNext, onAutoNext) }
                        item { Text("Un toque muestra los controles. Doble toque al centro pausa; a los lados salta 10 segundos.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
            }
        }
    }
}

fun formatTime(millis: Long): String {
    val seconds = millis.coerceAtLeast(0) / 1000
    return if (seconds >= 3600) String.format(java.util.Locale.ROOT, "%d:%02d:%02d", seconds/3600, seconds/60%60, seconds%60)
    else String.format(java.util.Locale.ROOT, "%02d:%02d", seconds/60, seconds%60)
}
