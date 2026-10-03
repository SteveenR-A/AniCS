package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.anics.nativeapp.ui.components.*
import com.anics.nativeapp.ui.viewmodels.SearchViewModel
import java.time.Year
import kotlinx.coroutines.launch

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SearchScreen(viewModel: SearchViewModel, onAnimeClick: (String, String) -> Unit, onSource: (String) -> Unit, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    var showFilters by rememberSaveable { mutableStateOf(false) }
    val keyboard = LocalSoftwareKeyboardController.current
    val grid = rememberLazyGridState()
    val scope = rememberCoroutineScope()
    LazyVerticalGrid(GridCells.Adaptive(145.dp), modifier.fillMaxSize(), state = grid, contentPadding = PaddingValues(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Surface(Modifier.weight(1f), shape = RoundedCornerShape(24.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), color = MaterialTheme.colorScheme.surface) {
                    Row(Modifier.heightIn(min = 46.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(AniIcons.Search, null, Modifier.size(17.dp))
                        androidx.compose.foundation.text.BasicTextField(state.query, viewModel::onQueryChanged, singleLine = true,
                            textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurface),
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { viewModel.submit(); keyboard?.hide() }),
                            modifier = Modifier.weight(1f), decorationBox = { inner -> Box { if (state.query.isEmpty()) Text("Buscar anime…", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1); inner() } })
                        if (state.query.isNotEmpty()) IconButton(onClick = { viewModel.onQueryChanged("") }, modifier = Modifier.size(28.dp)) { Icon(AniIcons.X, "Limpiar búsqueda", Modifier.size(16.dp)) }
                    }
                }
                IconButton(onClick = { showFilters = !showFilters }, modifier = Modifier.size(36.dp)) { Icon(AniIcons.SlidersHorizontal, "Filtros avanzados", tint = if (showFilters) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                IconButton(onClick = viewModel::refresh, modifier = Modifier.size(36.dp)) { Icon(AniIcons.RefreshCw, "Actualizar catálogo") }
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) { SourceTabs(state.availableSources, state.selectedSource, { source -> viewModel.selectSource(source); source?.let(onSource) }, includeAll = true) }
        if (state.selectedSource == "jkanime") item(span = { GridItemSpan(maxLineSpan) }) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AniPill("Todos", state.status == null && state.animeType == null, { viewModel.quickFilter("all") })
                AniPill("Estrenos", state.status == "estrenos", { viewModel.quickFilter("estrenos") }, icon = AniIcons.Sparkles)
                AniPill("En emisión", state.status == "emision", { viewModel.quickFilter("emision") }, icon = AniIcons.Flame)
                AniPill("Películas", state.animeType == "peliculas", { viewModel.quickFilter("peliculas") }, icon = AniIcons.Film)
            }
        }
        if (state.recentQueries.isNotEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(AniIcons.Clock, "Búsquedas recientes", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                state.recentQueries.forEach { query -> InputChip(selected = false, onClick = { viewModel.onQueryChanged(query); viewModel.submit() }, label = { Text(query, maxLines = 1) },
                    trailingIcon = { Icon(AniIcons.X, "Quitar $query", Modifier.size(14.dp).clickable { viewModel.forgetQuery(query) }) }) }
            }
        }
        if (showFilters) item(span = { GridItemSpan(maxLineSpan) }) {
            AniPanel {
                SectionTitle("Filtros avanzados", action = { TextButton(onClick = viewModel::clearFilters) { Text("Limpiar") } })
                if (state.selectedSource == null) Text("Selecciona una fuente para usar sus filtros.")
                else {
                    if (state.selectedSource == "jkanime") {
                        Text("Estado", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf(null to "Todos", "estrenos" to "Estrenos", "emision" to "En emisión", "finalizados" to "Concluidos").forEach { (key, name) -> AniPill(name, state.status == key, { viewModel.setFilter("status", key) }) }
                        }
                        Text("Tipo", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf(null to "Todos", "animes" to "Anime", "peliculas" to "Película", "ovas" to "OVA", "onas" to "ONA", "especiales" to "Especial").forEach { (key, name) -> AniPill(name, state.animeType == key, { viewModel.setFilter("type", key) }) }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterMenu("Año", state.year, (Year.now().value downTo 1960).map { it.toString() to it.toString() }) { viewModel.setFilter("year", it) }
                            FilterMenu("Orden", state.orderBy, listOf("titulo" to "Título", "fecha" to "Más recientes")) { viewModel.setFilter("order", it) }
                        }
                    }
                    Text("Géneros (${state.genres.size})", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (state.genres.isEmpty()) Text("La fuente no ha proporcionado géneros.", style = MaterialTheme.typography.bodySmall)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        AniPill("Todos", state.genre == null, { viewModel.setFilter("genre", null) })
                        state.genres.forEach { genre -> AniPill(genre.name, state.genre == genre.slug, { viewModel.setFilter("genre", genre.slug) }) }
                    }
                }
            }
        }
        if (state.isLoading) item(span = { GridItemSpan(maxLineSpan) }) { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        state.error?.let { error -> item(span = { GridItemSpan(maxLineSpan) }) { AniEmptyState("No se pudo buscar", error, AniIcons.CircleAlert, "Reintentar", viewModel::refresh) } }
        if (!state.isLoading && state.error == null && state.results.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
            Box(Modifier.fillMaxWidth().heightIn(min = 240.dp), contentAlignment = Alignment.Center) {
                AniEmptyState("Sin resultados", if (state.selectedSource == null && state.query.isBlank()) "Escribe un título para buscar en todas las fuentes." else "Prueba con otro término de búsqueda o cambia los filtros.", actionLabel = "Limpiar filtros", onAction = viewModel::clearFilters)
            }
        }
        items(state.results, key = { it.source + it.url }) { anime -> AnimeCard(anime, { viewModel.rememberQuery(); onAnimeClick(anime.url, anime.source) }) }
        if (state.totalPages > 1) item(span = { GridItemSpan(maxLineSpan) }) {
            PageNavigation(state.page, state.totalPages, !state.isLoading) { page -> viewModel.goToPage(page); scope.launch { grid.scrollToItem(0) } }
        }
        if (state.hasNext) item(span = { GridItemSpan(maxLineSpan) }) { OutlinedButton(onClick = viewModel::nextPage, enabled = !state.isLoading) { Text("Cargar más") } }
    }
}

@Composable
fun FilterMenu(label: String, selected: String?, options: List<Pair<String, String>>, onSelect: (String?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }) { Text(options.firstOrNull { it.first == selected }?.second ?: label); Spacer(Modifier.width(8.dp)); Icon(AniIcons.ChevronDown, null, Modifier.size(14.dp)) }
        DropdownMenu(expanded, { expanded = false }) {
            DropdownMenuItem(text = { Text("Todos") }, onClick = { onSelect(null); expanded = false })
            options.forEach { (value, name) -> DropdownMenuItem(text = { Text(name) }, onClick = { onSelect(value); expanded = false }) }
        }
    }
}
fun pageNumbers(page: Int, total: Int): List<Int> = (listOf(1, total) + ((page - 2).coerceAtLeast(1)..(page + 2).coerceAtMost(total)).toList()).distinct().sorted()
@Composable
fun PageNavigation(page: Int, total: Int, enabled: Boolean, select: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { select(page - 1) }, enabled = enabled && page > 1, modifier = Modifier.size(36.dp)) { Icon(AniIcons.ArrowLeft, "Página anterior", Modifier.size(17.dp)) }
        val pages = pageNumbers(page, total)
        pages.forEachIndexed { index, number ->
            if (index > 0 && number - pages[index - 1] > 1) Text("…")
            AniPill("$number", page == number, { if (enabled) select(number) })
        }
        IconButton(onClick = { select(page + 1) }, enabled = enabled && page < total, modifier = Modifier.size(36.dp)) { Icon(AniIcons.ChevronRight, "Página siguiente", Modifier.size(17.dp)) }
    }
}
