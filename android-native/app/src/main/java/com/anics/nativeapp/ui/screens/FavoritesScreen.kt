package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.anics.nativeapp.data.local.FavoriteEntity
import com.anics.nativeapp.ffi.NativeAnimeResult
import com.anics.nativeapp.ui.components.*
import com.anics.nativeapp.ui.viewmodels.FavoritesViewModel

@Composable
fun FavoritesScreen(viewModel: FavoritesViewModel, onAnimeClick: (String, String) -> Unit, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    var remove by remember { mutableStateOf<FavoriteEntity?>(null) }
    LazyVerticalGrid(GridCells.Adaptive(145.dp), modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item(span = { GridItemSpan(maxLineSpan) }) { SectionTitle("Favoritos", "Perfil: ${state.profileName}", AniIcons.Heart) }
        if (state.isLoading) item(span = { GridItemSpan(maxLineSpan) }) { Box(Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
        else if (state.favorites.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) { Box(Modifier.heightIn(min = 300.dp), contentAlignment = Alignment.Center) { AniEmptyState("Sin favoritos todavía", "Toca el corazón en la ficha de un anime para guardarlo en este perfil.", AniIcons.Heart) } }
        items(state.favorites, key = { it.id }) { favorite ->
            Box {
                AnimeCard(NativeAnimeResult(favorite.title, favorite.url, favorite.thumbnailUrl, null, null, null, null, null, null, null, favorite.source, favorite.profileId), { onAnimeClick(favorite.url, favorite.source) })
                Surface(Modifier.align(Alignment.TopEnd).padding(6.dp), color = Color.Black.copy(alpha = .6f), shape = RoundedCornerShape(50)) {
                    IconButton(onClick = { remove = favorite }, modifier = Modifier.size(30.dp)) { Icon(AniIcons.HeartFilled, "Quitar favorito", Modifier.size(17.dp), tint = MaterialTheme.colorScheme.primary) }
                }
            }
        }
    }
    remove?.let { favorite -> AlertDialog(onDismissRequest = { remove = null }, title = { Text("Quitar de favoritos") }, text = { Text(favorite.title) },
        confirmButton = { TextButton(onClick = { viewModel.removeFavorite(favorite.url); remove = null }) { Text("Quitar") } }, dismissButton = { TextButton(onClick = { remove = null }) { Text("Cancelar") } }) }
}