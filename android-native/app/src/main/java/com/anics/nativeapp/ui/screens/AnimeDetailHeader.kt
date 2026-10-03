package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.anics.nativeapp.ui.components.AniIcons

@Composable
fun AnimeDetailHeader(title: String, imageUrl: String, metadata: String, isFavorite: Boolean,
    onBack: () -> Unit, onFavorite: () -> Unit) {
    var showCover by remember(imageUrl) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            IconButton(onBack) { Icon(AniIcons.ArrowLeft, "Volver") }
            IconButton(onFavorite) {
                Icon(AniIcons.Heart, if (isFavorite) "Quitar favorito" else "Guardar favorito",
                    tint = if (isFavorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.width(110.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .clickable(role = Role.Button, onClickLabel = "Ver portada en grande") { showCover = true }
                .testTag("anime-cover")) {
                AsyncImage(imageUrl, "Portada de $title", Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                Surface(Modifier.align(Alignment.BottomEnd).padding(6.dp), color = Color.Black.copy(alpha = .65f), shape = RoundedCornerShape(6.dp)) {
                    Icon(AniIcons.Maximize, null, Modifier.padding(5.dp).size(16.dp), tint = Color.White)
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SelectionContainer {
                    Text(title, Modifier.testTag("anime-title"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                }
                Text(metadata, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
    if (showCover) AnimeCoverViewer(title, imageUrl, onDismiss = { showCover = false })
}

/** Bounds are based on the fitted image, so dragging never loses the cover outside the viewport. */
internal fun coverPanBounds(image: Size, viewport: Size, zoom: Float): Offset {
    if (image == Size.Unspecified || viewport == Size.Unspecified) return Offset.Zero
    if (!image.width.isFinite() || !image.height.isFinite() || image.width <= 0f || image.height <= 0f || viewport.width <= 0f || viewport.height <= 0f) return Offset.Zero
    val fit = minOf(viewport.width / image.width, viewport.height / image.height)
    return Offset(((image.width * fit * zoom - viewport.width) / 2f).coerceAtLeast(0f),
        ((image.height * fit * zoom - viewport.height) / 2f).coerceAtLeast(0f))
}

@Composable
fun AnimeCoverViewer(title: String, imageUrl: String, onDismiss: () -> Unit) {
    var zoom by remember(imageUrl) { mutableFloatStateOf(1f) }
    var pan by remember(imageUrl) { mutableStateOf(Offset.Zero) }
    var imageSize by remember(imageUrl) { mutableStateOf(Size.Zero) }
    var viewport by remember { mutableStateOf(Size.Zero) }
    fun updateZoom(value: Float, offset: Offset = pan) {
        zoom = value.coerceIn(1f, 4f)
        val bounds = coverPanBounds(imageSize, viewport, zoom)
        pan = Offset(offset.x.coerceIn(-bounds.x, bounds.x), offset.y.coerceIn(-bounds.y, bounds.y))
    }
    val transform = rememberTransformableState { zoomChange, panChange, _ -> updateZoom(zoom * zoomChange, pan + panChange) }
    LaunchedEffect(viewport, imageSize) { updateZoom(zoom) }
    Dialog(onDismiss, DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(Color.Black).systemBarsPadding().testTag("anime-cover-viewer")) {
            Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(title, Modifier.weight(1f), color = Color.White, style = MaterialTheme.typography.titleMedium,
                    maxLines = 2, overflow = TextOverflow.Ellipsis)
                IconButton(onClick = { updateZoom(1f, Offset.Zero) }) { Icon(AniIcons.RotateCcw, "Restablecer zoom", tint = Color.White) }
                IconButton(onDismiss) { Icon(AniIcons.X, "Cerrar portada", tint = Color.White) }
            }
            Box(Modifier.weight(1f).fillMaxWidth().clipToBounds()
                .onSizeChanged { viewport = Size(it.width.toFloat(), it.height.toFloat()) }
                .transformable(transform), contentAlignment = Alignment.Center) {
                AsyncImage(imageUrl, "Portada ampliada de $title", Modifier.fillMaxSize().graphicsLayer {
                    scaleX = zoom; scaleY = zoom; translationX = pan.x; translationY = pan.y
                }, contentScale = ContentScale.Fit, onSuccess = { imageSize = it.painter.intrinsicSize })
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { updateZoom(zoom - .5f) }, enabled = zoom > 1f, modifier = Modifier.semantics { contentDescription = "Alejar portada" }) { Text("−", color = if (zoom > 1f) Color.White else Color.Gray, style = MaterialTheme.typography.titleLarge) }
                Text("${(zoom * 100).toInt()}%", color = Color.White, modifier = Modifier.testTag("cover-zoom"))
                TextButton(onClick = { updateZoom(zoom + .5f) }, enabled = zoom < 4f, modifier = Modifier.semantics { contentDescription = "Acercar portada" }) { Text("+", color = if (zoom < 4f) Color.White else Color.Gray, style = MaterialTheme.typography.titleLarge) }
            }
        }
    }
}
