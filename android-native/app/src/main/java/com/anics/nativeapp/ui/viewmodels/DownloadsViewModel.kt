package com.anics.nativeapp.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.anics.nativeapp.data.local.DownloadDao
import com.anics.nativeapp.data.local.DownloadEntity
import com.anics.nativeapp.downloads.EpisodeKey
import com.anics.nativeapp.downloads.EpisodeWatchProgress
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class DownloadsUiState(
    val activeDownloads: List<DownloadEntity> = emptyList(),
    val completedDownloads: List<DownloadEntity> = emptyList(),
    val isLoading: Boolean = true,
    val isScanning: Boolean = false,
    val message: String? = null,
    val expandedAnimeKeys: Set<String> = emptySet(),
    val watchProgress: Map<EpisodeKey, EpisodeWatchProgress> = emptyMap(),
    val folderUri: String = "", val covers: Map<String, String> = emptyMap(), val totalSpace: Long = 0, val freeSpace: Long = 0
)

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class DownloadsViewModel(
    private val downloadDao: DownloadDao,
    private val library: com.anics.nativeapp.downloads.LocalLibrary,
    private val settingsRepository: com.anics.nativeapp.data.repository.SettingsRepository,
    private val context: android.content.Context,
    private val catalogRepository: com.anics.nativeapp.data.repository.CatalogRepository? = null,
    private val savedStateHandle: SavedStateHandle = SavedStateHandle()
) : ViewModel() {

    private val _uiState = MutableStateFlow(DownloadsUiState())
    val uiState: StateFlow<DownloadsUiState> = _uiState.asStateFlow()
    private var resolveJob: kotlinx.coroutines.Job? = null
    private var coverRequestKey: List<String> = emptyList()
    val queueVisible = savedStateHandle.getStateFlow("downloads-queue", false)

    fun showQueue(visible: Boolean) { savedStateHandle["downloads-queue"] = visible }
    fun toggleAnime(title: String) {
        val key = com.anics.nativeapp.sync.SyncContract.titleKey(title)
        val expanded = savedStateHandle.get<List<String>>("expanded-animes").orEmpty().toMutableSet()
        if (!expanded.add(key)) expanded.remove(key)
        savedStateHandle["expanded-animes"] = expanded.toList()
    }

    fun onScreenVisible() { refreshStorage(); viewModelScope.launch { library.validateCompletedDownloads() } }

    init {
        observeDownloads()
        refreshStorage()
        viewModelScope.launch {
            savedStateHandle.getStateFlow("expanded-animes", emptyList<String>()).collect { keys ->
                _uiState.update { it.copy(expandedAnimeKeys = keys.toSet()) }
            }
        }
        val database = com.anics.nativeapp.data.local.AppDatabase.getInstance(context)
        viewModelScope.launch {
            database.profileDao().getActiveProfileFlow().flatMapLatest { profile ->
                database.historyDao().getHistoryForProfile(profile?.id ?: "default").onStart { emit(emptyList()) }
            }.collect { history ->
                val progress = history.groupBy { EpisodeKey.of(it.animeTitle, it.episodeNumber) }
                    .mapValues { (_, entries) -> EpisodeWatchProgress.from(entries.maxByOrNull { it.lastWatchedAt }) }
                _uiState.update { it.copy(watchProgress = progress) }
            }
        }
        viewModelScope.launch { settingsRepository.settings.map { it.downloadFolderUri }.distinctUntilChanged().collect { uri ->
            _uiState.update { it.copy(folderUri = uri) }
            if (uri.isNotBlank()) scan(uri)
        } }
    }

    fun refreshStorage() {
        viewModelScope.launch {
            val values = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                val db = com.anics.nativeapp.data.local.AppDatabase.getInstance(context)
                val images = db.historyDao().getAllHistorySync().map { it.animeTitle to it.thumbnailUrl } + db.favoriteDao().getAllFavoritesSync().map { it.title to it.thumbnailUrl }
                val covers = images.filter { it.second.isNotBlank() }.associate { com.anics.nativeapp.sync.SyncContract.titleKey(it.first) to it.second }.toMutableMap()
                val list = downloadDao.getAllDownloads().first()
                list.forEach { dl ->
                    val key = com.anics.nativeapp.sync.SyncContract.titleKey(dl.animeTitle)
                    if (!covers.containsKey(key) || covers[key].isNullOrBlank()) {
                        val cdn = com.anics.nativeapp.downloads.LocalCovers.cdnCover(dl.animeTitle)
                        if (cdn.isNotBlank()) covers[key] = cdn
                    }
                }
                val storage = runCatching { android.os.StatFs(android.os.Environment.getExternalStorageDirectory().absolutePath) }.getOrNull()
                Triple(covers, storage?.totalBytes ?: 0, storage?.availableBytes ?: 0)
            }
            _uiState.update { it.copy(covers = values.first, totalSpace = values.second, freeSpace = values.third) }
        }
    }

    private fun resolveMissingCovers(list: List<DownloadEntity>) {
        val catalog = catalogRepository ?: return
        val missing = list.filter { it.status == "completed" && (it.thumbnailUrl.isBlank() || it.animeUrl.isBlank()) }
        val key = missing.map { it.id + "|" + it.animeUrl + "|" + it.thumbnailUrl }
        if (key == coverRequestKey) return
        coverRequestKey = key
        resolveJob?.cancel()
        resolveJob = viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            for ((_, group) in missing.groupBy { com.anics.nativeapp.sync.SyncContract.titleKey(it.animeTitle) }) {
                val title = group.first().animeTitle
                try {
                    val results = catalog.search(title, null)
                    val match = results.firstOrNull {
                        com.anics.nativeapp.sync.SyncContract.titleKey(it.title) == com.anics.nativeapp.sync.SyncContract.titleKey(title) ||
                        it.title.contains(title, ignoreCase = true) || title.contains(it.title, ignoreCase = true)
                    } ?: results.firstOrNull()
                    if (match != null) {
                        val updated = group.map {
                            it.copy(
                                animeUrl = it.animeUrl.ifBlank { match.url },
                                thumbnailUrl = it.thumbnailUrl.ifBlank { match.thumbnailUrl },
                                source = if (it.animeUrl.isBlank()) match.source else it.source
                            )
                        }
                        updated.forEach { downloadDao.updateLibraryMetadata(it.id, it.animeUrl, it.thumbnailUrl, it.source) }
                    }
                } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) {}
            }
        }
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
                resolveMissingCovers(completed)
            }
        }
    }

    fun selectFolder(uri: String) {
        viewModelScope.launch {
            if (uri == _uiState.value.folderUri) scan(uri)
            else settingsRepository.updateDownloadFolderUri(uri)
        }
    }
    fun refreshLibrary() { scan(_uiState.value.folderUri) }
    fun importTauriDatabase(uri: android.net.Uri) {
        viewModelScope.launch {
            try {
                val count = com.anics.nativeapp.downloads.TauriLibraryMetadata(context).importDatabase(uri)
                showMessage("Metadatos de $count animes importados")
                if (_uiState.value.folderUri.isNotBlank()) scan(_uiState.value.folderUri)
            } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { showMessage(e.localizedMessage ?: "No se pudo importar anics.db") }
        }
    }
    fun deleteVideo(id: String) { viewModelScope.launch {
        try {
            val row = downloadDao.getDownloadById(id) ?: return@launch
            if (row.status == "completed") kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                com.anics.nativeapp.downloads.StorageManager(context).deleteFile(row.outputPath)
                require(com.anics.nativeapp.downloads.StorageManager(context).getFileLength(row.outputPath) == 0L) { "No se pudo borrar el video; revisa el permiso de la carpeta" }
                downloadDao.deleteDownload(id)
            } else action(id, com.anics.nativeapp.downloads.DownloadService.ACTION_CANCEL)
        } catch (e: Exception) { showMessage(e.localizedMessage ?: "No se pudo borrar el video") }
    } }
    fun showMessage(message: String) { _uiState.update { it.copy(message = message) } }
    private fun scan(uri: String) {
        if (_uiState.value.isScanning) return
        viewModelScope.launch {
            _uiState.update { it.copy(isScanning = true, message = null) }
            try {
                require(uri.isNotBlank()) { "Selecciona la carpeta Anime que usa Tauri" }
                val count = library.scan(uri)
                _uiState.update { it.copy(message = "$count videos detectados en la carpeta") }
                refreshStorage()
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
        action(id, com.anics.nativeapp.downloads.DownloadService.ACTION_RESUME)
    }
    fun cancelDownload(id: String) {
        viewModelScope.launch {
            val row = downloadDao.getDownloadById(id) ?: return@launch
            if (row.status == "completed") downloadDao.deleteDownload(id)
            else action(id, com.anics.nativeapp.downloads.DownloadService.ACTION_CANCEL)
        }
    }
}
