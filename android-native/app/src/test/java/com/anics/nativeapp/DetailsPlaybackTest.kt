package com.anics.nativeapp

import com.anics.nativeapp.data.local.HistoryEntity
import com.anics.nativeapp.ffi.NativeAnimeDetails
import com.anics.nativeapp.ffi.NativeEpisode
import com.anics.nativeapp.ui.viewmodels.detailsPlaybackAction
import org.junit.Assert.*
import org.junit.Test

class DetailsPlaybackTest {
    companion object {
        fun details() = NativeAnimeDetails(title = "Serie temporada 1", url = "anime", thumbnailUrl = "", synopsis = "",
            genres = emptyList(), status = null, animeType = null, studio = null, duration = null,
            totalEpisodes = null, season = null, broadcast = null, languages = null, year = null, rating = null,
            episodes = (6 downTo 1).map { NativeEpisode(it.toUInt(), null, "ep$it", null, false, null) }, source = "jkanime")
    }

    private fun row(number: Int = 4, progress: Double? = .5, completed: Boolean = false) = HistoryEntity(
        profileId = "default", animeTitle = "Serie temporada 1", animeUrl = "anime", episodeNumber = number,
        episodeUrl = "ep$number", watchProgress = progress, completed = completed, lastWatchedAt = 1_000L)

    @Test fun noHistoryStartsAtFirstEpisodeRegardlessOfCatalogueOrder() {
        val action = detailsPlaybackAction(details(), emptyList(), "default")!!
        assertEquals(1u, action.episode.number)
        assertEquals("Reproducir episodio 1", action.label)
    }

    @Test fun incompleteFourthEpisodeResumesTheSameEpisode() {
        val action = detailsPlaybackAction(details(), listOf(row()), "default")!!
        assertEquals(4u, action.episode.number)
        assertEquals("Reanudar episodio 4", action.label)
    }

    @Test fun completedOrImportedProgressContinuesAtTheFifthEpisode() {
        listOf(row(completed = true), row(progress = .9), row(progress = null).copy(progressSeconds = 950, durationSeconds = 1_000)).forEach { saved ->
            val action = detailsPlaybackAction(details(), listOf(saved), "default")!!
            assertEquals(5u, action.episode.number)
            assertEquals("Continuar episodio 5", action.label)
        }
    }

    @Test fun latestWatchWinsOverHighestEpisodeNumberAndCompletedSuccessorsAreSkipped() {
        val action = detailsPlaybackAction(details(), listOf(row(completed = true), row(2).copy(lastWatchedAt = 2_000)), "default")!!
        assertEquals(2u, action.episode.number)
        val skip = detailsPlaybackAction(details(), listOf(row(completed = true), row(5, 1.0).copy(lastWatchedAt = 500)), "default")!!
        assertEquals(6u, skip.episode.number)
    }

    @Test fun profilesSeasonsAndUnrelatedNonLatinTitlesDoNotMix() {
        val otherProfile = row().copy(profileId = "other")
        val otherSeason = row().copy(animeUrl = "other-anime", episodeUrl = "other-ep", animeTitle = "Serie temporada 2")
        assertEquals(1u, detailsPlaybackAction(details(), listOf(otherProfile, otherSeason), "default")!!.episode.number)
        assertEquals(4u, detailsPlaybackAction(details(), listOf(otherProfile), "other")!!.episode.number)
        val japanese = details().copy(title = "進撃の巨人")
        val chineseHistory = row().copy(animeTitle = "斗破苍穹", animeUrl = "other", episodeUrl = "other/4")
        assertEquals(1u, detailsPlaybackAction(japanese, listOf(chineseHistory), "default")!!.episode.number)
    }

    @Test fun localAndCanonicalHistoryCanResumeTheOnlineEpisode() {
        val local = row().copy(animeTitle = "Serie S1", animeUrl = "/Videos/serie", episodeUrl = "/Videos/serie/4.mp4", source = "local")
        assertEquals(4u, detailsPlaybackAction(details(), listOf(local), "default")!!.episode.number)
        val canonical = row().copy(animeTitle = "Old title", animeUrl = "anime/")
        assertEquals(4u, detailsPlaybackAction(details(), listOf(canonical), "default")!!.episode.number)
    }

    @Test fun lastCompletedEpisodeCanBeReplayedAndMissingEpisodesStayDisabled() {
        val action = detailsPlaybackAction(details(), listOf(row(6, 1.0)), "default")!!
        assertEquals("Volver a ver episodio 6", action.label)
        assertNull(detailsPlaybackAction(details().copy(episodes = emptyList()), listOf(row()), "default"))
    }
}
