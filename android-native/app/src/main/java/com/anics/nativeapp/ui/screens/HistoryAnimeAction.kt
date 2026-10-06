package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.anics.nativeapp.data.local.HistoryEntity
import com.anics.nativeapp.ui.components.AniIcons

internal fun historyOnlineEntry(entries: List<HistoryEntity>): HistoryEntity? = entries.filter { entry ->
    entry.source.isNotBlank() && !entry.source.trim().equals("local", true) && runCatching {
        val uri = java.net.URI(entry.animeUrl.trim())
        uri.scheme?.lowercase(java.util.Locale.ROOT) in listOf("http", "https") && !uri.host.isNullOrBlank()
    }.getOrDefault(false)
}.maxByOrNull { it.lastWatchedAt }

/** Use the anime URL and its paired source; a local file/episode URL is never a catalog target. */
@Composable
fun HistoryAnimeAction(entries: List<HistoryEntity>, onAnime: (String, String) -> Unit, onSearch: (String) -> Unit) {
    val latest = entries.maxByOrNull { it.lastWatchedAt }
    val online = historyOnlineEntry(entries)
    TextButton(enabled = latest != null, onClick = {
        if (online != null) onAnime(online.animeUrl.trim(), online.source.trim())
        else latest?.let { onSearch(it.animeTitle) }
    }) {
        Icon(if (online != null) AniIcons.Tv else AniIcons.Search, null, Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(if (online != null) "Ver anime en línea" else "Buscar anime en línea")
    }
}
