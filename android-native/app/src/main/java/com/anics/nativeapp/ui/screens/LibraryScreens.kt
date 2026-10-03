package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.anics.nativeapp.data.local.HistoryEntity
import com.anics.nativeapp.ui.components.*
import com.anics.nativeapp.ui.viewmodels.*

@Composable
fun BrowseScreen(viewModel: BrowseViewModel, onAnime: (String, String) -> Unit) {
    val state by viewModel.state.collectAsState()
    var day by remember { mutableStateOf<String?>(null) }
    LazyVerticalGrid(GridCells.Adaptive(145.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            SectionTitle(if (viewModel.ranking) "Top ranking" else "Horario semanal", "${sourceLabel(state.source)} · ${if (viewModel.ranking) "Animes populares" else "Estrenos semanales"}",
                if (viewModel.ranking) AniIcons.Trophy else AniIcons.CalendarDays, action = { IconButton(onClick = viewModel::refresh) { Icon(AniIcons.RefreshCw, "Actualizar") } })
        }
        if (!viewModel.ranking && state.days.isNotEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AniPill("Toda la semana", day == null, { day = null })
                state.days.forEach { value -> AniPill(value.day, day == value.day, { day = value.day }) }
            }
        }
        if (state.isLoading) item(span = { GridItemSpan(maxLineSpan) }) { Box(Modifier.fillMaxWidth().height(220.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
        else if (state.error != null) item(span = { GridItemSpan(maxLineSpan) }) { AniEmptyState("No se pudo cargar", state.error!!, AniIcons.CircleAlert, "Reintentar", viewModel::refresh) }
        else if (viewModel.ranking) {
            if (state.ranking.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) { AniEmptyState("Ranking no disponible", "Esta fuente no ha proporcionado un ranking.", AniIcons.Trophy) }
            itemsIndexed(state.ranking, key = { _, anime -> anime.source + anime.url }) { index, anime -> AnimeCard(anime, { onAnime(anime.url, anime.source) }, rank = index + 1) }
        } else {
            val selectedDays = state.days.filter { day == null || it.day == day }
            if (selectedDays.all { it.animes.isEmpty() }) item(span = { GridItemSpan(maxLineSpan) }) { AniEmptyState("Sin estrenos programados", "Prueba otro día o cambia de fuente.", AniIcons.CalendarDays) }
            selectedDays.forEach { schedule ->
                if (schedule.animes.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) { Text("${schedule.day} (${schedule.animes.size})", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                    items(schedule.animes, key = { schedule.day + it.source + it.url }) { anime -> AnimeCard(anime, { onAnime(anime.url, anime.source) }) }
                }
            }
        }
    }
}

@Composable
fun HistoryScreen(viewModel: HistoryViewModel, onResume: (HistoryEntity) -> Unit) {
    val state by viewModel.state.collectAsState()
    var query by remember { mutableStateOf("") }
    var clear by remember { mutableStateOf(false) }
    var remove by remember { mutableStateOf<List<HistoryEntity>?>(null) }
    val groups = state.entries.groupBy { com.anics.nativeapp.sync.SyncContract.titleKey(it.animeTitle) }.values
        .filter { rows -> query.isBlank() || rows.any { it.animeTitle.contains(query, true) || it.episodeNumber.toString() == query.trim() } }
        .sortedByDescending { rows -> rows.maxOf { it.lastWatchedAt } }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { SectionTitle("Historial (${state.entries.size})", state.profileName, AniIcons.History, action = { IconButton(onClick = { clear = true }, enabled = state.entries.isNotEmpty()) { Icon(AniIcons.Trash2, "Borrar todo el historial") } }) }
        item { OutlinedTextField(query, { query = it }, placeholder = { Text("Buscar anime o capítulo…") }, leadingIcon = { Icon(AniIcons.Search, null, Modifier.size(20.dp)) }, singleLine = true, shape = RoundedCornerShape(50), modifier = Modifier.fillMaxWidth()) }
        state.message?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        if (groups.isEmpty()) item { AniEmptyState("Sin historial", if (query.isBlank()) "Aquí encontrarás los episodios que has visto con este perfil." else "No hay episodios que coincidan con la búsqueda.", AniIcons.History) }
        items(groups, key = { it.first().id }) { rows ->
            val latest = rows.maxBy { it.lastWatchedAt }
            var expanded by remember { mutableStateOf(false) }
            AniPanel {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AsyncImage(latest.thumbnailUrl, latest.animeTitle, Modifier.width(60.dp).height(88.dp).clip(RoundedCornerShape(10.dp)), contentScale = ContentScale.Crop)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(latest.animeTitle, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                        Text("Episodio ${latest.episodeNumber} · ${((latest.watchProgress ?: 0.0) * 100).toInt()}%", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
                        Text("${rows.size} episodios · " + java.text.DateFormat.getDateInstance(java.text.DateFormat.SHORT).format(java.util.Date(latest.lastWatchedAt)), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Button(onClick = { onResume(latest) }, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)) { Icon(AniIcons.Play, null, Modifier.size(14.dp)); Spacer(Modifier.width(5.dp)); Text("Reanudar", style = MaterialTheme.typography.labelMedium) }
                    }
                    IconButton(onClick = { remove = rows }, modifier = Modifier.size(32.dp)) { Icon(AniIcons.Trash2, "Quitar este anime del historial", Modifier.size(18.dp)) }
                }
                TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "Ocultar episodios" else "Ver ${rows.size} episodios vistos"); Spacer(Modifier.width(6.dp)); Icon(AniIcons.ChevronDown, null, Modifier.size(16.dp)) }
                if (expanded) rows.sortedBy { it.episodeNumber }.forEach { episode ->
                    Row(Modifier.fillMaxWidth().clickable { onResume(episode) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Episodio ${episode.episodeNumber}", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                        Text("${((episode.watchProgress ?: 0.0) * 100).toInt()}%", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                        IconButton(onClick = { onResume(episode) }, modifier = Modifier.size(32.dp)) { Icon(AniIcons.Play, "Reanudar episodio ${episode.episodeNumber}", Modifier.size(16.dp)) }
                    }
                }
            }
        }
    }
    if (clear || remove != null) AlertDialog(onDismissRequest = { clear = false; remove = null }, title = { Text(if (clear) "Borrar historial del perfil" else "Quitar del historial") },
        text = { Text("Se borrará el progreso guardado de ${if (clear) "este perfil" else remove!!.first().animeTitle}. Los videos descargados se conservarán.") },
        confirmButton = { TextButton(onClick = { if (clear) viewModel.clear() else viewModel.remove(remove!!); clear = false; remove = null }) { Text("Borrar") } },
        dismissButton = { TextButton(onClick = { clear = false; remove = null }) { Text("Cancelar") } })
}
