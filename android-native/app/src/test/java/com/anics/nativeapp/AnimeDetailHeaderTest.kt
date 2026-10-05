package com.anics.nativeapp

import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalTextToolbar
import androidx.compose.ui.platform.TextToolbar
import androidx.compose.ui.platform.TextToolbarStatus
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.anics.nativeapp.ui.screens.AnimeDetailHeader
import com.anics.nativeapp.ui.screens.coverPanBounds
import com.anics.nativeapp.ui.theme.AniCSTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import android.widget.Magnifier

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w320dp-h640dp-port", shadows = [SelectionMagnifierShadow::class])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AnimeDetailHeaderTest {
    @get:Rule val compose = createComposeRule()

    @Test fun longPressTitleOffersCopyAndCopiesItsText() {
        var copy: (() -> Unit)? = null
        val toolbar = object : TextToolbar {
            override var status = TextToolbarStatus.Hidden
            override fun hide() { status = TextToolbarStatus.Hidden }
            override fun showMenu(rect: Rect, onCopyRequested: (() -> Unit)?, onPasteRequested: (() -> Unit)?,
                onCutRequested: (() -> Unit)?, onSelectAllRequested: (() -> Unit)?) {
                status = TextToolbarStatus.Shown; copy = onCopyRequested
            }
        }
        var clipboard: androidx.compose.ui.platform.ClipboardManager? = null
        compose.setContent {
            clipboard = LocalClipboardManager.current
            CompositionLocalProvider(LocalTextToolbar provides toolbar) {
                AniCSTheme { Surface { AnimeDetailHeader("Naruto", "", "JKAnime", {}, status = "En emisión") } }
            }
        }
        compose.onNodeWithTag("anime-title").performTouchInput { longClick(center) }
        compose.runOnIdle { assertNotNull(copy); copy!!.invoke(); assertEquals("Naruto", clipboard!!.getText()?.text) }
    }

    @Test fun posterOpensZoomableViewerAndClosingKeepsTheDetails() {
        compose.setContent { AniCSTheme { Surface { AnimeDetailHeader("Black Lagoon", "", "JKAnime", {}) } } }
        compose.onNodeWithTag("anime-cover").assertIsDisplayed().performClick()
        compose.onNodeWithTag("anime-cover-viewer").assertIsDisplayed()
        compose.onNodeWithContentDescription("Acercar portada").performClick()
        compose.onNodeWithText("150%").assertIsDisplayed()
        compose.onNodeWithContentDescription("Restablecer zoom").performClick()
        compose.onNodeWithText("100%").assertIsDisplayed()
        compose.onNodeWithContentDescription("Alejar portada").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Cerrar portada").performClick()
        compose.onNodeWithTag("anime-cover-viewer").assertDoesNotExist()
        compose.onNodeWithTag("anime-title").assertIsDisplayed()
    }

    @Test @Config(qualifiers = "w640dp-h320dp-land") fun viewerControlsFitInLandscapeAndZoomIsLimited() {
        compose.setContent { AniCSTheme { Surface { AnimeDetailHeader("A long anime title with a second season", "", "JKAnime", {}) } } }
        compose.onNodeWithTag("anime-cover").performClick()
        repeat(6) { compose.onNodeWithContentDescription("Acercar portada").performClick() }
        compose.onNodeWithText("400%").assertIsDisplayed()
        compose.onNodeWithContentDescription("Acercar portada").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Cerrar portada").assertIsDisplayed().performClick()
    }

    @Test fun panBoundsRespectPortraitImageFitAndHandleUnavailableImage() {
        assertEquals(Offset.Zero, coverPanBounds(Size(200f, 300f), Size(600f, 300f), 1f))
        assertEquals(Offset(100f, 450f), coverPanBounds(Size(200f, 300f), Size(600f, 300f), 4f))
        assertEquals(Offset.Zero, coverPanBounds(Size.Unspecified, Size(600f, 300f), 2f))
    }

    @Test fun allGenresWrapBelowThePosterWithTypeAndStatusVisible() {
        compose.setContent { AniCSTheme("rosepine") { Surface {
            AnimeDetailHeader("Aoki Denshou Welsh & Shedar", "", "2026 · JKAnime", {},
                genres = listOf(" Fantasía ", "Acción", "Aventura", "Comedia", "Drama", "fantasía", ""),
                animeType = "Serie", status = "En emisión")
        } } }
        listOf("Serie", "En emisión", "Géneros", "Fantasía", "Acción", "Aventura", "Comedia", "Drama").forEach {
            compose.onNodeWithText(it).assertIsDisplayed()
        }
        compose.onAllNodesWithText("Fantasía").assertCountEquals(1)
        val poster = compose.onNodeWithTag("anime-cover").fetchSemanticsNode().boundsInRoot
        val genres = compose.onNodeWithTag("anime-genres").fetchSemanticsNode().boundsInRoot
        assertTrue("Géneros must use the full width below the cover", genres.top >= poster.bottom)
        assertTrue(genres.width > poster.width)
    }

    @Test fun movieAndFinishedStatusAreNotHiddenWhenGenresAreUnavailable() {
        var returned = false
        compose.setContent { AniCSTheme { Surface {
            AnimeDetailHeader("Película", "", "JKAnime", { returned = true }, animeType = "Película", status = "Finalizado")
        } } }
        compose.onNodeWithText("Finalizado").assertIsDisplayed()
        compose.onNodeWithText("Géneros no disponibles en esta fuente").assertIsDisplayed()
        compose.onNodeWithText("Volver").performClick()
        compose.runOnIdle { assertTrue(returned) }
    }
}

// Robolectric has no native Surface for the selection magnifier. Keep selection/copy real,
// replacing only its platform popup teardown to avoid Surface.destroy() on null in this host.
@Implements(Magnifier::class)
class SelectionMagnifierShadow {
    @Implementation fun dismiss() = Unit
}
