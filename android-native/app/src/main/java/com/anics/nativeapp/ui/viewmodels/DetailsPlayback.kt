package com.anics.nativeapp.ui.viewmodels

import com.anics.nativeapp.data.local.HistoryEntity
import com.anics.nativeapp.ffi.NativeAnimeDetails
import com.anics.nativeapp.ffi.NativeEpisode
import java.text.Normalizer
import java.util.Locale

data class DetailsPlaybackAction(val episode: NativeEpisode, val label: String)

private fun String.canonicalUrl() = trim().trimEnd('/')
private fun String.titleKey(): String = Normalizer.normalize(lowercase(Locale.ROOT), Normalizer.Form.NFD)
    .replace(Regex("\\p{M}+"), "").replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
    .replace(Regex("\\b(temporada|temp|s)\\s*(\\d+)\\b"), "season $2")
    .replace(Regex("\\b(1st|first|primer[ao]?)\\s+season\\b"), "season 1")
    .replace(Regex("\\b(2nd|second|segund[ao]?)\\s+season\\b"), "season 2")
    .replace(Regex("\\b(3rd|third|tercer[ao]?)\\s+season\\b"), "season 3")
    .replace(Regex("\\b(4th|fourth|cuart[ao]?)\\s+season\\b"), "season 4")
    .replace(Regex("\\b(5th|fifth|quint[ao]?)\\s+season\\b"), "season 5")
    .replace(" ", "")

internal fun detailsHistory(details: NativeAnimeDetails, rows: List<HistoryEntity>, profileId: String): List<HistoryEntity> {
    val episodeUrls = details.episodes.map { it.url.canonicalUrl() }.filter { it.isNotEmpty() }.toSet()
    val title = details.title.titleKey()
    return rows.filter { it.profileId == profileId && (
        (it.animeUrl.isNotBlank() && it.animeUrl.canonicalUrl() == details.url.canonicalUrl()) ||
        (it.episodeUrl.isNotBlank() && it.episodeUrl.canonicalUrl() in episodeUrls) ||
        (title.isNotEmpty() && it.animeTitle.titleKey() == title)
    ) }.sortedWith(compareByDescending<HistoryEntity> { it.lastWatchedAt }.thenByDescending { it.episodeNumber })
}

private fun HistoryEntity.progress(): Double = watchProgress
    ?: if (durationSeconds > 0) progressSeconds.toDouble() / durationSeconds else 0.0
private fun HistoryEntity.isComplete() = completed || progress() >= .9

internal fun enrichDetailsEpisodes(details: NativeAnimeDetails, rows: List<HistoryEntity>, profileId: String): List<NativeEpisode> {
    val matched = detailsHistory(details, rows, profileId)
    return details.episodes.map { episode ->
        val saved = matched.firstOrNull { it.episodeUrl.canonicalUrl() == episode.url.canonicalUrl() || it.episodeNumber == episode.number.toInt() }
        episode.copy(watched = saved?.isComplete() ?: false, watchProgress = saved?.progress())
    }
}

internal fun detailsPlaybackAction(details: NativeAnimeDetails, rows: List<HistoryEntity>, profileId: String): DetailsPlaybackAction? {
    val episodes = enrichDetailsEpisodes(details, rows, profileId).sortedBy { it.number }
    if (episodes.isEmpty()) return null
    val last = detailsHistory(details, rows, profileId).firstOrNull()
        ?: return DetailsPlaybackAction(episodes.first(), "Reproducir episodio ${episodes.first().number}")
    val current = episodes.firstOrNull { it.url.canonicalUrl() == last.episodeUrl.canonicalUrl() }
        ?: episodes.firstOrNull { it.number.toInt() == last.episodeNumber }
    if (!last.isComplete() && current != null) return DetailsPlaybackAction(current, "Reanudar episodio ${current.number}")
    val next = episodes.firstOrNull { it.number.toInt() > (current?.number?.toInt() ?: last.episodeNumber) && !it.watched }
    if (next != null) return DetailsPlaybackAction(next, "Continuar episodio ${next.number}")
    val replay = current ?: episodes.last()
    return DetailsPlaybackAction(replay, "Volver a ver episodio ${replay.number}")
}
