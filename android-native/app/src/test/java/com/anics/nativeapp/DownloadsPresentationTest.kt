package com.anics.nativeapp

import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.anics.nativeapp.data.local.DownloadEntity
import com.anics.nativeapp.ffi.NativeSourceConfig
import com.anics.nativeapp.ui.components.AniHeader
import com.anics.nativeapp.ui.screens.ActiveDownloadItem
import com.anics.nativeapp.ui.screens.DownloadOptionsMenu
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
class DownloadsPresentationTest {
    @get:Rule val compose = createComposeRule()

    @Test fun sourceSelectorIsCenteredAndStillSwitchesCatalogs() {
        val sources = listOf(NativeSourceConfig("jkanime", "Anime", "https://example.test"),
            NativeSourceConfig("mundodonghua", "Donghua", "https://donghua.test"))
        var favorite = false
        var settings = false
        compose.setContent { AniCSTheme("rosepine") {
            var selected by remember { mutableStateOf("jkanime") }
            AniHeader(sources, selected, { selected = it }, {}, { favorite = true }, { settings = true }, false, false)
        } }
        fun centered() {
            val header = compose.onNodeWithTag("anics-header").fetchSemanticsNode().boundsInRoot
            val selector = compose.onNodeWithTag("header-source-selector").fetchSemanticsNode().boundsInRoot
            assertEquals(header.center.x, selector.center.x, 1f)
        }
        centered()
        compose.onNodeWithText("Anime").performClick()
        compose.onNodeWithText("Donghua").performClick()
        compose.onNodeWithText("Donghua").assertIsDisplayed()
        centered()
        compose.onNodeWithContentDescription("Favoritos").performClick()
        compose.onNodeWithContentDescription("Ajustes").performClick()
        compose.runOnIdle { assertTrue(favorite); assertTrue(settings) }
    }

    @Test fun folderAndScanStayHiddenUntilMenuOpensAndRespectTheirAvailability() {
        var folder = 0
        var scanned = 0
        var refreshed = 0
        var scanning by mutableStateOf(false)
        var hasFolder by mutableStateOf(false)
        compose.setContent { AniCSTheme { Surface {
            DownloadOptionsMenu(scanning, hasFolder, { folder++ }, { scanned++ }, { refreshed++ })
        } } }
        compose.onNodeWithText("Carpeta").assertDoesNotExist()
        compose.onNodeWithText("Buscar videos").assertDoesNotExist()
        compose.onNodeWithText("Opciones").performClick()
        compose.onNodeWithText("Buscar videos").assertIsNotEnabled()
        compose.onNodeWithText("Carpeta").performClick()
        compose.onNodeWithText("Carpeta").assertDoesNotExist()
        compose.runOnIdle { hasFolder = true }
        compose.onNodeWithText("Opciones").performClick()
        compose.onNodeWithText("Buscar videos").performClick()
        compose.onNodeWithText("Opciones").performClick()
        compose.runOnIdle { scanning = true }
        compose.onNodeWithText("Carpeta").assertIsNotEnabled()
        compose.onNodeWithText("Buscar videos").assertIsNotEnabled()
        compose.onNodeWithText("Actualizar almacenamiento").performClick()
        compose.runOnIdle { assertEquals(1, folder); assertEquals(1, scanned); assertEquals(1, refreshed) }
    }

    @Test fun hlsProgressShowsEstimatedTotalWhileUnknownDirectTransferStaysIndeterminate() {
        var row by mutableStateOf(DownloadEntity("hls", animeTitle = "Anime", episodeNumber = 1, streamUrl = "list.m3u8",
            outputPath = "video.ts", status = "downloading", progress = .25f, downloadedBytes = 1024, createdAt = "2026-10-05"))
        compose.setContent { AniCSTheme { ActiveDownloadItem(row, {}, {}, {}) } }
        compose.onNodeWithText("25% · 1 KB / ≈ 4 KB (estimado)", substring = true).assertIsDisplayed()
        compose.onNode(hasProgressBarRangeInfo(androidx.compose.ui.semantics.ProgressBarRangeInfo(.25f, 0f..1f))).assertIsDisplayed()
        compose.runOnIdle { row = row.copy(progress = 0f, streamUrl = "video.mp4") }
        compose.onNodeWithText("Total no disponible", substring = true).assertIsDisplayed()
        compose.onNode(hasProgressBarRangeInfo(androidx.compose.ui.semantics.ProgressBarRangeInfo.Indeterminate)).assertIsDisplayed()
    }
}
