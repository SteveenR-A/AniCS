package com.anics.nativeapp

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModelStore
import androidx.test.core.app.ApplicationProvider
import com.anics.nativeapp.data.local.AppDatabase
import com.anics.nativeapp.data.repository.SettingsRepository
import com.anics.nativeapp.downloads.LocalLibrary
import com.anics.nativeapp.ui.viewmodels.DownloadsViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadsNavigationStateTest {
    @Test fun expansionAndQueueSurviveRecreationAndTitlesHaveIndependentState() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = AppDatabase.getInstance(context)
        val store = ViewModelStore()
        fun model(handle: SavedStateHandle) = DownloadsViewModel(db.downloadDao(), LocalLibrary(context, db.downloadDao()),
            SettingsRepository(context), context, savedStateHandle = handle)
        try {
            val handle = SavedStateHandle()
            val first = model(handle); store.put("first", first)
            first.toggleAnime("Koyomimonogatari"); first.toggleAnime("Black Lagoon"); first.showQueue(true)
            runCurrent()
            assertEquals(setOf("koyomimonogatari", "blacklagoon"), first.uiState.value.expandedAnimeKeys)
            val restored = SavedStateHandle(mapOf("expanded-animes" to ArrayList(handle.get<List<String>>("expanded-animes")!!), "downloads-queue" to handle.get<Boolean>("downloads-queue")))
            val second = model(restored); store.put("second", second)
            runCurrent()
            assertEquals(first.uiState.value.expandedAnimeKeys, second.uiState.value.expandedAnimeKeys)
            assertTrue(second.queueVisible.value)
            second.toggleAnime("Black Lagoon"); runCurrent()
            assertEquals(setOf("koyomimonogatari"), second.uiState.value.expandedAnimeKeys)
        } finally { store.clear(); Dispatchers.resetMain() }
    }
}
