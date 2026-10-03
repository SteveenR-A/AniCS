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
    onDownloadEpisode: (NativeResolvedMedia, String, Int) -> Unit = { _, _, _ -> }, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    var expanded by remember { mutableStateOf(false) }
    var servers by remember { mutableStateOf(false) }
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
                    }
                }
                if (state.error != null && !servers) item { Text(state.error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp)) }
                items(details.episodes.sortedBy { it.number }, key = { it.url }) { episode -> EpisodeItem(episode, { viewModel.selectEpisode(episode); servers = true }) }
            }
        }
    }
    if (servers && state.selectedEpisode != null) ModalBottomSheet(onDismissRequest = { servers = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 430.dp).navigationBarsPadding(), contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { Text("Episodio ${state.selectedEpisode!!.number}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Text("Selecciona un servidor para reproducir", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            state.error?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
            if (state.isLoadingServers || state.isResolvingStream) item { Row(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(24.dp)); Spacer(Modifier.width(12.dp)); Text(if (state.isResolvingStream) "Preparando video…" else "Buscando servidores…") } }
            else if (state.servers.isEmpty()) item { AniEmptyState("Sin servidores disponibles", "Vuelve a cargar este episodio.", AniIcons.Server, "Reintentar", { state.selectedEpisode?.let(viewModel::selectEpisode) }) }
            else items(state.servers, key = { it.name + it.url }) { server ->
                Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                    Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(AniIcons.Server, null, Modifier.size(17.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(server.name, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f).padding(start = 10.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        IconButton(onClick = { viewModel.resolveServer(server) { media ->
                            if (media.mediaType == NativeMediaType.HLS) viewModel.reportError("Para descargar, elige un servidor MP4. Las descargas HLS siguen pendientes.")
                            else { onDownloadEpisode(media, state.details?.title ?: "Anime", state.selectedEpisode!!.number.toInt()); servers = false }
                        } }) { Icon(AniIcons.Download, "Descargar desde ${server.name}", Modifier.size(20.dp)) }
                        IconButton(onClick = { viewModel.resolveServer(server) { media -> servers = false; onPlayEpisode(media, state.details?.title ?: "Anime", state.selectedEpisode!!.number.toInt()) } }) { Icon(AniIcons.Play, "Reproducir desde ${server.name}", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary) }
                    }
                }
            }
        }
    }
}

@Composable
fun EpisodeItem(episode: NativeEpisode, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(onClick, modifier.fillMaxWidth().padding(horizontal = 16.dp), shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Episodio ${episode.number}", fontWeight = FontWeight.SemiBold)
                    val progress = episode.watchProgress ?: 0.0
                    if (episode.watched) Text("Visto · Reproducir de nuevo", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    else if (progress > .01) Text("Reanudar · ${(progress * 100).toInt()}%", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
                Icon(if (episode.watched) AniIcons.CheckCheck else AniIcons.Play, "Seleccionar episodio ${episode.number}", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary)
            }
            episode.watchProgress?.takeIf { it > .01 && it < .9 }?.let { progress -> LinearProgressIndicator(progress = { progress.toFloat() }, modifier = Modifier.fillMaxWidth().height(3.dp)) }
        }
    }
}