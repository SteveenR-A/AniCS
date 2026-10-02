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
    val error: String? = null
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

    fun loadAnimeDetails(url: String, source: String) {
        currentUrl = url
        currentSource = source
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val activeProfile = profileRepository.getActiveProfile()
                val isFav = favoriteRepository.isFavorite(activeProfile.id, url)
                val details = catalogRepository.getDetails(url, source)

                // Enriquecer episodios con progreso del historial local
                val enrichedEpisodes = details.episodes.map { ep ->
                    val historyItem = historyRepository.getHistoryItem(activeProfile.id, ep.url)
                    if (historyItem != null) {
                        ep.copy(
                            watched = historyItem.completed,
                            watch_progress = if (historyItem.durationSeconds > 0) {
                                historyItem.progressSeconds.toDouble() / historyItem.durationSeconds.toDouble()
                            } else null
                        )
                    } else {
                        ep
                    }
                }

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    details = details.copy(episodes = enrichedEpisodes),
                    isFavorite = isFav,
                    error = null
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.localizedMessage ?: "Error al cargar detalles"
                )
            }
        }
    }

    fun toggleFavorite() {
        val details = _uiState.value.details ?: return
        viewModelScope.launch {
            val activeProfile = profileRepository.getActiveProfile()
            val newFavStatus = favoriteRepository.toggleFavorite(
                profileId = activeProfile.id,
                title = details.title,
                url = details.url,
                thumbnailUrl = details.thumbnail_url,
                source = details.source
            )
            _uiState.value = _uiState.value.copy(isFavorite = newFavStatus)
        }
    }

    fun selectEpisode(episode: NativeEpisode) {
        _uiState.value = _uiState.value.copy(
            selectedEpisode = episode,
            isLoadingServers = true,
            servers = emptyList(),
            resolvedMedia = null,
            selectedServer = null
        )

        viewModelScope.launch {
            try {
                val servers = catalogRepository.getServers(episode.url, currentSource)
                _uiState.value = _uiState.value.copy(
                    servers = servers,
                    isLoadingServers = false
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoadingServers = false,
                    error = e.localizedMessage ?: "Error al obtener servidores"
                )
            }
        }
    }

    fun resolveServer(server: NativeVideoServer, onResolved: (NativeResolvedMedia) -> Unit) {
        _uiState.value = _uiState.value.copy(
            selectedServer = server,
            isResolvingStream = true,
            error = null
        )

        viewModelScope.launch {
            try {
                val media = catalogRepository.resolveStream(server, currentSource)
                _uiState.value = _uiState.value.copy(
                    resolvedMedia = media,
                    isResolvingStream = false
                )
                onResolved(media)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isResolvingStream = false,
                    error = e.localizedMessage ?: "No se pudo reproducir este servidor"
                )
            }
        }
    }
}
