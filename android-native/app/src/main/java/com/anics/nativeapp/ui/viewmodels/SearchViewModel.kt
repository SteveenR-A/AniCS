package com.anics.nativeapp.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.anics.nativeapp.data.repository.CatalogRepository
import com.anics.nativeapp.ffi.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class SearchUiState(
    val query: String = "", val isLoading: Boolean = false,
    val results: List<NativeAnimeResult> = emptyList(),
    val availableSources: List<NativeSourceConfig> = emptyList(),
    val selectedSource: String? = "jkanime", val error: String? = null,
    val genres: List<NativeGenreItem> = emptyList(), val genre: String? = null,
    val status: String? = null, val animeType: String? = null,
    val year: String? = null, val orderBy: String? = null,
    val page: Int = 1, val totalPages: Int = 1, val hasNext: Boolean = false, val recentQueries: List<String> = emptyList()
)

class SearchViewModel(private val catalogRepository: CatalogRepository, private val settingsRepository: com.anics.nativeapp.data.repository.SettingsRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState = _uiState.asStateFlow()
    private var searchJob: Job? = null
    private var genresJob: Job? = null
    init {
        viewModelScope.launch { settingsRepository.recentSearches.collect { queries -> _uiState.update { it.copy(recentQueries = queries) } } }
        viewModelScope.launch {
            try {
                _uiState.update { it.copy(availableSources = catalogRepository.getAvailableSources()) }
                loadGenres(); refresh()
            } catch (e: CancellationException) { throw e }
              catch (e: Exception) { _uiState.update { it.copy(error = e.localizedMessage) } }
        }
    }
    fun onQueryChanged(query: String) {
        _uiState.update { it.copy(query = query) }
        executeSearch(debounce = true)
    }
    fun selectSource(source: String?) {
        if (_uiState.value.selectedSource == source) return
        _uiState.update { it.copy(selectedSource = source, genre = null, status = null, animeType = null, year = null, orderBy = null, genres = emptyList()) }
        loadGenres(); refresh()
    }
    private fun loadGenres() {
        genresJob?.cancel()
        val source = _uiState.value.selectedSource ?: return
        genresJob = viewModelScope.launch {
            try {
                val genres = catalogRepository.getGenres(source)
                _uiState.update { if (it.selectedSource == source) it.copy(genres = genres) else it }
            } catch (e: CancellationException) { throw e } catch (_: Exception) { }
        }
    }
    fun setFilter(key: String, value: String?) {
        _uiState.update { when(key) {
            "genre" -> it.copy(genre = value); "status" -> it.copy(status = value)
            "type" -> it.copy(animeType = value); "year" -> it.copy(year = value)
            else -> it.copy(orderBy = value)
        } }; refresh()
    }
    fun clearSearch() { _uiState.update { SearchUiState(availableSources = it.availableSources, genres = it.genres, selectedSource = it.selectedSource) }; refresh() }
    fun clearFilters() { _uiState.update { it.copy(genre = null, status = null, animeType = null, year = null, orderBy = null) }; refresh() }
    fun submit() { rememberQuery(); refresh() }
    fun rememberQuery() { viewModelScope.launch { settingsRepository.rememberSearch(_uiState.value.query) } }
    fun forgetQuery(query: String) { viewModelScope.launch { settingsRepository.forgetSearch(query) } }
    fun quickFilter(value: String) {
        _uiState.update { it.copy(status = when(value) { "estrenos" -> "estrenos"; "emision" -> "emision"; else -> null }, animeType = if (value == "peliculas") "peliculas" else null) }; refresh()
    }
    fun refresh() = executeSearch()
    fun nextPage() { if (_uiState.value.hasNext && !_uiState.value.isLoading) executeSearch(append = true) }
    fun goToPage(page: Int) { if (!_uiState.value.isLoading && page in 1.._uiState.value.totalPages) executeSearch(targetPage = page) }
    private fun executeSearch(append: Boolean = false, debounce: Boolean = false, targetPage: Int? = null) {
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            if (debounce) delay(400)
            val state = _uiState.value
            val page = targetPage ?: if (append) state.page + 1 else 1
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val source = state.selectedSource
                if (source == null) {
                    val results = if (state.query.isBlank()) emptyList() else catalogRepository.search(state.query.trim(), null)
                    _uiState.update { it.copy(results = results, isLoading = false, page = 1, totalPages = 1, hasNext = false) }
                } else {
                    val response = catalogRepository.advancedSearch(NativeSearchFilters(
                        query = state.query.trim().takeIf { it.isNotEmpty() }, genre = state.genre,
                        status = state.status, animeType = state.animeType, year = state.year,
                        orderBy = state.orderBy, page = page.toUInt()), source)
                    _uiState.update { it.copy(results = (if (append) it.results + response.results else response.results).distinctBy { a -> a.source + a.url },
                        isLoading = false, page = page, totalPages = response.totalPages?.toInt()?.coerceAtLeast(page) ?: (page + if (response.hasNext) 1 else 0), hasNext = response.hasNext) }
                }
            } catch (e: CancellationException) { throw e }
              catch (e: Exception) { _uiState.update { it.copy(isLoading = false, error = e.localizedMessage ?: "Error en la búsqueda") } }
        }
    }
}
