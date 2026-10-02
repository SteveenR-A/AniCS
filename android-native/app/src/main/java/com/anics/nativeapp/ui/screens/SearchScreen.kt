package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.anics.nativeapp.ui.viewmodels.SearchViewModel
import java.time.Year

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(viewModel: SearchViewModel, onAnimeClick: (String, String) -> Unit, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    var showFilters by remember { mutableStateOf(false) }
    Scaffold(modifier = modifier, topBar = {
        TopAppBar(title = { Text("Buscar") }, actions = {
            IconButton(onClick = { showFilters = !showFilters }) { Icon(Icons.Default.FilterList, "Filtros") }
            IconButton(onClick = viewModel::refresh) { Icon(Icons.Default.Refresh, "Actualizar búsqueda") }
        })
    }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            OutlinedTextField(value = state.query, onValueChange = viewModel::onQueryChanged,
                placeholder = { Text("Buscar anime…") }, singleLine = true,
                leadingIcon = { Icon(Icons.Default.Search, null) },
                trailingIcon = { IconButton(onClick = viewModel::clearSearch) { Icon(Icons.Default.Clear, "Limpiar búsqueda y filtros") } },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = state.selectedSource == null, onClick = { viewModel.selectSource(null) }, label = { Text("Todas") })
                state.availableSources.forEach { source ->
                    FilterChip(selected = state.selectedSource == source.id, onClick = { viewModel.selectSource(source.id) }, label = { Text(source.name) })
                }
            }
            if (showFilters) {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    if (state.selectedSource == null) Text("Selecciona una fuente para explorar su catálogo y usar filtros.", style = MaterialTheme.typography.bodySmall)
                    else {
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterMenu("Género", state.genre, state.genres.map { it.slug to it.name }) { viewModel.setFilter("genre", it) }
                            if (state.selectedSource == "jkanime") {
                                FilterMenu("Estado", state.status, listOf("emision" to "En emisión", "finalizados" to "Finalizado", "estrenos" to "Próximos estrenos")) { viewModel.setFilter("status", it) }
                                FilterMenu("Tipo", state.animeType, listOf("animes" to "Serie", "peliculas" to "Película", "ovas" to "OVA", "onas" to "ONA", "especiales" to "Especial")) { viewModel.setFilter("type", it) }
                            }
                        }
                        if (state.selectedSource == "jkanime") Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterMenu("Año", state.year, (Year.now().value downTo 1960).map { it.toString() to it.toString() }) { viewModel.setFilter("year", it) }
                            FilterMenu("Orden", state.orderBy, listOf("titulo" to "Título", "fecha" to "Más recientes")) { viewModel.setFilter("order", it) }
                        }
                    }
                }
            }
            if (state.isLoading) LinearProgressIndicator(Modifier.fillMaxWidth())
            state.error?.let { error ->
                Text(error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
                TextButton(onClick = viewModel::refresh) { Text("Reintentar") }
            }
            if (!state.isLoading && state.error == null && state.results.isEmpty()) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text(if (state.selectedSource == null && state.query.isBlank()) "Escribe un nombre para buscar en todas las fuentes" else "No se encontraron resultados")
            } else LazyVerticalGrid(columns = GridCells.Adaptive(140.dp), modifier = Modifier.weight(1f), contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(state.results, key = { it.source + it.url }) { anime -> AnimeCard(anime, { onAnimeClick(anime.url, anime.source) }) }
                if (state.hasNext) item(span = { GridItemSpan(maxLineSpan) }) {
                    Button(onClick = viewModel::nextPage, enabled = !state.isLoading) { Text("Cargar más") }
                }
            }
        }
    }
}

@Composable
fun FilterMenu(label: String, selected: String?, options: List<Pair<String, String>>, onSelect: (String?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }) { Text(options.firstOrNull { it.first == selected }?.second ?: label) }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text("Todos") }, onClick = { onSelect(null); expanded = false })
            options.forEach { (value, name) -> DropdownMenuItem(text = { Text(name) }, onClick = { onSelect(value); expanded = false }) }
        }
    }
}
