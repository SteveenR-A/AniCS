package com.anics.nativeapp

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.anics.nativeapp.ui.components.AniIcons
import com.anics.nativeapp.ui.screens.AnimeDetailActions
import com.anics.nativeapp.ui.screens.AnimeSynopsis
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
class AnimeDetailContentTest {
    @get:Rule val compose = createComposeRule()

    @Test fun compactActionsPlaySaveAndOpenBatchForASingleEpisode() {
        var played = false
        var batch = false
        compose.setContent { AniCSTheme("rosepine") { Surface {
            var saved by remember { mutableStateOf(false) }
            AnimeDetailActions("Ver ep. 1", saved, { played = true }, { saved = !saved }, { batch = true }, Modifier.padding(16.dp))
        } } }
        compose.onNodeWithText("Ver ep. 1").assertIsDisplayed().performClick()
        compose.onNodeWithContentDescription("Guardar favorito").assertIsDisplayed().performClick()
        compose.onNodeWithContentDescription("Quitar favorito").assertIsDisplayed()
        compose.onNodeWithText("Guardado").assertIsDisplayed()
        compose.onNodeWithContentDescription("Descargar lote / temporada").assertIsDisplayed().performClick()
        compose.runOnIdle { assertTrue(played); assertTrue(batch) }
        val play = compose.onNodeWithText("Ver ep. 1").fetchSemanticsNode().boundsInRoot
        val save = compose.onNodeWithContentDescription("Quitar favorito").fetchSemanticsNode().boundsInRoot
        assertTrue("Small phones must put secondary actions below playback", save.top >= play.bottom)
    }

    @Test fun animeWithoutEpisodesKeepsFavoriteButDisablesPlaybackAndBatch() {
        var saved = false
        compose.setContent { AniCSTheme { Surface {
            AnimeDetailActions("Sin episodios", false, null, { saved = true }, null)
        } } }
        compose.onNodeWithText("Sin episodios").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Descargar lote / temporada").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Guardar favorito").assertIsEnabled().performClick()
        compose.runOnIdle { assertTrue(saved) }
    }

    @Test fun longSynopsisExpandsAndCollapsesWhileShortSynopsisNeedsNoToggle() {
        val longSynopsis = (1..12).joinToString("\n") { "Parte $it de la sinopsis." }
        compose.setContent { AniCSTheme { Surface {
            Column { AnimeSynopsis(longSynopsis); AnimeSynopsis("Una aventura corta.") }
        } } }
        compose.onAllNodesWithText("Leer sinopsis completa").assertCountEquals(1)
        compose.onNodeWithText("Leer sinopsis completa").performClick()
        compose.onNodeWithText("Ver menos").assertIsDisplayed().performClick()
        compose.onNodeWithText("Leer sinopsis completa").assertIsDisplayed()
        compose.onNodeWithText("Una aventura corta.").assertIsDisplayed()
    }

    @Test fun favoriteStateUsesHeartFilledAndShowsGuardado() {
        compose.setContent { AniCSTheme("cyberpunk") { Surface {
            AnimeDetailActions("Ver ep. 1", true, {}, {}, {})
        } } }
        compose.onNodeWithContentDescription("Quitar favorito").assertIsDisplayed()
        compose.onNodeWithText("Guardado").assertIsDisplayed()
        assertNotNull(AniIcons.HeartFilled)
        assertNotNull(AniIcons.Heart)
        assertNotNull(AniIcons.LayoutGrid)
        assertNotNull(AniIcons.List)
    }
}
