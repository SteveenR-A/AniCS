package com.anics.nativeapp

import androidx.compose.material3.Surface
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.anics.nativeapp.data.local.HistoryEntity
import com.anics.nativeapp.ui.screens.HistoryAnimeAction
import com.anics.nativeapp.ui.screens.historyOnlineEntry
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
class HistoryAnimeActionTest {
    @get:Rule val compose = createComposeRule()
    private fun row(url: String, source: String = "jkanime", time: Long = 1) = HistoryEntity(
        animeTitle = "Fate/Stay Night & UBW", animeUrl = url, episodeNumber = 3,
        episodeUrl = "https://catalog.example/episode/3", source = source, lastWatchedAt = time)

    @Test fun opensAnimeDetailsWithSavedSourceInsteadOfTheEpisodeUrl() {
        val entry = row("https://catalog.example/anime?title=Fate%2FStay", "otakustv")
        var opened: Pair<String, String>? = null
        compose.setContent { AniCSTheme { Surface {
            HistoryAnimeAction(listOf(entry), { url, source -> opened = url to source }, { fail("Search should not replace a valid saved URL") })
        } } }
        compose.onNodeWithText("Ver anime en línea").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(entry.animeUrl to entry.source, opened) }
    }

    @Test fun mostRecentOfflinePlaybackCanStillUseAnOlderOnlineAnimeEntry() {
        val online = row("https://donghua.example/series", "mundodonghua", 10)
        val local = row("local://Fate", "local", 20).copy(episodeUrl = "/storage/Anime/03.mp4")
        var opened: Pair<String, String>? = null
        compose.setContent { AniCSTheme { Surface {
            HistoryAnimeAction(listOf(local, online), { url, source -> opened = url to source }, { fail("Online entry exists") })
        } } }
        compose.onNodeWithText("Ver anime en línea").performClick()
        compose.runOnIdle { assertEquals(online.animeUrl to online.source, opened) }
    }

    @Test fun localOrMissingAnimeUrlSearchesByTitleAndNeverUsesEpisodeUrlAsDetails() {
        val entry = row("local://Fate", "local").copy(episodeUrl = "/storage/Anime/03.mp4")
        var searched: String? = null
        compose.setContent { AniCSTheme { Surface {
            HistoryAnimeAction(listOf(entry), { _, _ -> fail("Local URL must not open details") }, { searched = it })
        } } }
        compose.onNodeWithText("Buscar anime en línea").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(entry.animeTitle, searched) }
        listOf("", "content://videos/3", "/storage/Anime/03.mp4", "anime", "https://").forEach { url ->
            assertNull(historyOnlineEntry(listOf(row(url))))
        }
        assertNull(historyOnlineEntry(listOf(row("https://catalog.example/anime", "local"))))
    }
}
