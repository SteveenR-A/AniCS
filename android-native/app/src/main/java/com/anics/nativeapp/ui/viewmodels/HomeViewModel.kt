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

data class HomeUiState(
    val isLoading: Boolean = true,
    val latestAnimes: List<NativeAnimeResult> = emptyList(),
    val availableSources: List<NativeSourceConfig> = emptyList(),
    val selectedSource: String = "jkanime",
    val error: String? = null
)

class HomeViewModel(
    private val catalogRepository: CatalogRepository,
    private val settingsRepository: SettingsRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        loadInitialData()
    }

    private fun loadInitialData() {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isLoading = true, error = null)
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
            } catch (e: Exception) {
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
        loadLatestForSource(_uiState.value.selectedSource)
    }

    private fun loadLatestForSource(source: String) {
        viewModelScope.launch {
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
