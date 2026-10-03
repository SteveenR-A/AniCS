package com.anics.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.anics.nativeapp.ffi.NativeEpisode
import com.anics.nativeapp.ui.screens.BatchDownloadDialog
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
class BatchDownloadDialogTest {
    @get:Rule val compose = createComposeRule()
    private fun episodes() = (1..12).map { PlaybackSessionTest.episode(it) }
    private fun select(number: Int) {
        compose.onNodeWithTag("batch-episodes").performScrollToNode(hasText("Episodio $number"))
        compose.onNodeWithText("Episodio $number").performClick()
    }
    @Test fun individualSelectionDownloadsOnlyOneTwoFiveSixAndSeven() {
        var submitted = emptyList<NativeEpisode>()
        compose.setContent { AniCSTheme { BatchDownloadDialog(episodes(), {}, { submitted = it }) } }
        compose.onNodeWithText("Añadir lote").assertIsNotEnabled()
        listOf(7, 2, 1, 5, 6).forEach(::select)
        compose.onNodeWithText("5 seleccionados").assertIsDisplayed()
        compose.onNodeWithText("Añadir lote").performClick()
        compose.runOnIdle { assertEquals(listOf(1u, 2u, 5u, 6u, 7u), submitted.map { it.number }) }
    }
    @Test fun allCanBeEditedAndClearedWithoutEnqueuingAnything() {
        var submits = 0
        compose.setContent { AniCSTheme { BatchDownloadDialog(episodes(), {}, { submits++ }) } }
        compose.onNodeWithText("Todos").performClick()
        compose.onNodeWithText("12 seleccionados").assertIsDisplayed()
        select(2)
        compose.onNodeWithText("Episodio 2").assertIsOff()
        compose.onNodeWithText("11 seleccionados").assertIsDisplayed()
        compose.onNodeWithText("Todos").performClick()
        compose.onNodeWithText("Limpiar").performClick()
        compose.onNodeWithText("Añadir lote").assertIsNotEnabled()
        compose.runOnIdle { assertEquals(0, submits) }
    }
    @Test fun rangeOnlyIncludesAvailableEpisodesAndRejectsInvalidBounds() {
        var submitted = emptyList<NativeEpisode>()
        compose.setContent { AniCSTheme { BatchDownloadDialog(listOf(1, 2, 5, 6, 7).map { PlaybackSessionTest.episode(it) }, {}, { submitted = it }) } }
        compose.onNodeWithText("Rango").performClick()
        compose.onNodeWithTag("batch-from").performTextReplacement("2")
        compose.onNodeWithTag("batch-to").performTextReplacement("6")
        compose.onNodeWithText("3 seleccionados").assertIsDisplayed()
        compose.onNodeWithTag("batch-from").performTextReplacement("8")
        compose.onNodeWithText("Añadir lote").assertIsNotEnabled()
        compose.onNodeWithTag("batch-from").performTextReplacement("2")
        compose.onNodeWithText("Añadir lote").performClick()
        compose.runOnIdle { assertEquals(listOf(2u, 5u, 6u), submitted.map { it.number }) }
    }
    @Test fun cancelDoesNotSubmitAndDuplicateEpisodesAreNotRepeated() {
        var submits = 0; var dismissals = 0
        val list = listOf(PlaybackSessionTest.episode(1), PlaybackSessionTest.episode(1), PlaybackSessionTest.episode(2))
        compose.setContent { AniCSTheme { BatchDownloadDialog(list, { dismissals++ }, { submits++ }) } }
        compose.onNodeWithText("Todos").performClick()
        compose.onNodeWithText("2 seleccionados").assertIsDisplayed()
        compose.onNodeWithText("Volver").performClick()
        compose.runOnIdle { assertEquals(0, submits); assertEquals(1, dismissals) }
    }
    @Test
    @Config(qualifiers = "w640dp-h320dp-land")
    fun landscapeKeepsSelectionAndConfirmationVisible() {
        var submitted = emptyList<NativeEpisode>()
        compose.setContent { AniCSTheme { BatchDownloadDialog(episodes(), {}, { submitted = it }) } }
        select(5)
        compose.onNodeWithText("Añadir lote").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(listOf(5u), submitted.map { it.number }) }
    }
}
