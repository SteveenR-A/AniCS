package com.anics.nativeapp.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.anics.nativeapp.data.repository.CatalogRepository
import com.anics.nativeapp.data.repository.FavoriteRepository
import com.anics.nativeapp.data.repository.HistoryRepository
import com.anics.nativeapp.data.repository.ProfileRepository
import com.anics.nativeapp.ffi.NativeAnimeDetails
import com.anics.nativeapp.ffi.NativeEpisode
import com.anics.nativeapp.ffi.NativeResolvedMedia
import com.anics.nativeapp.ffi.NativeVideoServer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class DetailsUiState(
    val isLoading: Boolean = true,
    val details: NativeAnimeDetails? = null,
    val isFavorite: Boolean = false,
    val selectedEpisode: NativeEpisode? = null,
    val servers: List<NativeVideoServer> = emptyList(),
    val isLoadingServers: Boolean = false,
    val resolvedMedia: NativeResolvedMedia? = null,
    val isResolvingStream: Boolean = false,
    val selectedServer: NativeVideoServer? = null,
    val error: String? = null,
    val resumeEpisode: NativeEpisode? = null,
    val resumeLabel: String = "Sin episodios"
)

class DetailsViewModel(
    private val catalogRepository: CatalogRepository,
    private val favoriteRepository: FavoriteRepository,
    private val historyRepository: HistoryRepository,
    private val profileRepository: ProfileRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(DetailsUiState())
    val uiState: StateFlow<DetailsUiState> = _uiState.asStateFlow()

    private var currentUrl: String = ""
    private var currentSource: String = ""
    private var detailsJob: Job? = null
    private var serversJob: Job? = null
    private var resolveJob: Job? = null

    @OptIn(ExperimentalCoroutinesApi::class)
    private fun observeProgress() { viewModelScope.launch {
        profileRepository.getActiveProfile()
        profileRepository.activeProfile.filterNotNull().flatMapLatest { profile ->
            historyRepository.getHistoryForProfile(profile.id).map { profile.id to it }
        }.collect { (profileId, rows) ->
            val details = _uiState.value.details ?: return@collect
            val enriched = details.copy(episodes = enrichDetailsEpisodes(details, rows, profileId))
            val action = detailsPlaybackAction(enriched, rows, profileId)
            _uiState.update { it.copy(details = enriched, resumeEpisode = action?.episode, resumeLabel = action?.label ?: "Sin episodios") }
        }
    } }
    init { observeProgress() }

    fun loadAnimeDetails(url: String, source: String) {
        currentUrl = url
        currentSource = source
        detailsJob?.cancel(); serversJob?.cancel(); resolveJob?.cancel()
        detailsJob = viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val activeProfile = profileRepository.getActiveProfile()
                var isFav = favoriteRepository.isFavorite(activeProfile.id, url)
                val details = catalogRepository.getDetails(url, source)
                currentUrl = details.url.ifBlank { url }

                if (!isFav && details.url.isNotBlank() && details.url != url) {
                    isFav = favoriteRepository.isFavorite(activeProfile.id, details.url)
                }

                // Enriquecer episodios con progreso del historial local
                val rows = historyRepository.getHistoryForProfile(activeProfile.id).first()
                val enrichedEpisodes = enrichDetailsEpisodes(details, rows, activeProfile.id)
                val action = detailsPlaybackAction(details, rows, activeProfile.id)
                if (profileRepository.getActiveProfile().id != activeProfile.id) {
                    loadAnimeDetails(url, source)
                    return@launch
                }

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    details = details.copy(episodes = enrichedEpisodes),
                    resumeEpisode = action?.episode,
                    resumeLabel = action?.label ?: "Sin episodios",
                    isFavorite = isFav,
                    error = null
                )
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.localizedMessage ?: "Error al cargar detalles"
                )
            }
        }
    }

    fun reportError(message: String) { _uiState.value = _uiState.value.copy(error = message) }

    fun toggleFavorite() {
        val details = _uiState.value.details ?: return
        viewModelScope.launch {
            val activeProfile = profileRepository.getActiveProfile()
            val targetUrl = details.url.ifBlank { currentUrl }
            val newFavStatus = favoriteRepository.toggleFavorite(
                profileId = activeProfile.id,
                title = details.title,
                url = targetUrl,
                thumbnailUrl = details.thumbnailUrl,
                source = details.source
            )
            _uiState.value = _uiState.value.copy(isFavorite = newFavStatus)
        }
    }

    fun selectEpisode(episode: NativeEpisode) {
        serversJob?.cancel(); resolveJob?.cancel()
        _uiState.value = _uiState.value.copy(
            selectedEpisode = episode,
            isLoadingServers = true,
            servers = emptyList(),
            resolvedMedia = null,
            selectedServer = null, isResolvingStream = false, error = null
        )

        serversJob = viewModelScope.launch {
            try {
                val servers = catalogRepository.getServers(episode.url, currentSource)
                _uiState.value = _uiState.value.copy(
                    servers = servers,
                    isLoadingServers = false
                )
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoadingServers = false,
                    error = e.localizedMessage ?: "Error al obtener servidores"
                )
            }
        }
    }

    fun resolveServer(server: NativeVideoServer, onResolved: (NativeResolvedMedia) -> Unit) {
        resolveJob?.cancel()
        _uiState.value = _uiState.value.copy(
            selectedServer = server,
            isResolvingStream = true,
            error = null
        )

        resolveJob = viewModelScope.launch {
            try {
                val media = catalogRepository.resolveStream(server, currentSource)
                _uiState.value = _uiState.value.copy(
                    resolvedMedia = media,
                    isResolvingStream = false
                )
                onResolved(media)
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isResolvingStream = false,
                    error = e.localizedMessage ?: "No se pudo reproducir este servidor"
                )
            }
        }
    }
}
