package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anics.nativeapp.ffi.*
import com.anics.nativeapp.ui.components.*
import com.anics.nativeapp.ui.viewmodels.DetailsViewModel

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DetailsScreen(url: String, source: String, viewModel: DetailsViewModel, onBack: () -> Unit,
    onPlayEpisode: (NativeResolvedMedia, String, Int) -> Unit,
    onDownloadEpisode: (NativeResolvedMedia, String, Int) -> Unit = { _, _, _ -> },
    onDownloadEpisodes: (List<NativeEpisode>) -> Unit = {}, modifier: Modifier = Modifier,
    downloads: List<com.anics.nativeapp.data.local.DownloadEntity> = emptyList(), onResumeDownload: (String) -> Unit = {}) {
    val state by viewModel.uiState.collectAsState()
    var expanded by remember { mutableStateOf(false) }
    var servers by remember { mutableStateOf(false) }
    var batch by remember { mutableStateOf(false) }
    var unsupported by remember { mutableStateOf(false) }
    var viewMode by remember { mutableStateOf("list") }
    LaunchedEffect(url, source) { viewModel.loadAnimeDetails(url, source) }
    when {
        state.isLoading -> Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        state.details == null -> Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { AniEmptyState("No se pudo abrir el anime", state.error ?: "El catálogo no ha respondido.", AniIcons.CircleAlert, "Reintentar", { viewModel.loadAnimeDetails(url, source) }) }
        else -> {
            val details = state.details!!
            val episodeDownloads = remember(downloads, details.title, url, source) { downloadsForAnime(downloads, details.title, url, source) }
            val gridEpisodes = remember(details.episodes) {
                details.episodes.distinctBy { it.url }.sortedBy { it.number }.chunked(5)
            }
            LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                item {
                    AnimeDetailHeader(details.title, details.thumbnailUrl,
                        listOfNotNull(details.status, details.year, sourceLabel(details.source)).joinToString(" · "),
                        state.isFavorite, onBack, viewModel::toggleFavorite)
                }
                item {
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            details.genres.forEach { genre -> Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(50)) { Text(genre, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) } }
                        }
                        Text(details.synopsis, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = if (expanded) Int.MAX_VALUE else 3, overflow = TextOverflow.Ellipsis)
                        if (details.synopsis.length > 150) TextButton(onClick = { expanded = !expanded }, contentPadding = PaddingValues(0.dp)) { Text(if (expanded) "Ver menos" else "Leer sinopsis completa") }
                        val resume = state.resumeEpisode ?: details.episodes.minByOrNull { it.number }
                        resume?.let { episode -> Button(onClick = { viewModel.selectEpisode(episode); servers = true }, modifier = Modifier.fillMaxWidth()) {
                            Icon(AniIcons.Play, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
                            Text(if ((episode.watchProgress ?: 0.0) in .01.. .89) "Reanudar episodio ${episode.number}" else "Ver episodio ${episode.number}")
                        } }
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Episodios (${details.episodes.size})", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            if (details.episodes.size > 1) {
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = if (viewMode == "list") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                        onClick = { viewMode = "list" },
                                        modifier = Modifier.size(34.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                AniIcons.List,
                                                "Vista de lista compacta",
                                                Modifier.size(16.dp),
                                                tint = if (viewMode == "list") MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = if (viewMode == "grid") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                        onClick = { viewMode = "grid" },
                                        modifier = Modifier.size(34.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                AniIcons.LayoutGrid,
                                                "Vista de cuadrícula compacta",
                                                Modifier.size(16.dp),
                                                tint = if (viewMode == "grid") MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        if (details.episodes.isNotEmpty()) OutlinedButton(onClick = { batch = true }, modifier = Modifier.fillMaxWidth()) {
                            Icon(AniIcons.Download, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Descargar lote / temporada")
                        }
                        Spacer(Modifier.height(2.dp))
                    }
                }
                if (state.error != null && !servers) item { Text(state.error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp)) }
                if (viewMode == "grid") {
                    items(gridEpisodes) { row ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            row.forEach { episode ->
                                val download = episodeDownloads[episode.number.toInt()]
                                EpisodeGridItem(
                                    episode = episode,
                                    download = download,
                                    onClick = { viewModel.selectEpisode(episode); servers = true },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            repeat(5 - row.size) {
                                Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                } else {
                    items(details.episodes.distinctBy { it.url }.sortedBy { it.number }, key = { it.url }) { episode ->
                        val download = episodeDownloads[episode.number.toInt()]
                        EpisodeItem(episode, { viewModel.selectEpisode(episode); servers = true }, download = download, onDownload = {
                            if (download?.status == "paused") onResumeDownload(download.id)
                            else onDownloadEpisodes(listOf(episode))
                        })
                    }
                }
            }
        }
    }
    if (servers && state.selectedEpisode != null) ModalBottomSheet(onDismissRequest = { servers = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 430.dp).navigationBarsPadding(), contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { Text("Episodio ${state.selectedEpisode!!.number}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Text("Selecciona un servidor para reproducir", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            state.error?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
            if (state.isLoadingServers || state.isResolvingStream) item { Row(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(24.dp)); Spacer(Modifier.width(12.dp)); Text(if (state.isResolvingStream) "Preparando video…" else "Buscando servidores…") } }
            else if (state.servers.isEmpty()) item { AniEmptyState("Sin servidores disponibles", "Vuelve a cargar este episodio.", AniIcons.Server, "Reintentar", { state.selectedEpisode?.let(viewModel::selectEpisode) }) }
            else {
                item { Row(verticalAlignment = Alignment.CenterVertically) { Text("Mostrar no compatibles", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f)); Switch(unsupported, { unsupported = it }) } }
                items(state.servers.distinctBy { it.name + it.url }.filter { unsupported || com.anics.nativeapp.downloads.ServerSupport.playable(it) }.sortedBy { if (com.anics.nativeapp.downloads.ServerSupport.playable(it)) 0 else 1 }, key = { it.name + it.url }) { server ->
                Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                    Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(AniIcons.Server, null, Modifier.size(17.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Column(Modifier.weight(1f).padding(start = 10.dp)) {
                            Text(server.name, fontWeight = FontWeight.SemiBold, color = if (com.anics.nativeapp.downloads.ServerSupport.playable(server)) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(if (com.anics.nativeapp.downloads.ServerSupport.playable(server)) "Compatible · Disponibilidad según servidor" else "No compatible en esta versión", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        IconButton(enabled = com.anics.nativeapp.downloads.ServerSupport.playable(server), onClick = { viewModel.resolveServer(server) { media ->
                            if (media.mediaType == NativeMediaType.HLS) viewModel.reportError("Para descargar, elige un servidor MP4. Las descargas HLS siguen pendientes.")
                            else { onDownloadEpisode(media, state.details?.title ?: "Anime", state.selectedEpisode!!.number.toInt()); servers = false }
                        } }) { Icon(AniIcons.Download, "Descargar desde ${server.name}", Modifier.size(20.dp)) }
                        IconButton(enabled = com.anics.nativeapp.downloads.ServerSupport.playable(server), onClick = { viewModel.resolveServer(server) { media -> servers = false; onPlayEpisode(media, state.details?.title ?: "Anime", state.selectedEpisode!!.number.toInt()) } }) { Icon(AniIcons.Play, "Reproducir desde ${server.name}", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary) }
                    }
                }
            }
            }
        }
    }
    if (batch) BatchDownloadDialog(state.details?.episodes.orEmpty(), onDismiss = { batch = false }, onDownload = {
        onDownloadEpisodes(it); batch = false
    })
}

@Composable
fun EpisodeItem(episode: NativeEpisode, onClick: () -> Unit, modifier: Modifier = Modifier, onDownload: () -> Unit = {},
    download: com.anics.nativeapp.data.local.DownloadEntity? = null) {
    Surface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Episodio ${episode.number}", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                    val progress = episode.watchProgress ?: 0.0
                    if (episode.watched) Text("Visto · Reproducir de nuevo", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    else if (progress > .01) Text("Reanudar · ${(progress * 100).toInt()}%", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    download?.let { Text(episodeDownloadLabel(it), style = MaterialTheme.typography.labelSmall,
                        color = if (it.status == "failed") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                }
                EpisodeDownloadButton(episode.number, download, onDownload)
                Spacer(Modifier.width(2.dp))
                IconButton(onClick = onClick, modifier = Modifier.size(34.dp)) {
                    Icon(if (episode.watched) AniIcons.CheckCheck else AniIcons.Play, "Seleccionar episodio ${episode.number}", Modifier.size(17.dp), tint = MaterialTheme.colorScheme.primary)
                }
            }
            episode.watchProgress?.takeIf { it > .01 && it < .9 }?.let { progress -> LinearProgressIndicator(progress = { progress.toFloat() }, modifier = Modifier.fillMaxWidth().height(2.5.dp)) }
        }
    }
}

@Composable
fun EpisodeGridItem(
    episode: NativeEpisode,
    download: com.anics.nativeapp.data.local.DownloadEntity?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val progress = episode.watchProgress ?: 0.0
    val isWatched = episode.watched || progress >= 0.85
    val isDownloaded = download?.status == "completed"

    Surface(
        onClick = onClick,
        modifier = modifier.height(42.dp),
        shape = RoundedCornerShape(8.dp),
        color = if (isWatched) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f) else MaterialTheme.colorScheme.surface,
        border = BorderStroke(
            1.dp,
            if (isDownloaded) MaterialTheme.colorScheme.primary
            else if (progress > 0.01) MaterialTheme.colorScheme.primary.copy(alpha = 0.6f)
            else MaterialTheme.colorScheme.outlineVariant
        )
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(
                    text = "${episode.number}",
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isWatched) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface
                )
                if (isWatched) {
                    Text("Visto", style = MaterialTheme.typography.labelSmall.copy(fontSize = 8.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else if (progress > 0.01) {
                    Text("${(progress * 100).toInt()}%", style = MaterialTheme.typography.labelSmall.copy(fontSize = 8.sp), color = MaterialTheme.colorScheme.primary)
                } else if (isDownloaded) {
                    Text("Listo", style = MaterialTheme.typography.labelSmall.copy(fontSize = 8.sp), color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}
