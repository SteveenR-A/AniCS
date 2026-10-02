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
    val isLoading: Boolean = true
)

class DownloadsViewModel(
    private val downloadDao: DownloadDao
) : ViewModel() {

    private val _uiState = MutableStateFlow(DownloadsUiState())
    val uiState: StateFlow<DownloadsUiState> = _uiState.asStateFlow()

    init {
        observeDownloads()
    }

    private fun observeDownloads() {
        viewModelScope.launch {
            downloadDao.getAllDownloads().collect { list ->
                val active = list.filter { it.status in listOf("queued", "downloading", "paused") }
                val completed = list.filter { it.status == "completed" }
                _uiState.value = DownloadsUiState(
                    activeDownloads = active,
                    completedDownloads = completed,
                    isLoading = false
                )
            }
        }
    }

    fun pauseDownload(id: String) {
        viewModelScope.launch {
            downloadDao.updateProgress(id, "paused", 0f, 0L)
        }
    }

    fun resumeDownload(id: String) {
        viewModelScope.launch {
            downloadDao.updateProgress(id, "queued", 0f, 0L)
        }
    }

    fun cancelDownload(id: String) {
        viewModelScope.launch {
            downloadDao.deleteDownload(id)
        }
    }
}
