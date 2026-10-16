package com.anics.nativeapp

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import com.anics.nativeapp.ui.screens.AnimeTechnicalDetails
import com.anics.nativeapp.ui.screens.technicalEpisodeCount
import com.anics.nativeapp.ui.theme.AniCSTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-port")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AnimeTechnicalDetailsTest {
    @get:Rule val compose = createComposeRule()

    @Test fun displaysCatalogueMetadataWithTheReportedEpisodeCount() {
        val details = DetailsPlaybackTest.details().copy(totalEpisodes = "12", studio = "ENGI", duration = "24 min.",
            broadcast = "Miércoles, 07 de Octubre de 2026", languages = "Japonés")
        compose.setContent { AniCSTheme { Surface { AnimeTechnicalDetails(details) } } }
        listOf("TOTAL EPISODIOS", "12 episodios", "ESTUDIO", "ENGI", "DURACIÓN", "24 min.",
            "EMISIÓN", "Miércoles, 07 de Octubre de 2026", "AUDIO", "Japonés").forEach {
            compose.onNodeWithText(it, useUnmergedTree = true).assertIsDisplayed()
        }
        val episodes = compose.onNodeWithText("12 episodios", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val studio = compose.onNodeWithText("ENGI", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        assertTrue("Regular phones should use more than one column", studio.left > episodes.left)
    }

    @Test fun absentFieldsAreOmittedAndAvailableEpisodesAreUsedAsFallback() {
        compose.setContent { AniCSTheme { Surface {
            AnimeTechnicalDetails(DetailsPlaybackTest.details().copy(totalEpisodes = "0", studio = " ", duration = ""))
        } } }
        compose.onNodeWithText("6 episodios", useUnmergedTree = true).assertIsDisplayed()
        listOf("ESTUDIO", "DURACIÓN", "EMISIÓN", "TEMPORADA", "AUDIO").forEach {
            compose.onNodeWithText(it, useUnmergedTree = true).assertDoesNotExist()
        }
        assertEquals("Por estrenar", technicalEpisodeCount(null, 0, "Por estrenar"))
        assertEquals("Desconocido", technicalEpisodeCount(null, 0, null))
        assertEquals("1 episodio", technicalEpisodeCount("1", 0, null))
    }

    @Test @Config(qualifiers = "w320dp-h640dp-port") fun largeTextUsesOneColumnAndLongValuesRemainScrollable() {
        val studio = "Un estudio de animación con un nombre largo"
        val details = DetailsPlaybackTest.details().copy(totalEpisodes = "2", studio = studio,
            season = "Otoño de 2026", languages = "Japonés y español")
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.6f)) {
                AniCSTheme("light") { Surface {
                    AnimeTechnicalDetails(details, Modifier.verticalScroll(rememberScrollState()))
                } }
            }
        }
        val episodes = compose.onNodeWithText("2 episodios", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val studioBounds = compose.onNodeWithText(studio, useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        assertTrue("Large fonts should stack the cards", studioBounds.top >= episodes.bottom)
        compose.onNodeWithText("Japonés y español", useUnmergedTree = true).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Otoño de 2026", useUnmergedTree = true).assertExists()
    }
}
