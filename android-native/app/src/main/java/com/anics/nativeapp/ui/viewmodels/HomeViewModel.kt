package com.anics.nativeapp.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.anics.nativeapp.data.repository.CatalogRepository
import com.anics.nativeapp.data.repository.SettingsRepository
import com.anics.nativeapp.ffi.NativeAnimeResult
import com.anics.nativeapp.ffi.NativeSourceConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.*

data class HomeUiState(
    val isLoading: Boolean = true,
    val latestAnimes: List<NativeAnimeResult> = emptyList(),
    val availableSources: List<NativeSourceConfig> = emptyList(),
    val selectedSource: String = "jkanime",
    val error: String? = null,
    val continueWatching: List<com.anics.nativeapp.data.local.HistoryEntity> = emptyList()
)

class HomeViewModel(
    private val catalogRepository: CatalogRepository,
    private val settingsRepository: SettingsRepository,
    private val historyRepository: com.anics.nativeapp.data.repository.HistoryRepository,
    private val profileRepository: com.anics.nativeapp.data.repository.ProfileRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private var latestJob: Job? = null

    init {
        loadInitialData()
        observeHistory()
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    private fun observeHistory() {
        viewModelScope.launch {
            profileRepository.getActiveProfile()
            profileRepository.activeProfile.filterNotNull().flatMapLatest { historyRepository.getHistoryForProfile(it.id) }.collect { history ->
                _uiState.update { it.copy(continueWatching = history.filter { h -> h.source != "local" && (h.watchProgress ?: if (h.durationSeconds > 0) h.progressSeconds.toDouble()/h.durationSeconds else 0.0) < 0.9 }
                    .distinctBy { h -> com.anics.nativeapp.sync.SyncContract.titleKey(h.animeTitle) }.take(12)) }
            }
        }
    }
    private fun loadInitialData() {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isLoading = true, error = null)
                val values = settingsRepository.syncSettings.first()
                catalogRepository.updateSettings(kotlinx.serialization.json.JsonObject(values.mapValues { kotlinx.serialization.json.JsonPrimitive(it.value) }).toString())
                val settings = settingsRepository.settings.first()
                val sources = catalogRepository.getAvailableSources()
                val activeSource = if (sources.any { it.id == settings.defaultSource }) {
                    settings.defaultSource
                } else {
                    sources.firstOrNull()?.id ?: "jkanime"
                }

                _uiState.value = _uiState.value.copy(
                    availableSources = sources,
                    selectedSource = activeSource
                )

                loadLatestForSource(activeSource)
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.localizedMessage ?: "Error al cargar catálogo"
                )
            }
        }
    }

    fun selectSource(sourceId: String) {
        if (_uiState.value.selectedSource == sourceId) return
        _uiState.value = _uiState.value.copy(selectedSource = sourceId)
        loadLatestForSource(sourceId)
    }

    fun refresh() {
        viewModelScope.launch {
            val values = settingsRepository.syncSettings.first()
            catalogRepository.updateSettings(kotlinx.serialization.json.JsonObject(values.mapValues { kotlinx.serialization.json.JsonPrimitive(it.value) }).toString())
            _uiState.update { it.copy(availableSources = catalogRepository.getAvailableSources()) }
            loadLatestForSource(_uiState.value.selectedSource)
        }
    }

    private fun loadLatestForSource(source: String) {
        latestJob?.cancel()
        latestJob = viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val results = catalogRepository.getLatest(source = source, page = 1)
                _uiState.value = _uiState.value.copy(
                    latestAnimes = results,
                    isLoading = false,
                    error = null
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.localizedMessage ?: "Error al obtener últimos animes"
                )
            }
        }
    }
}
