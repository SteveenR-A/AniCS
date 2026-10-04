package com.anics.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import com.anics.nativeapp.data.repository.AppSettings
import com.anics.nativeapp.data.local.ProfileEntity
import com.anics.nativeapp.ffi.NativeSourceConfig
import com.anics.nativeapp.ui.screens.*
import com.anics.nativeapp.ui.theme.AniCSTheme
import com.anics.nativeapp.ui.viewmodels.SettingsUiState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NativeUiRegressionTest {
    @get:Rule val compose = createComposeRule()
    private fun fixture() = SettingsUiState(settings = AppSettings(), profiles = listOf(ProfileEntity(name = "Principal")),
        activeProfile = ProfileEntity(name = "Principal"), availableSources = listOf(NativeSourceConfig("jkanime", "Anime", "https://jkanime.org")))

    @Test fun settingsOpensScrollsAndChangesThemeOnCompactPhone() {
        var state by mutableStateOf(fixture())
        compose.setContent { AniCSTheme(state.settings.themeMode) {
            Scaffold(topBar = { com.anics.nativeapp.ui.components.AniHeader(state.availableSources, "jkanime", {}, {}, {}, {}, false, true) }, bottomBar = { AniBottomBar("settings") {} }) { padding ->
                SettingsContent(state, SettingsActions(theme = { state = state.copy(settings = state.settings.copy(themeMode = it)) }), Modifier.padding(padding).consumeWindowInsets(padding))
            }
        } }
        compose.onNodeWithText("Ajustes").assertIsDisplayed()
        scroll("Rosé Pine"); compose.onNodeWithText("Rosé Pine").performClick()
        scroll("Catppuccin Mocha"); compose.onNodeWithText("Catppuccin Mocha").performClick()
        compose.onNodeWithContentDescription("Tema seleccionado").assertExists()
        compose.runOnIdle { org.junit.Assert.assertEquals("catppuccin", state.settings.themeMode) }
        scroll("Carpeta de descargas"); compose.onNodeWithText("Carpeta de descargas").assertIsDisplayed()
        scroll("Fuentes y catálogos"); compose.onNodeWithText("Fuentes y catálogos").assertIsDisplayed()
        scroll("Actualizar AniCS"); compose.onNodeWithText("Actualizar AniCS").assertIsDisplayed()
        scroll("Tema visual")
        scroll("Rosé Pine"); compose.onNodeWithText("Rosé Pine").performClick()
        scroll("Tema visual")
        screenshot("settings-themes")
    }
    @Test fun settingsRemainsScrollableWithLargeTextAndLongProfile() {
        val state = fixture().copy(activeProfile = ProfileEntity(name = "Un perfil con un nombre mucho más largo"))
        compose.setContent { val density = LocalDensity.current; CompositionLocalProvider(LocalDensity provides Density(density.density, 1.6f)) { AniCSTheme { Surface(color = MaterialTheme.colorScheme.background) { SettingsContent(state, SettingsActions()) } } } }
        scroll("Tema visual"); compose.onNodeWithText("Tema visual").assertIsDisplayed()
        scroll("Reproducción"); compose.onNodeWithText("Reproducción").assertIsDisplayed()
        scroll("Actualizar AniCS"); compose.onNodeWithText("Actualizar AniCS").assertIsDisplayed()
    }
    @Test fun updateNoticeFocusesSectionAndShowsNotesAndDownloadProgress() {
        val update = com.anics.nativeapp.updates.NativeUpdate("v0.3.3", "Correcciones del reproductor y las descargas", "", "https://github.com/apk", 1000, null)
        val state = fixture().copy(update = update, isDownloadingUpdate = true,
            updateProgress = com.anics.nativeapp.updates.UpdateDownloadProgress(420, 1000))
        compose.setContent { AniCSTheme { SettingsContent(state, SettingsActions(), focusUpdates = true) } }
        compose.onNodeWithText("Actualizar AniCS").assertIsDisplayed()
        compose.onNodeWithText(update.notes).assertIsDisplayed()
        compose.onNodeWithTag("update-progress").assertIsDisplayed()
        compose.onNodeWithText("Pausar").assertIsDisplayed()
        compose.onNodeWithText("Descargando: 42%", substring = true).assertIsDisplayed()
        screenshot("update-progress")
    }
    private fun scroll(text: String) { compose.onNodeWithTag("settings-list").performScrollToNode(hasText(text)) }
    private fun screenshot(name: String) {
        compose.runOnIdle {
            val activity = androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance()
                .getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED).first()
            val view = activity.window.decorView
            val bitmap = android.graphics.Bitmap.createBitmap(view.width, view.height, android.graphics.Bitmap.Config.ARGB_8888)
            view.draw(android.graphics.Canvas(bitmap))
            val file = java.io.File("build/ui-preview/$name.png"); file.parentFile!!.mkdirs()
            file.outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
    }
    @Test
    @Config(qualifiers = "w320dp-h640dp-port")
    fun portraitPlayerShowsEveryControlWithoutHorizontalClipping() {
        val eps = listOf(PlaybackSessionTest.episode(1), PlaybackSessionTest.episode(2), PlaybackSessionTest.episode(3))
        val state = com.anics.nativeapp.player.PlaybackSessionState(entry = com.anics.nativeapp.data.local.HistoryEntity(animeTitle = "Anime", animeUrl = "anime", episodeNumber = 2, episodeUrl = "ep2"), episodes = eps)
        compose.setContent { AniCSTheme { com.anics.nativeapp.player.PlayerHud(com.anics.nativeapp.player.PlaybackState(isLoading = false), state, false,
            onBack = {}, onPanel = {}, onPlay = {}, onSeek = {}, onPrevious = {}, onNext = {}, onIntro = {}, onMute = {}, onLock = {}, onOrientation = {}, onScrub = {}, onScrubEnd = {}) } }
        listOf("Episodio anterior", "Siguiente episodio", "Silenciar / activar audio", "Bloquear controles", "Pantalla horizontal").forEach { label -> compose.onNodeWithContentDescription(label).assertIsDisplayed() }
        compose.onNodeWithText("Intro +85 s").assertIsDisplayed()
        screenshot("player-portrait")
    }
    @Test
    @Config(qualifiers = "w800dp-h360dp-land")
    fun playerLandscapeHasServerEpisodesAndNextControls() {
        val eps = listOf(PlaybackSessionTest.episode(1), PlaybackSessionTest.episode(2), PlaybackSessionTest.episode(3))
        val state = com.anics.nativeapp.player.PlaybackSessionState(entry = com.anics.nativeapp.data.local.HistoryEntity(animeTitle = "Koyomimonogatari", animeUrl = "anime", episodeNumber = 2, episodeUrl = "ep2"), episodes = eps,
            selectedServer = com.anics.nativeapp.ffi.NativeVideoServer("Magi", "server", false, null))
        var panel = ""; var next = 0
        compose.setContent { AniCSTheme { Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.Black)) { com.anics.nativeapp.player.PlayerHud(com.anics.nativeapp.player.PlaybackState(isPlaying = true, isLoading = false, currentPositionMs = 42000, durationMs = 828000), state, true,
            onBack = {}, onPanel = { panel = it }, onPlay = {}, onSeek = {}, onPrevious = {}, onNext = { next++ }, onIntro = {}, onMute = {}, onLock = {}, onOrientation = {}, onScrub = {}, onScrubEnd = {}) } } }
        compose.onNodeWithContentDescription("Cambiar servidor").performClick()
        org.junit.Assert.assertEquals("servers", panel)
        compose.onNodeWithContentDescription("Seleccionar episodio").performClick()
        org.junit.Assert.assertEquals("episodes", panel)
        compose.onNodeWithContentDescription("Siguiente episodio").performClick()
        org.junit.Assert.assertEquals(1, next)
        screenshot("player-landscape")
    }
}
