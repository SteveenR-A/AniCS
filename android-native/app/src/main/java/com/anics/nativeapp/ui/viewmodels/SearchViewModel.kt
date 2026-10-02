package com.anics.nativeapp.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.anics.nativeapp.data.repository.CatalogRepository
import com.anics.nativeapp.ffi.NativeAnimeResult
import com.anics.nativeapp.ffi.NativeSourceConfig
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class SearchUiState(
    val query: String = "",
    val isLoading: Boolean = false,
    val results: List<NativeAnimeResult> = emptyList(),
    val availableSources: List<NativeSourceConfig> = emptyList(),
    val selectedSource: String? = null, // null means "All sources"
    val error: String? = null
)

@OptIn(FlowPreview::class)
class SearchViewModel(
    private val catalogRepository: CatalogRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    private val searchQueryFlow = MutableStateFlow("")

    init {
        loadSources()
        observeQuery()
    }

    private fun loadSources() {
        viewModelScope.launch {
            try {
                val sources = catalogRepository.getAvailableSources()
                _uiState.value = _uiState.value.copy(availableSources = sources)
            } catch (_: Exception) {}
        }
    }

    private fun observeQuery() {
        viewModelScope.launch {
            searchQueryFlow
                .debounce(400)
                .filter { it.trim().length >= 2 }
                .distinctUntilChanged()
                .collectLatest { query ->
                    executeSearch(query, _uiState.value.selectedSource)
                }
        }
    }

    fun onQueryChanged(newQuery: String) {
        _uiState.value = _uiState.value.copy(query = newQuery)
        searchQueryFlow.value = newQuery
        if (newQuery.isBlank()) {
            _uiState.value = _uiState.value.copy(results = emptyList(), isLoading = false, error = null)
        }
    }

    fun selectSource(sourceId: String?) {
        _uiState.value = _uiState.value.copy(selectedSource = sourceId)
        val currentQuery = _uiState.value.query.trim()
        if (currentQuery.length >= 2) {
            executeSearch(currentQuery, sourceId)
        }
    }

    fun clearSearch() {
        _uiState.value = _uiState.value.copy(query = "", results = emptyList(), isLoading = false, error = null)
        searchQueryFlow.value = ""
    }

    private fun executeSearch(query: String, source: String?) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val results = catalogRepository.search(query = query, source = source)
                _uiState.value = _uiState.value.copy(
                    results = results,
                    isLoading = false,
                    error = null
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.localizedMessage ?: "Error en la búsqueda"
                )
            }
        }
    }
}
