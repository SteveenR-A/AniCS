package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.anics.nativeapp.data.local.DownloadEntity
import com.anics.nativeapp.sync.SyncContract
import com.anics.nativeapp.ui.components.AniIcons

fun downloadsForAnime(rows: List<DownloadEntity>, title: String, url: String, source: String): Map<Int, DownloadEntity> {
    val titleKey = SyncContract.titleKey(title)
    return rows.filter { it.status in listOf("queued", "downloading", "paused", "failed", "completed") &&
        (SyncContract.titleKey(it.animeTitle) == titleKey || it.source == source && it.animeUrl.isNotBlank() && it.animeUrl.trimEnd('/') == url.trimEnd('/')) }
        .groupBy { it.episodeNumber }.mapValues { (_, matches) -> matches.maxBy { it.queueOrder } }
}

fun episodeDownloadLabel(row: DownloadEntity): String = when (row.status) {
    "queued" -> "En cola"
    "downloading" -> if (row.totalBytes != null && row.totalBytes > 0) "Descargando ${(row.progress.coerceIn(0f, 1f) * 100).toInt()}%" else "Preparando descarga…"
    "paused" -> "Descarga pausada"
    "failed" -> "Falló la descarga · Reintentar"
    "completed" -> "Descargado"
    else -> ""
}

@Composable
fun EpisodeDownloadButton(episode: UInt, download: DownloadEntity?, onClick: () -> Unit) {
    val status = download?.status
    val busy = status == "queued" || status == "downloading"
    val label = when (status) {
        "paused" -> "Reanudar descarga episodio $episode"
        "failed" -> "Reintentar descarga episodio $episode"
        null -> "Descargar episodio $episode"
        else -> "${episodeDownloadLabel(download!!)} · Episodio $episode"
    }
    IconButton(onClick = onClick, enabled = !busy, modifier = Modifier.size(34.dp).semantics { contentDescription = label }) {
        Box(Modifier.size(24.dp), contentAlignment = Alignment.Center) {
            val tint = if (status == "failed") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
            if (busy || status == "paused") {
                if (status == "queued" || status == "downloading" && (download?.totalBytes == null || download.totalBytes <= 0))
                    CircularProgressIndicator(Modifier.fillMaxSize(), color = tint, strokeWidth = 2.dp)
                else CircularProgressIndicator(progress = { download!!.progress.coerceIn(0f, 1f) }, modifier = Modifier.fillMaxSize(), color = tint, strokeWidth = 2.dp)
            }
            val icon = when (status) {
                "queued" -> AniIcons.Clock
                "paused" -> AniIcons.Pause
                "failed" -> AniIcons.CircleAlert
                "completed" -> AniIcons.Check
                else -> AniIcons.Download
            }
            Icon(icon, null, Modifier.size(if (busy || status == "paused") 12.dp else 16.dp), tint = tint)
        }
    }
}
