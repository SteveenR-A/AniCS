package com.anics.nativeapp

import com.anics.nativeapp.data.local.HistoryEntity
import com.anics.nativeapp.data.repository.AppSettings
import com.anics.nativeapp.ffi.*
import com.anics.nativeapp.player.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.*
import org.junit.Assert.*

@OptIn(ExperimentalCoroutinesApi::class)
class PlaybackSessionTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun teardown() { Dispatchers.resetMain() }
    private val episodes = listOf(episode(1), episode(2), episode(3))
    private val entry = HistoryEntity(profileId = "profile-b", animeTitle = "Series", animeUrl = "anime", episodeNumber = 1, episodeUrl = "ep1")
    private val servers = listOf(NativeVideoServer("Magi", "magi", false, null), NativeVideoServer("Desu", "desu", false, null))
    private class Engine : PlaybackEngine {
        var position = 0L; var duration = 0L
        data class Prepared(val url: String, val start: Long, val fraction: Double?, val play: Boolean)
        val prepared = mutableListOf<Prepared>()
        override fun updatePosition() = position to duration
        override fun prepareStream(directUrl: String, isHls: Boolean, referer: String?, userAgent: String?, startPositionMs: Long, resumeFraction: Double?, autoPlay: Boolean) {
            prepared.add(Prepared(directUrl, startPositionMs, resumeFraction, autoPlay)); position = startPositionMs; duration = 0
        }
        override fun resetPlayback() { position = 0; duration = 0 }
    }
    private class History : PlaybackHistory {
        val saved = mutableMapOf<Pair<String,String>, HistoryEntity>()
        val recorded = mutableListOf<HistoryEntity>()
        override suspend fun getHistoryItem(profileId: String, episodeUrl: String) = saved[profileId to episodeUrl]
        override suspend fun getEpisodeProgress(profileId: String, title: String, episode: Int) = saved.values.firstOrNull { it.profileId == profileId && it.animeTitle == title && it.episodeNumber == episode }
        override suspend fun recordProgress(profileId: String, animeTitle: String, animeUrl: String, episodeNumber: Int, episodeUrl: String, thumbnailUrl: String, source: String, progressSeconds: Long, durationSeconds: Long) {
            recorded.add(HistoryEntity(profileId = profileId, animeTitle = animeTitle, animeUrl = animeUrl, episodeNumber = episodeNumber, episodeUrl = episodeUrl, source = source, progressSeconds = progressSeconds, durationSeconds = durationSeconds))
        }
    }
    private inner class Catalog : PlaybackCatalog {
        var failure = false
        var nextServers: List<NativeVideoServer>? = null
        override suspend fun getDetails(url: String, source: String): NativeAnimeDetails = error("Details not needed")
        override suspend fun getServers(episodeUrl: String, source: String) = if (episodeUrl == "ep2") nextServers ?: servers else servers
        override suspend fun resolveStream(server: NativeVideoServer, source: String): NativeResolvedMedia {
            if (failure) error("Unavailable")
            return NativeResolvedMedia(server.url + ".mp4", NativeMediaType.MP4, null, null, listOf(NativeQuality("720p", "720.mp4", null)))
        }
    }
    @Test fun resumeUsesCurrentProfileAndCanonicalEpisodeWhenUrlChanges() = runTest(dispatcher) {
        val engine = Engine(); val history = History(); val vm = PlaybackSessionViewModel(Catalog(), history, engine, { it })
        history.saved["profile-a" to "ep1"] = entry.copy(profileId = "profile-a", watchProgress = .7)
        history.saved["profile-b" to "legacy-url"] = entry.copy(episodeUrl = "legacy-url", watchProgress = .42)
        vm.open(entry, episodes, servers, servers[0], media()); advanceUntilIdle()
        assertEquals(.42, engine.prepared.last().fraction!!, 0.00001)
    }
    @Test fun completedEpisodeStartsFromBeginning() = runTest(dispatcher) {
        val engine = Engine(); val history = History(); history.saved[entry.profileId to entry.episodeUrl] = entry.copy(watchProgress = .98)
        val vm = PlaybackSessionViewModel(Catalog(), history, engine, { it })
        vm.open(entry, episodes, servers, servers[0], media()); advanceUntilIdle()
        assertNull(engine.prepared.last().fraction)
    }
    @Test fun serverAndQualityChangesPreserveTimeAndPausedState() = runTest(dispatcher) {
        val engine = Engine(); val history = History(); val vm = PlaybackSessionViewModel(Catalog(), history, engine, { it })
        vm.open(entry, episodes, servers, servers[0], media()); advanceUntilIdle()
        engine.position = 123000; engine.duration = 900000
        vm.selectServer(servers[1], autoPlay = false); advanceUntilIdle()
        assertEquals(123000, engine.prepared.last().start); assertFalse(engine.prepared.last().play)
        assertEquals(123L, history.recorded.last().progressSeconds)
        engine.duration = 900000
        vm.selectQuality("720p", autoPlay = false)
        assertEquals("720.mp4", engine.prepared.last().url); assertEquals(123000, engine.prepared.last().start)
    }
    @Test fun autoNextSavesFinishedEpisodeAndResumesNextOne() = runTest(dispatcher) {
        val engine = Engine(); val history = History(); val vm = PlaybackSessionViewModel(Catalog(), history, engine, { it })
        history.saved[entry.profileId to "ep2"] = entry.copy(episodeNumber = 2, episodeUrl = "ep2", watchProgress = .2)
        vm.open(entry, episodes, servers, servers[0], media()); advanceUntilIdle()
        engine.position = 900000; engine.duration = 900000
        vm.ended(); advanceUntilIdle()
        assertEquals(2, vm.state.value.entry!!.episodeNumber)
        assertEquals(.2, engine.prepared.last().fraction!!, .00001)
        assertTrue(history.recorded.any { it.episodeNumber == 1 && it.progressSeconds == 900L })
    }
    @Test fun disablingAutoNextKeepsCurrentEpisodeAndDoesNotDoubleAdvance() = runTest(dispatcher) {
        val engine = Engine(); val vm = PlaybackSessionViewModel(Catalog(), History(), engine, { it })
        vm.updateSettings(AppSettings(autoPlayNext = false)); vm.open(entry, episodes, servers, servers[0], media()); advanceUntilIdle()
        vm.ended(); vm.ended(); advanceUntilIdle()
        assertEquals(1, vm.state.value.entry!!.episodeNumber); assertEquals(1, engine.prepared.size)
    }
    @Test fun offlineNextUsesLocalServerAndCurrentProfileProgress() = runTest(dispatcher) {
        val engine = Engine(); val history = History(); val vm = PlaybackSessionViewModel(Catalog(), history, engine, { "http://127.0.0.1/video?path=$it" })
        val local = entry.copy(source = "local", episodeUrl = "file1")
        val eps = listOf(episode(1).copy(url = "file1"), episode(2).copy(url = "file2"))
        history.saved[entry.profileId to "file2"] = local.copy(episodeNumber = 2, episodeUrl = "file2", watchProgress = .3)
        vm.open(local, eps); advanceUntilIdle(); engine.position = 50000; engine.duration = 50000
        vm.ended(); advanceUntilIdle()
        assertEquals("http://127.0.0.1/video?path=file2", engine.prepared.last().url)
        assertEquals(.3, engine.prepared.last().fraction!!, .00001)
    }
    @Test fun failedServerKeepsExistingStreamAndCanBeRetried() = runTest(dispatcher) {
        val engine = Engine(); val catalog = Catalog(); val vm = PlaybackSessionViewModel(catalog, History(), engine, { it })
        vm.open(entry, episodes, servers, servers[0], media()); advanceUntilIdle()
        engine.position = 22000; engine.duration = 900000; catalog.failure = true
        vm.selectServer(servers[1]); advanceUntilIdle()
        assertEquals(1, engine.prepared.size); assertEquals("Magi", vm.state.value.selectedServer!!.name); assertNotNull(vm.state.value.error)
        catalog.failure = false; vm.selectServer(servers[1]); advanceUntilIdle()
        assertEquals(22000, engine.prepared.last().start); assertNull(vm.state.value.error)
    }
    @Test fun failedNextEpisodeDoesNotAttachItsServersToCurrentEpisode() = runTest(dispatcher) {
        val engine = Engine(); val catalog = Catalog(); val vm = PlaybackSessionViewModel(catalog, History(), engine, { it })
        vm.open(entry, episodes, servers, servers[0], media()); advanceUntilIdle()
        engine.position = 30000; engine.duration = 900000; catalog.failure = true
        catalog.nextServers = listOf(NativeVideoServer("Other episode server", "ep2-server", false, null))
        vm.next(); advanceUntilIdle()
        assertEquals("ep1", vm.state.value.entry!!.episodeUrl)
        assertEquals(servers, vm.state.value.servers)
        assertEquals(1, engine.prepared.size)
    }
    companion object {
        fun episode(number: Int) = NativeEpisode(number.toUInt(), null, "ep$number", null, false, null)
        fun media() = NativeResolvedMedia("initial.mp4", NativeMediaType.MP4, null, null, emptyList())
    }
}
