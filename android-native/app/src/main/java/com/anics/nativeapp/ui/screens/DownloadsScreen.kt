package com.anics.nativeapp.ui.screens

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.anics.nativeapp.data.local.DownloadEntity
import com.anics.nativeapp.downloads.EpisodeKey
import com.anics.nativeapp.downloads.EpisodeWatchProgress
import com.anics.nativeapp.downloads.DownloadSizes
import com.anics.nativeapp.ui.components.*
import com.anics.nativeapp.ui.viewmodels.DownloadsViewModel

@Composable
fun DownloadsScreen(viewModel: DownloadsViewModel, onPlayOffline: (String, String, Int) -> Unit, modifier: Modifier = Modifier,
    onAnime: (String, String) -> Unit = { _, _ -> }, onSearch: (String) -> Unit = {}) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val queue by viewModel.queueVisible.collectAsState()
    var remove by remember { mutableStateOf<DownloadEntity?>(null) }
    var deleteFile by remember { mutableStateOf(true) }
    var removeAnime by remember { mutableStateOf<String?>(null) }
    val groups = state.completedDownloads.groupBy { com.anics.nativeapp.sync.SyncContract.titleKey(it.animeTitle) }.values.toList()
    val folder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) try {
            try { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
            catch (_: SecurityException) { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            viewModel.selectFolder(uri.toString())
        } catch (e: Exception) { viewModel.showMessage(e.localizedMessage ?: "No se pudo acceder a la carpeta") }
    }
    LaunchedEffect(viewModel) { viewModel.onScreenVisible() }
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { SectionTitle("Descargas", "Tu biblioteca sin conexión", AniIcons.Download, action = {
            DownloadOptionsMenu(state.isScanning, state.folderUri.isNotBlank(), { folder.launch(null) },
                viewModel::refreshLibrary, viewModel::refreshStorage)
        }) }
        if (state.totalSpace > 0) item {
            DownloadStorageSummary(state.totalSpace, state.freeSpace, state.completedDownloads.sumOf { it.downloadedBytes })
        }
        state.message?.let { message -> item { Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
        val failed = state.activeDownloads.count { it.status == "failed" }
        if (!queue && failed > 0) item {
            TextButton(onClick = { viewModel.showQueue(true) }) { Text("$failed episodios con errores. Ver errores y reintentar", color = MaterialTheme.colorScheme.error) }
        }
        if (state.isScanning) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AniPill("Animes (${groups.size})", !queue, { viewModel.showQueue(false) }, Modifier.weight(1f), AniIcons.Folder)
                AniPill("Cola (${state.activeDownloads.size})", queue, { viewModel.showQueue(true) }, Modifier.weight(1f), AniIcons.Download)
            }
        }
        if (queue) {
            if (state.activeDownloads.isEmpty()) item { AniEmptyState("No hay descargas pendientes", "Elige un episodio y un servidor compatible para descargarlo.", AniIcons.Download) }
            items(state.activeDownloads, key = { it.id }) { row ->
                ActiveDownloadItem(row, { viewModel.pauseDownload(row.id) }, { viewModel.resumeDownload(row.id) }, { deleteFile = false; remove = row })
            }
        } else {
            if (groups.isEmpty()) item { AniEmptyState("Tu biblioteca está vacía", "Selecciona la carpeta Anime para cargar tus videos existentes.", AniIcons.Folder, "Elegir carpeta", { folder.launch(null) }) }
            items(groups, key = { com.anics.nativeapp.sync.SyncContract.titleKey(it.first().animeTitle) }) { rows ->
                val title = rows.first().animeTitle
                val expanded = com.anics.nativeapp.sync.SyncContract.titleKey(title) in state.expandedAnimeKeys
                val cover = rows.firstNotNullOfOrNull { it.thumbnailUrl.takeIf(String::isNotBlank) }
                    ?: state.covers[com.anics.nativeapp.sync.SyncContract.titleKey(title)]
                    ?: com.anics.nativeapp.downloads.LocalCovers.cdnCover(title).takeIf(String::isNotBlank)
                AniPanel {
                    Row(Modifier.fillMaxWidth().clickable { viewModel.toggleAnime(title) }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (cover != null) AsyncImage(cover, title, Modifier.width(42.dp).height(62.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
                        else Box(Modifier.width(42.dp).height(62.dp).background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) { Icon(AniIcons.Tv, null, tint = MaterialTheme.colorScheme.primary) }
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text(title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                            Text("${rows.size} eps · ${formatBytes(rows.sumOf { it.downloadedBytes })}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall)
                        }
                        IconButton(onClick = { removeAnime = title }) {
                            Icon(AniIcons.Trash2, "Eliminar anime y descargas", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error)
                        }
                        Icon(AniIcons.ChevronDown, if (expanded) "Ocultar episodios" else "Mostrar episodios", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (expanded) TextButton(onClick = { val anime = rows.firstOrNull { it.animeUrl.startsWith("http") }; if (anime != null) onAnime(anime.animeUrl, anime.source) else onSearch(title) }) {
                        Icon(AniIcons.Tv, null, Modifier.size(15.dp)); Spacer(Modifier.width(6.dp)); Text("Ver en línea")
                    }
                    if (expanded) rows.sortedBy { it.episodeNumber }.forEach { row ->
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        Row(Modifier.fillMaxWidth().clickable { onPlayOffline(row.outputPath, row.animeTitle, row.episodeNumber) }, verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Episodio ${row.episodeNumber}", style = MaterialTheme.typography.bodyMedium)
                                Text(formatBytes(row.downloadedBytes), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                EpisodeWatchIndicator(state.watchProgress[EpisodeKey.of(row.animeTitle, row.episodeNumber)] ?: EpisodeWatchProgress())
                            }
                            IconButton(onClick = { onPlayOffline(row.outputPath, row.animeTitle, row.episodeNumber) }) { Icon(AniIcons.Play, "Reproducir episodio ${row.episodeNumber}", tint = MaterialTheme.colorScheme.primary) }
                            IconButton(onClick = { deleteFile = true; remove = row }) { Icon(AniIcons.Trash2, "Eliminar episodio", Modifier.size(18.dp)) }
                        }
                    }
                }
            }
        }
    }
    removeAnime?.let { animeTitle ->
        AlertDialog(
            onDismissRequest = { removeAnime = null },
            title = { Text("Eliminar anime descargado") },
            text = { Text("Se eliminarán todos los episodios descargados de '$animeTitle' y se borrará su carpeta del dispositivo.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteAnime(animeTitle)
                    removeAnime = null
                }) {
                    Text("Eliminar anime", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { removeAnime = null }) { Text("Volver") } }
        )
    }
    remove?.let { row ->
        val isCompleted = row.status == "completed"
        AlertDialog(
            onDismissRequest = { remove = null },
            title = {
                Text(
                    if (isCompleted) {
                        if (deleteFile) "Eliminar video del dispositivo" else "Quitar de la biblioteca"
                    } else "Cancelar descarga"
                )
            },
            text = {
                Column {
                    Text(
                        if (isCompleted) {
                            if (deleteFile) "Se borrará el archivo del episodio ${row.episodeNumber} de '${row.animeTitle}' de tu dispositivo."
                            else "Se quitará el registro. El archivo de video se conserva en el dispositivo."
                        } else "Se eliminará el archivo parcial de este episodio."
                    )
                    if (isCompleted) {
                        Spacer(Modifier.height(4.dp))
                        if (deleteFile) {
                            TextButton(onClick = { deleteFile = false }) {
                                Text("Solo quitar de la biblioteca (conservar archivo)", style = MaterialTheme.typography.bodySmall)
                            }
                        } else {
                            TextButton(onClick = { deleteFile = true }) {
                                Text("También quiero eliminar el archivo del video", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    if (isCompleted) {
                        if (deleteFile) viewModel.deleteVideo(row.id)
                        else viewModel.cancelDownload(row.id)
                    } else {
                        viewModel.cancelDownload(row.id)
                    }
                    remove = null
                }) {
                    Text(
                        if (isCompleted) {
                            if (deleteFile) "Borrar video" else "Confirmar"
                        } else "Confirmar",
                        color = if (deleteFile || !isCompleted) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                    )
                }
            },
            dismissButton = { TextButton(onClick = { remove = null }) { Text("Volver") } }
        )
    }
}

@Composable
fun ActiveDownloadItem(download: DownloadEntity, onPause: () -> Unit, onResume: () -> Unit, onCancel: () -> Unit, modifier: Modifier = Modifier) {
    AniPanel(modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(download.animeTitle, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("Episodio ${download.episodeNumber} · ${when(download.status) { "downloading" -> "Descargando"; "paused" -> "Pausada"; "failed" -> "Falló"; else -> "En cola" }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (download.status in listOf("downloading", "queued")) IconButton(onClick = onPause) { Icon(AniIcons.Pause, "Pausar descarga") }
            else if (download.status in listOf("paused","failed")) IconButton(onClick = onResume) { Icon(AniIcons.Play, "Reanudar descarga") }
            IconButton(onClick = onCancel) { Icon(AniIcons.X, "Cancelar descarga") }
        }
        download.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        val bar = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(50))
        val size = DownloadSizes.info(download.downloadedBytes, download.totalBytes, download.progress)
        if (download.status == "downloading" && size.fraction == null) LinearProgressIndicator(modifier = bar)
        else LinearProgressIndicator(progress = { size.fraction ?: 0f }, modifier = bar, drawStopIndicator = {})
        Text(downloadTransferText(download), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
internal fun EpisodeWatchIndicator(progress: EpisodeWatchProgress) {
    Column(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(progress.state.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        LinearProgressIndicator(progress = { progress.fraction }, modifier = Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(50)), drawStopIndicator = {})
    }
}
