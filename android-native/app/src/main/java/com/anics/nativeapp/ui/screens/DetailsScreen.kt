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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.anics.nativeapp.ffi.*
import com.anics.nativeapp.ui.components.*
import com.anics.nativeapp.ui.viewmodels.DetailsViewModel

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DetailsScreen(url: String, source: String, viewModel: DetailsViewModel, onBack: () -> Unit,
    onPlayEpisode: (NativeResolvedMedia, String, Int) -> Unit,
    onDownloadEpisode: (NativeResolvedMedia, String, Int) -> Unit = { _, _, _ -> },
    onDownloadEpisodes: (List<NativeEpisode>) -> Unit = {}, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    var expanded by remember { mutableStateOf(false) }
    var servers by remember { mutableStateOf(false) }
    var batch by remember { mutableStateOf(false) }
    var from by remember { mutableStateOf("1") }
    var to by remember { mutableStateOf("") }
    var unsupported by remember { mutableStateOf(false) }
    LaunchedEffect(url, source) { viewModel.loadAnimeDetails(url, source) }
    when {
        state.isLoading -> Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        state.details == null -> Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { AniEmptyState("No se pudo abrir el anime", state.error ?: "El catálogo no ha respondido.", AniIcons.CircleAlert, "Reintentar", { viewModel.loadAnimeDetails(url, source) }) }
        else -> {
            val details = state.details!!
            LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item {
                    Box(Modifier.fillMaxWidth().height(270.dp)) {
                        AsyncImage(details.thumbnailUrl, details.title, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = .4f), MaterialTheme.colorScheme.background))))
                        Row(Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            IconButton(onBack) { Icon(AniIcons.ArrowLeft, "Volver", tint = Color.White) }
                            IconButton(viewModel::toggleFavorite) { Icon(AniIcons.Heart, if (state.isFavorite) "Quitar favorito" else "Guardar favorito", tint = if (state.isFavorite) MaterialTheme.colorScheme.primary else Color.White) }
                        }
                        Column(Modifier.align(Alignment.BottomStart).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(details.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                            Text(listOfNotNull(details.status, details.year, sourceLabel(details.source)).joinToString(" · "), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                item {
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
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
                        Text("Episodios (${details.episodes.size})", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        if (details.episodes.isNotEmpty()) OutlinedButton(onClick = { from = details.episodes.minOf { it.number }.toString(); to = details.episodes.maxOf { it.number }.toString(); batch = true }, modifier = Modifier.fillMaxWidth()) {
                            Icon(AniIcons.Download, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Descargar lote / temporada")
                        }
                    }
                }
                if (state.error != null && !servers) item { Text(state.error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp)) }
                items(details.episodes.distinctBy { it.url }.sortedBy { it.number }, key = { it.url }) { episode -> EpisodeItem(episode, { viewModel.selectEpisode(episode); servers = true }, onDownload = { onDownloadEpisodes(listOf(episode)) }) }
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
    if (batch) AlertDialog(onDismissRequest = { batch = false }, title = { Text("Descargar episodios") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Se usará tu servidor de descarga preferido. Los episodios existentes se omiten.", style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(from, { from = it.filter(Char::isDigit) }, label = { Text("Desde") }, singleLine = true, modifier = Modifier.weight(1f))
                OutlinedTextField(to, { to = it.filter(Char::isDigit) }, label = { Text("Hasta") }, singleLine = true, modifier = Modifier.weight(1f))
            }
            TextButton(onClick = { state.details?.episodes?.let(onDownloadEpisodes); batch = false }) { Text("Temporada completa") }
        }
    }, confirmButton = { TextButton(enabled = from.toIntOrNull() != null && to.toIntOrNull() != null && from.toInt() <= to.toInt(), onClick = {
        onDownloadEpisodes(state.details?.episodes.orEmpty().filter { it.number.toInt() in from.toInt()..to.toInt() }); batch = false
    }) { Text("Añadir lote") } }, dismissButton = { TextButton(onClick = { batch = false }) { Text("Volver") } })
}

@Composable
fun EpisodeItem(episode: NativeEpisode, onClick: () -> Unit, modifier: Modifier = Modifier, onDownload: () -> Unit = {}) {
    Surface(onClick, modifier.fillMaxWidth().padding(horizontal = 16.dp), shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Episodio ${episode.number}", fontWeight = FontWeight.SemiBold)
                    val progress = episode.watchProgress ?: 0.0
                    if (episode.watched) Text("Visto · Reproducir de nuevo", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    else if (progress > .01) Text("Reanudar · ${(progress * 100).toInt()}%", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
                IconButton(onClick = onDownload) { Icon(AniIcons.Download, "Descargar episodio ${episode.number}", Modifier.size(18.dp)) }
                IconButton(onClick = onClick) { Icon(if (episode.watched) AniIcons.CheckCheck else AniIcons.Play, "Seleccionar episodio ${episode.number}", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary) }
            }
            episode.watchProgress?.takeIf { it > .01 && it < .9 }?.let { progress -> LinearProgressIndicator(progress = { progress.toFloat() }, modifier = Modifier.fillMaxWidth().height(3.dp)) }
        }
    }
}
