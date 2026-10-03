package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.anics.nativeapp.ffi.NativeAnimeResult
import com.anics.nativeapp.ui.components.*
import com.anics.nativeapp.ui.viewmodels.HomeViewModel

@Composable
fun HomeScreen(viewModel: HomeViewModel, onAnimeClick: (String, String) -> Unit, onSearchClick: () -> Unit,
    onResume: (com.anics.nativeapp.data.local.HistoryEntity) -> Unit, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    LazyVerticalGrid(GridCells.Adaptive(145.dp), modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            SectionTitle("Últimos episodios", "Novedades de ${sourceLabel(state.selectedSource)}", action = {
                IconButton(onClick = onSearchClick) { Icon(AniIcons.Search, "Buscar anime") }
                IconButton(onClick = viewModel::refresh) { Icon(AniIcons.RefreshCw, "Actualizar inicio") }
            })
        }
        if (state.continueWatching.isNotEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Continuar viendo", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.continueWatching, key = { it.id }) { entry ->
                        Surface(onClick = { onResume(entry) }, shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), modifier = Modifier.width(230.dp)) {
                            Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                AsyncImage(entry.thumbnailUrl, null, Modifier.width(45.dp).height(65.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(entry.animeTitle, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                                    Text("Reanudar · Ep. ${entry.episodeNumber}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall)
                                    LinearProgressIndicator(progress = { (entry.watchProgress ?: 0.0).toFloat().coerceIn(0f,1f) }, modifier = Modifier.fillMaxWidth().height(3.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
        if (state.isLoading) item(span = { GridItemSpan(maxLineSpan) }) { Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
        else if (state.error != null) item(span = { GridItemSpan(maxLineSpan) }) { AniEmptyState("No se pudo cargar el catálogo", state.error!!, AniIcons.CircleAlert, "Reintentar", viewModel::refresh) }
        else if (state.latestAnimes.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) { AniEmptyState("Sin novedades", "Prueba otra fuente o actualiza el catálogo.", actionLabel = "Actualizar", onAction = viewModel::refresh) }
        else items(state.latestAnimes, key = { it.source + it.url + it.episode }) { anime -> AnimeCard(anime, { onAnimeClick(anime.url, anime.source) }) }
    }
}

@Composable
fun AnimeCard(anime: NativeAnimeResult, onClick: () -> Unit, modifier: Modifier = Modifier, rank: Int? = null) {
    Surface(onClick, modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, if (rank == 1) Color(0xFFc99e39) else MaterialTheme.colorScheme.outlineVariant)) {
        Column {
            Box(Modifier.fillMaxWidth().aspectRatio(.75f).background(MaterialTheme.colorScheme.surfaceVariant)) {
                AsyncImage(anime.thumbnailUrl, anime.title, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent, MaterialTheme.colorScheme.surface.copy(alpha = .8f)))))
                anime.episode?.takeIf { it.isNotBlank() }?.let { ep -> Surface(color = MaterialTheme.colorScheme.primary, shape = RoundedCornerShape(50), modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)) {
                    Text("Ep ${ep.removePrefix("Ep.").trim()}", color = MaterialTheme.colorScheme.onPrimary, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp))
                } }
                rank?.let { Surface(color = if (it <= 3) Color(0xFFc99e39) else MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(50), modifier = Modifier.align(Alignment.TopStart).padding(8.dp)) {
                    Text("#$it", fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp))
                } }
                if (rank != null && anime.rating != null) Surface(Modifier.align(Alignment.BottomEnd).padding(8.dp), color = Color.Black.copy(alpha = .7f), shape = RoundedCornerShape(50)) {
                    Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(AniIcons.Star, null, Modifier.size(12.dp), tint = Color(0xFFf6c65b)); Text(anime.rating!!.toString(), color = Color(0xFFf6c65b), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(anime.title, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium, maxLines = 2, minLines = 2, overflow = TextOverflow.Ellipsis)
                Text(sourceLabel(anime.source), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}
