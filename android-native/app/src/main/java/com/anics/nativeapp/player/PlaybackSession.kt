package com.anics.nativeapp.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.anics.nativeapp.data.local.HistoryEntity
import com.anics.nativeapp.data.repository.AppSettings
import com.anics.nativeapp.ffi.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

interface PlaybackCatalog {
    suspend fun getDetails(url: String, source: String): NativeAnimeDetails
    suspend fun getServers(episodeUrl: String, source: String): List<NativeVideoServer>
    suspend fun resolveStream(server: NativeVideoServer, source: String): NativeResolvedMedia
}
interface PlaybackHistory {
    suspend fun getHistoryItem(profileId: String, episodeUrl: String): HistoryEntity?
    suspend fun getEpisodeProgress(profileId: String, title: String, episode: Int): HistoryEntity?
    suspend fun recordProgress(profileId: String, animeTitle: String, animeUrl: String, episodeNumber: Int,
        episodeUrl: String, thumbnailUrl: String, source: String, progressSeconds: Long, durationSeconds: Long)
}
interface PlaybackEngine {
    fun updatePosition(): Pair<Long, Long>
    fun prepareStream(directUrl: String, isHls: Boolean, referer: String? = null, userAgent: String? = null,
        startPositionMs: Long = 0, resumeFraction: Double? = null, autoPlay: Boolean = true)
    fun resetPlayback()
    fun setQuality(quality: String) {}
}

data class PlaybackSessionState(
    val entry: HistoryEntity? = null,
    val episodes: List<NativeEpisode> = emptyList(),
    val servers: List<NativeVideoServer> = emptyList(),
    val selectedServer: NativeVideoServer? = null,
    val media: NativeResolvedMedia? = null,
    val quality: String = "auto",
    val isResolving: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val autoNext: Boolean = true
) {
    val previous: NativeEpisode? get() = entry?.let { current -> episodes.filter { it.number.toInt() < current.episodeNumber }.maxByOrNull { it.number } }
    val next: NativeEpisode? get() = entry?.let { current -> episodes.filter { it.number.toInt() > current.episodeNumber }.minByOrNull { it.number } }
}

/** One session owns its anime, episode, servers and progress, including offline episodes. */
class PlaybackSessionViewModel(
    private val catalog: PlaybackCatalog,
    private val history: PlaybackHistory,
    val engine: PlaybackEngine,
    private val localUrl: (String) -> String,
    private val release: () -> Unit = {}
) : ViewModel() {
    private val _state = MutableStateFlow(PlaybackSessionState())
    val state = _state.asStateFlow()
    private var job: Job? = null
    private var settings = AppSettings()
    private var generation = 0
    private var endedEpisode: String? = null
    private val historyMutex = Mutex()

    fun updateSettings(value: AppSettings) {
        settings = value
        _state.update { it.copy(autoNext = value.autoPlayNext) }
    }
    fun setAutoNext(enabled: Boolean) { settings = settings.copy(autoPlayNext = enabled); _state.update { it.copy(autoNext = enabled) } }
    fun open(entry: HistoryEntity, episodes: List<NativeEpisode>, servers: List<NativeVideoServer> = emptyList(),
        server: NativeVideoServer? = null, media: NativeResolvedMedia? = null) {
        close()
        _state.value = PlaybackSessionState(entry = entry, episodes = episodes.sortedBy { it.number }, servers = servers,
            selectedServer = server, quality = settings.defaultQuality, isResolving = true, autoNext = settings.autoPlayNext)
        launchOperation {
            if (episodes.isEmpty() && entry.source != "local") {
                val details = catalog.getDetails(entry.animeUrl, entry.source)
                _state.update { it.copy(episodes = details.episodes.sortedBy { episode -> episode.number }) }
            }
            val saved = savedProgress(entry)
            val resolved = media ?: if (entry.source == "local") offlineMedia(entry.episodeUrl) else resolveEpisode(entry.episodeUrl, server?.name)
            applyMedia(entry, resolved, resumeFraction = saved)
            if (saved != null) _state.update { it.copy(notice = "Reanudado desde el progreso guardado") }
        }
    }
    private fun offlineMedia(path: String) = NativeResolvedMedia(localUrl(path), NativeMediaType.MP4, null, null, emptyList())
    private suspend fun savedProgress(entry: HistoryEntity): Double? {
        val saved = history.getHistoryItem(entry.profileId, entry.episodeUrl)
            ?: history.getEpisodeProgress(entry.profileId, entry.animeTitle, entry.episodeNumber)
        return (saved?.watchProgress ?: saved?.let { if (it.durationSeconds > 0) it.progressSeconds.toDouble() / it.durationSeconds else null })
            ?.takeIf { it.isFinite() && it > 0 && it < .9 }
    }
    private suspend fun resolveEpisode(url: String, preferredName: String?): NativeResolvedMedia {
        val source = _state.value.entry?.source ?: error("No hay una sesión activa")
        val servers = com.anics.nativeapp.downloads.ServerSupport.ordered(catalog.getServers(url, source))
        // Failed next-episode resolution must not replace the current episode's servers.
        _state.update { if (it.entry?.episodeUrl == url) it.copy(servers = servers) else it }
        val preferred = preferredName?.takeIf { it.isNotBlank() } ?: settings.preferredServer
        val supported = servers.filter(com.anics.nativeapp.downloads.ServerSupport::playable)
        val preferredServers = supported.filter { it.name.equals(preferred, true) }
        val candidates = if (settings.allowFallback || preferred.isBlank()) preferredServers + supported.filter { it !in preferredServers } else preferredServers
        var lastError: Exception? = null
        for (server in candidates) {
            try {
                val media = catalog.resolveStream(server, source)
                currentCoroutineContext().ensureActive()
                _state.update { it.copy(servers = servers, selectedServer = server) }
                return media
            } catch (e: CancellationException) { throw e } catch (e: Exception) { lastError = e }
        }
        error(lastError?.localizedMessage ?: "No hay un servidor disponible. Selecciona otro servidor.")
    }
    private fun applyMedia(entry: HistoryEntity, media: NativeResolvedMedia, position: Long = 0, resumeFraction: Double? = null, autoPlay: Boolean = true) {
        val quality = _state.value.quality
        val url = media.qualities.firstOrNull { it.label == quality }?.url ?: media.directUrl
        _state.update { it.copy(entry = entry, media = media, isResolving = false, error = null) }
        endedEpisode = null
        // prepareStream resets the old stream before replacing it.
        engine.prepareStream(url, media.mediaType == NativeMediaType.HLS, media.referer, media.userAgent, position, resumeFraction, autoPlay)
        engine.setQuality(quality)
    }
    fun selectServer(server: NativeVideoServer, autoPlay: Boolean = true) {
        val entry = _state.value.entry ?: return
        val (position, duration) = engine.updatePosition()
        launchOperation {
            persist(entry, position, duration)
            val media = catalog.resolveStream(server, entry.source)
            _state.update { it.copy(selectedServer = server) }
            applyMedia(entry, media, position, autoPlay = autoPlay)
            _state.update { it.copy(notice = "Servidor: ${server.name}") }
        }
    }
    fun selectQuality(quality: String, autoPlay: Boolean = true) {
        val current = _state.value
        val entry = current.entry ?: return; val media = current.media ?: return
        val (position, _) = engine.updatePosition()
        job?.cancel(); generation++
        _state.update { it.copy(quality = quality) }
        applyMedia(entry, media, position, autoPlay = autoPlay)
    }
    fun selectEpisode(episode: NativeEpisode) {
        val current = _state.value
        val entry = current.entry ?: return
        if (entry.episodeUrl == episode.url) return
        val (position, duration) = engine.updatePosition()
        launchOperation {
            persist(entry, position, duration)
            val nextEntry = entry.copy(episodeNumber = episode.number.toInt(), episodeUrl = episode.url)
            val saved = savedProgress(nextEntry)
            val media = if (entry.source == "local") offlineMedia(episode.url) else resolveEpisode(episode.url, current.selectedServer?.name)
            applyMedia(nextEntry, media, resumeFraction = saved)
        }
    }
    fun next() { _state.value.next?.let(::selectEpisode) }
    fun previous() { _state.value.previous?.let(::selectEpisode) }
    fun ended() {
        val current = _state.value
        val entry = current.entry ?: return
        if (endedEpisode == entry.episodeUrl) return
        endedEpisode = entry.episodeUrl
        saveProgress()
        if (current.autoNext && current.next != null) next()
        else _state.update { it.copy(notice = if (it.next == null) "Has llegado al último episodio disponible" else "Episodio terminado. Puedes continuar con el siguiente.") }
    }
    fun retry() {
        val current = _state.value; val entry = current.entry ?: return
        val (position, duration) = engine.updatePosition()
        launchOperation {
            val media = if (entry.source == "local") offlineMedia(entry.episodeUrl) else resolveEpisode(entry.episodeUrl, current.selectedServer?.name)
            applyMedia(entry, media, position, resumeFraction = if (duration == 0L) savedProgress(entry) else null)
        }
    }
    fun dismissNotice() { _state.update { it.copy(notice = null) } }
    fun saveProgress(position: Long? = null, duration: Long? = null) {
        val entry = _state.value.entry ?: return
        val snapshot = if (position == null || duration == null) engine.updatePosition() else position to duration
        viewModelScope.launch { persist(entry, snapshot.first, snapshot.second) }
    }
    private suspend fun persist(entry: HistoryEntity, position: Long, duration: Long) {
        if (duration <= 0 || position <= 0) return
        historyMutex.withLock {
            history.recordProgress(entry.profileId, entry.animeTitle, entry.animeUrl, entry.episodeNumber, entry.episodeUrl,
                entry.thumbnailUrl, entry.source, position.coerceAtMost(duration) / 1000, duration / 1000)
        }
    }
    private fun launchOperation(block: suspend () -> Unit) {
        job?.cancel(); val id = ++generation
        _state.update { it.copy(isResolving = true, error = null, notice = null) }
        job = viewModelScope.launch {
            try { block() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (generation == id) _state.update { it.copy(isResolving = false, error = e.localizedMessage ?: "No se pudo cargar el video") } }
        }
    }
    fun close() {
        saveProgress(); job?.cancel(); generation++
        _state.value = PlaybackSessionState(autoNext = settings.autoPlayNext)
        endedEpisode = null; engine.resetPlayback()
    }
    override fun onCleared() { engine.resetPlayback(); release() }
}
