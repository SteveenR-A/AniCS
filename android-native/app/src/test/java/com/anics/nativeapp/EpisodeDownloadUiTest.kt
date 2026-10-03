package com.anics.nativeapp

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.anics.nativeapp.data.local.DownloadEntity
import com.anics.nativeapp.ui.screens.*
import com.anics.nativeapp.ui.theme.AniCSTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w320dp-h640dp-port")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class EpisodeDownloadUiTest {
    @get:Rule val compose = createComposeRule()
    private fun row(status: String) = DownloadEntity("task", animeTitle = "Anime", episodeNumber = 1, streamUrl = "", outputPath = "saved.mp4",
        status = status, progress = .42f, downloadedBytes = 420, totalBytes = 1000, createdAt = "2026-10-03")
    @Test fun episodeShowsRealProgressPausedRetryAndCompletionStates() {
        var download by mutableStateOf(row("queued"))
        var clicks = 0
        compose.setContent { AniCSTheme { Surface { Column { EpisodeItem(PlaybackSessionTest.episode(1), {}, onDownload = { clicks++ }, download = download) } } } }
        compose.onNodeWithContentDescription("En cola · Episodio 1").assertIsDisplayed().assertIsNotEnabled()
        compose.runOnIdle { download = row("downloading") }
        compose.onNodeWithText("Descargando 42%").assertIsDisplayed()
        compose.onNodeWithContentDescription("Descargando 42% · Episodio 1").assertIsNotEnabled()
        compose.onNode(hasProgressBarRangeInfo(androidx.compose.ui.semantics.ProgressBarRangeInfo(.42f, 0f..1f))).assertIsDisplayed()
        compose.runOnIdle { download = row("paused") }
        compose.onNodeWithContentDescription("Reanudar descarga episodio 1").performClick()
        compose.runOnIdle { download = row("failed") }
        compose.onNodeWithContentDescription("Reintentar descarga episodio 1").performClick()
        compose.runOnIdle { download = row("completed") }
        compose.onNodeWithText("Descargado").assertIsDisplayed()
        compose.runOnIdle { assertEquals(2, clicks) }
    }
    @Test fun progressDoesNotAppearOnEpisodesFromOtherAnimeAndLatestTaskWins() {
        val old = row("failed").copy(queueOrder = 1)
        val active = row("downloading").copy(id = "new", queueOrder = 2)
        val another = row("downloading").copy(id = "another", animeTitle = "Different anime", queueOrder = 3)
        val local = row("completed").copy(id = "local", animeTitle = "Anime", episodeNumber = 2)
        val matches = downloadsForAnime(listOf(old, active, another, local), "Anime", "https://catalog/anime", "jkanime")
        assertEquals(listOf(1, 2), matches.keys.sorted())
        assertEquals("new", matches[1]?.id); assertEquals("completed", matches[2]?.status)
        assertTrue(downloadsForAnime(listOf(active.copy(status = "canceled")), "Anime", "", "jkanime").isEmpty())
    }
}
