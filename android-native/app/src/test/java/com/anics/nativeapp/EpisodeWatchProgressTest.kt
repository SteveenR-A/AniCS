package com.anics.nativeapp

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.anics.nativeapp.data.local.AppDatabase
import com.anics.nativeapp.data.local.HistoryEntity
import com.anics.nativeapp.data.repository.HistoryRepository
import com.anics.nativeapp.downloads.EpisodeWatchProgress
import com.anics.nativeapp.downloads.EpisodeWatchState
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EpisodeWatchProgressTest {
    @Test fun derivesAllThreeStatesFromSavedProgress() {
        val entry = HistoryEntity(animeTitle = "Anime", animeUrl = "anime", episodeNumber = 1, episodeUrl = "episode")
        assertEquals(EpisodeWatchState.UNWATCHED, EpisodeWatchProgress.from(null).state)
        assertEquals(EpisodeWatchState.UNWATCHED, EpisodeWatchProgress.from(entry).state)
        val partial = EpisodeWatchProgress.from(entry.copy(progressSeconds = 250, durationSeconds = 1000))
        assertEquals(EpisodeWatchState.IN_PROGRESS, partial.state); assertEquals(.25f, partial.fraction, .001f)
        assertEquals(EpisodeWatchState.IN_PROGRESS, EpisodeWatchProgress.from(entry.copy(progressSeconds = 1)).state)
        assertEquals(EpisodeWatchState.WATCHED, EpisodeWatchProgress.from(entry.copy(watchProgress = .95)).state)
        assertEquals(1f, EpisodeWatchProgress.from(entry.copy(completed = true, watchProgress = .1)).fraction, .001f)
    }

    @Test fun watchStateSurvivesRewatchAndUriChangesAndRemainsSpecificToProfile() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        try {
            val history = HistoryRepository(db)
            history.recordProgress("a", "Anime", "anime", 1, "online", "", "jkanime", 950, 1000)
            history.recordProgress("a", "Anime", "local://anime", 1, "content://video/1", "", "local", 10, 1000)
            history.recordProgress("b", "Anime", "anime", 1, "online", "", "jkanime", 250, 1000)
            assertTrue(history.getEpisodeProgress("a", "Anime", 1)!!.completed)
            assertFalse(history.getEpisodeProgress("b", "Anime", 1)!!.completed)
            assertEquals(.25, history.getEpisodeProgress("b", "Anime", 1)!!.watchProgress!!, .001)
            assertEquals(1, db.historyDao().getHistoryForProfileSync("a").size)
        } finally { db.close() }
    }
}
