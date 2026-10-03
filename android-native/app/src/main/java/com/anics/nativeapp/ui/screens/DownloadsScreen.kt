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
import com.anics.nativeapp.ui.components.*
import com.anics.nativeapp.ui.viewmodels.DownloadsViewModel

@Composable
fun DownloadsScreen(viewModel: DownloadsViewModel, onPlayOffline: (String, String, Int) -> Unit, modifier: Modifier = Modifier,
    onAnime: (String, String) -> Unit = { _, _ -> }, onSearch: (String) -> Unit = {}) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var queue by remember { mutableStateOf(false) }
    var remove by remember { mutableStateOf<DownloadEntity?>(null) }
    var deleteFile by remember { mutableStateOf(false) }
    val databasePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(viewModel::importTauriDatabase) }
    val groups = state.completedDownloads.groupBy { com.anics.nativeapp.sync.SyncContract.titleKey(it.animeTitle) }.values.toList()
    val folder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) try {
            try { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
            catch (_: SecurityException) { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            viewModel.selectFolder(uri.toString())
        } catch (e: Exception) { viewModel.showMessage(e.localizedMessage ?: "No se pudo acceder a la carpeta") }
    }
    LaunchedEffect(Unit) { viewModel.refreshStorage() }
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { SectionTitle("Descargas", "Tu biblioteca sin conexión", AniIcons.Download) }
        if (state.totalSpace > 0) item {
            AniPanel {
                SectionTitle("Almacenamiento del dispositivo", icon = AniIcons.HardDrive, action = { IconButton(onClick = viewModel::refreshStorage) { Icon(AniIcons.RefreshCw, "Actualizar almacenamiento") } })
                Text("${formatBytes(state.freeSpace)} libres de ${formatBytes(state.totalSpace)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LinearProgressIndicator(progress = { ((state.totalSpace - state.freeSpace).toDouble() / state.totalSpace).toFloat().coerceIn(0f,1f) }, modifier = Modifier.fillMaxWidth().height(7.dp).clip(RoundedCornerShape(50)))
                Text("Videos de AniCS: ${formatBytes(state.completedDownloads.sumOf { it.downloadedBytes })}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { folder.launch(null) }, modifier = Modifier.weight(1f), enabled = !state.isScanning) { Icon(AniIcons.Folder, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Carpeta") }
                OutlinedButton(onClick = viewModel::refreshLibrary, modifier = Modifier.weight(1f), enabled = !state.isScanning && state.folderUri.isNotBlank()) { Icon(AniIcons.RefreshCw, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Buscar videos") }
            }
        }
        state.message?.let { message -> item { Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
        item { TextButton(onClick = { databasePicker.launch(arrayOf("application/octet-stream", "application/vnd.sqlite3", "application/x-sqlite3", "*/*")) }) { Text("Importar metadatos de Tauri (anics.db)") } }
        if (state.isScanning) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AniPill("Animes (${groups.size})", !queue, { queue = false }, Modifier.weight(1f), AniIcons.Folder)
                AniPill("Cola (${state.activeDownloads.size})", queue, { queue = true }, Modifier.weight(1f), AniIcons.Download)
            }
        }
        if (queue) {
            if (state.activeDownloads.isEmpty()) item { AniEmptyState("No hay descargas pendientes", "Elige un episodio y un servidor MP4 para descargarlo.", AniIcons.Download) }
            items(state.activeDownloads, key = { it.id }) { row ->
                ActiveDownloadItem(row, { viewModel.pauseDownload(row.id) }, { viewModel.resumeDownload(row.id) }, { deleteFile = false; remove = row })
            }
        } else {
            if (groups.isEmpty()) item { AniEmptyState("Tu biblioteca está vacía", "Selecciona la carpeta Anime para cargar tus videos existentes.", AniIcons.Folder, "Elegir carpeta", { folder.launch(null) }) }
            items(groups, key = { com.anics.nativeapp.sync.SyncContract.titleKey(it.first().animeTitle) }) { rows ->
                var expanded by remember { mutableStateOf(false) }
                val title = rows.first().animeTitle
                val cover = rows.firstNotNullOfOrNull { it.thumbnailUrl.takeIf(String::isNotBlank) } ?: state.covers[com.anics.nativeapp.sync.SyncContract.titleKey(title)]
                AniPanel {
                    Row(Modifier.fillMaxWidth().clickable { expanded = !expanded }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (cover != null) AsyncImage(cover, title, Modifier.width(42.dp).height(62.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
                        else Box(Modifier.width(42.dp).height(62.dp).background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) { Icon(AniIcons.Tv, null, tint = MaterialTheme.colorScheme.primary) }
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text(title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                            Text("${rows.size} eps · ${formatBytes(rows.sumOf { it.downloadedBytes })}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall)
                        }
                        Icon(AniIcons.ChevronDown, if (expanded) "Ocultar episodios" else "Mostrar episodios", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = { val anime = rows.firstOrNull { it.animeUrl.startsWith("http") }; if (anime != null) onAnime(anime.animeUrl, anime.source) else onSearch(title) }) {
                        Icon(AniIcons.Tv, null, Modifier.size(15.dp)); Spacer(Modifier.width(6.dp)); Text("Ver anime / descargar más")
                    }
                    if (expanded) rows.sortedBy { it.episodeNumber }.forEach { row ->
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        Row(Modifier.fillMaxWidth().clickable { onPlayOffline(row.outputPath, row.animeTitle, row.episodeNumber) }, verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Episodio ${row.episodeNumber}", style = MaterialTheme.typography.bodyMedium)
                                Text(formatBytes(row.downloadedBytes), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            IconButton(onClick = { onPlayOffline(row.outputPath, row.animeTitle, row.episodeNumber) }) { Icon(AniIcons.Play, "Reproducir episodio ${row.episodeNumber}", tint = MaterialTheme.colorScheme.primary) }
                            IconButton(onClick = { deleteFile = false; remove = row }) { Icon(AniIcons.X, "Quitar de la biblioteca", Modifier.size(18.dp)) }
                        }
                    }
                }
            }
        }
    }
    remove?.let { row -> AlertDialog(onDismissRequest = { remove = null }, title = { Text(if (deleteFile) "Eliminar video del dispositivo" else if (row.status == "completed") "Quitar de la biblioteca" else "Cancelar descarga") },
        text = { Column {
            Text(if (deleteFile) "Se borrará el archivo del episodio ${row.episodeNumber}." else if (row.status == "completed") "Se quitará el registro. El video se conserva y puede volver a detectarse." else "Se eliminará el archivo parcial de este episodio.")
            if (row.status == "completed" && !deleteFile) TextButton(onClick = { deleteFile = true }) { Text("También quiero eliminar el video", color = MaterialTheme.colorScheme.error) }
        } },
        confirmButton = { TextButton(onClick = { if (deleteFile) viewModel.deleteVideo(row.id) else viewModel.cancelDownload(row.id); remove = null }) { Text(if (deleteFile) "Borrar video" else "Confirmar") } }, dismissButton = { TextButton(onClick = { remove = null }) { Text("Volver") } }) }
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
        LinearProgressIndicator(progress = { download.progress.coerceIn(0f,1f) }, modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(50)))
        Text("${(download.progress * 100).toInt()}% · ${formatBytes(download.downloadedBytes)}" + (download.totalBytes?.let { " / ${formatBytes(it)}" } ?: "") +
            (if (download.status == "downloading") " · ${formatBytes(download.speedBytesPerSecond)}/s" else ""), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
