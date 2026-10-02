package com.anics.nativeapp.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.anics.nativeapp.data.local.DownloadDao
import com.anics.nativeapp.data.local.DownloadEntity
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class DownloadsUiState(
    val activeDownloads: List<DownloadEntity> = emptyList(),
    val completedDownloads: List<DownloadEntity> = emptyList(),
    val isLoading: Boolean = true,
    val isScanning: Boolean = false,
    val message: String? = null,
    val folderUri: String = ""
)

class DownloadsViewModel(
    private val downloadDao: DownloadDao,
    private val library: com.anics.nativeapp.downloads.LocalLibrary,
    private val settingsRepository: com.anics.nativeapp.data.repository.SettingsRepository,
    private val context: android.content.Context
) : ViewModel() {

    private val _uiState = MutableStateFlow(DownloadsUiState())
    val uiState: StateFlow<DownloadsUiState> = _uiState.asStateFlow()

    init {
        observeDownloads()
        viewModelScope.launch { settingsRepository.settings.collect { settings ->
            _uiState.update { it.copy(folderUri = settings.downloadFolderUri) }
        } }
    }

    private fun observeDownloads() {
        viewModelScope.launch {
            downloadDao.getAllDownloads().collect { list ->
                val active = list.filter { it.status in listOf("queued", "downloading", "paused", "failed") }
                val completed = list.filter { it.status == "completed" }.sortedWith(compareBy<DownloadEntity> { it.animeTitle.lowercase() }.thenBy { it.episodeNumber })
                _uiState.value = _uiState.value.copy(
                    activeDownloads = active,
                    completedDownloads = completed,
                    isLoading = false
                )
            }
        }
    }

    fun selectFolder(uri: String) {
        viewModelScope.launch { settingsRepository.updateDownloadFolderUri(uri); scan(uri) }
    }
    fun refreshLibrary() { scan(_uiState.value.folderUri) }
    fun showMessage(message: String) { _uiState.update { it.copy(message = message) } }
    private fun scan(uri: String) {
        if (_uiState.value.isScanning) return
        viewModelScope.launch {
            _uiState.update { it.copy(isScanning = true, message = null) }
            try {
                require(uri.isNotBlank()) { "Selecciona la carpeta Anime que usa Tauri" }
                val count = library.scan(uri)
                _uiState.update { it.copy(message = "$count videos encontrados") }
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
              catch (e: Exception) { _uiState.update { it.copy(message = e.localizedMessage) } }
            finally { _uiState.update { it.copy(isScanning = false) } }
        }
    }

    private fun action(id: String, action: String) {
        try {
            androidx.core.content.ContextCompat.startForegroundService(context, android.content.Intent(context, com.anics.nativeapp.downloads.DownloadService::class.java)
                .setAction(action).putExtra(com.anics.nativeapp.downloads.DownloadService.EXTRA_ID, id))
        } catch (e: Exception) { showMessage(e.localizedMessage ?: "No se pudo controlar la descarga") }
    }
    fun pauseDownload(id: String) = action(id, com.anics.nativeapp.downloads.DownloadService.ACTION_PAUSE)
    fun resumeDownload(id: String) {
        viewModelScope.launch {
            val row = downloadDao.getDownloadById(id) ?: return@launch
            if (row.outputPath.isNotBlank()) action(id, com.anics.nativeapp.downloads.DownloadService.ACTION_RESUME)
            else try {
                val service = com.anics.nativeapp.downloads.DownloadService
                androidx.core.content.ContextCompat.startForegroundService(context, android.content.Intent(context, com.anics.nativeapp.downloads.DownloadService::class.java)
                    .setAction(service.ACTION_START).putExtra(service.EXTRA_ID, row.id).putExtra(service.EXTRA_TITLE, row.animeTitle)
                    .putExtra(service.EXTRA_EPISODE, row.episodeNumber).putExtra(service.EXTRA_URL, row.streamUrl).putExtra(service.EXTRA_REFERER, row.referer))
            } catch (e: Exception) { showMessage(e.localizedMessage ?: "No se pudo reintentar") }
        }
    }
    fun cancelDownload(id: String) {
        viewModelScope.launch {
            val row = downloadDao.getDownloadById(id) ?: return@launch
            if (row.status == "completed" || row.streamUrl.isBlank()) downloadDao.deleteDownload(id)
            else action(id, com.anics.nativeapp.downloads.DownloadService.ACTION_CANCEL)
        }
    }
}
