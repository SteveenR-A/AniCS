package com.anics.nativeapp.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.anics.nativeapp.data.repository.*
import com.anics.nativeapp.data.local.HistoryEntity
import com.anics.nativeapp.ffi.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class BrowseState(val isLoading: Boolean = true, val source: String = "jkanime", val days: List<NativeScheduleDay> = emptyList(),
    val ranking: List<NativeAnimeResult> = emptyList(), val error: String? = null)
class BrowseViewModel(private val catalog: CatalogRepository, settings: SettingsRepository, val ranking: Boolean) : ViewModel() {
    private val _state = MutableStateFlow(BrowseState())
    val state = _state.asStateFlow()
    private var job: Job? = null
    init { viewModelScope.launch { settings.settings.map { it.defaultSource }.distinctUntilChanged().collect { source -> _state.update { it.copy(source = source) }; refresh() } } }
    fun refresh() {
        job?.cancel()
        job = viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            try {
                val source = _state.value.source
                if (ranking) { val rows = catalog.getTop(source); _state.update { it.copy(ranking = rows, isLoading = false) } }
                else { val days = catalog.getScheduleDays(source); _state.update { it.copy(days = days, isLoading = false) } }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { _state.update { it.copy(isLoading = false, error = e.localizedMessage ?: "No se pudo cargar el catálogo") } }
        }
    }
}

data class HistoryState(val entries: List<HistoryEntity> = emptyList(), val profileName: String = "", val profileId: String = "default", val message: String? = null)
class HistoryViewModel(private val history: HistoryRepository, private val profiles: ProfileRepository) : ViewModel() {
    private val _state = MutableStateFlow(HistoryState())
    val state = _state.asStateFlow()
    @OptIn(ExperimentalCoroutinesApi::class)
    private fun observe() { viewModelScope.launch {
        profiles.getActiveProfile()
        profiles.activeProfile.filterNotNull().flatMapLatest { profile ->
            _state.update { it.copy(profileId = profile.id, profileName = profile.name) }
            history.getHistoryForProfile(profile.id)
        }.collect { rows -> _state.update { it.copy(entries = rows) } }
    } }
    init { observe() }
    fun report(message: String) { _state.update { it.copy(message = message) } }
    fun clear() { val profile = _state.value.profileId; operation { history.clearHistory(profile) } }
    fun remove(entries: List<HistoryEntity>) = operation { entries.forEach { history.deleteItem(it.profileId, it.episodeUrl) } }
    private fun operation(block: suspend () -> Unit) { viewModelScope.launch { try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { report(e.localizedMessage ?: "No se pudo borrar el historial") } } }
}
