package com.anics.nativeapp.downloads

import com.anics.nativeapp.data.local.HistoryEntity
import com.anics.nativeapp.sync.SyncContract

data class EpisodeKey(val title: String, val number: Int) {
    companion object {
        fun of(title: String, number: Int) = EpisodeKey(SyncContract.titleKey(title), number)
    }
}

enum class EpisodeWatchState(val label: String) {
    UNWATCHED("Sin ver"), IN_PROGRESS("En progreso"), WATCHED("Visto")
}

data class EpisodeWatchProgress(val state: EpisodeWatchState = EpisodeWatchState.UNWATCHED, val fraction: Float = 0f) {
    companion object {
        fun from(history: HistoryEntity?): EpisodeWatchProgress {
            if (history == null) return EpisodeWatchProgress()
            val fraction = (history.watchProgress?.takeIf { it.isFinite() }
                ?: if (history.durationSeconds > 0) history.progressSeconds.toDouble() / history.durationSeconds else 0.0)
                .coerceIn(0.0, 1.0).toFloat()
            return when {
                history.completed || fraction >= .9f -> EpisodeWatchProgress(EpisodeWatchState.WATCHED, 1f)
                history.progressSeconds > 0 || fraction > 0 -> EpisodeWatchProgress(EpisodeWatchState.IN_PROGRESS, fraction)
                else -> EpisodeWatchProgress()
            }
        }
    }
}
