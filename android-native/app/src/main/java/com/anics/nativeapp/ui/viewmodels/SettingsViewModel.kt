package com.anics.nativeapp.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.anics.nativeapp.data.local.ProfileEntity
import com.anics.nativeapp.data.repository.AppSettings
import com.anics.nativeapp.data.repository.CatalogRepository
import com.anics.nativeapp.data.repository.ProfileRepository
import com.anics.nativeapp.data.repository.SettingsRepository
import com.anics.nativeapp.ffi.NativeSourceConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*

data class DatabaseStats(
    val sizeFormatted: String = "0 KB",
    val historyCount: Int = 0,
    val favoritesCount: Int = 0
)

data class NativeProfileStats(
    val animesCount: Int = 0,
    val episodesCount: Int = 0,
    val hoursWatched: Double = 0.0
)

data class SettingsUiState(
    val settings: AppSettings = AppSettings(),
    val profiles: List<ProfileEntity> = emptyList(),
    val activeProfile: ProfileEntity? = null,
    val profileStats: Map<String, NativeProfileStats> = emptyMap(),
    val databaseStats: DatabaseStats = DatabaseStats(),
    val availableSources: List<NativeSourceConfig> = emptyList(),
    val appVersion: String = com.anics.nativeapp.BuildConfig.VERSION_NAME,
    val message: String? = null,
    val update: com.anics.nativeapp.updates.NativeUpdate? = null,
    val updateApk: java.io.File? = null,
    val isCheckingUpdate: Boolean = false,
    val isDownloadingUpdate: Boolean = false,
    val updateProgress: com.anics.nativeapp.updates.UpdateDownloadProgress? = null,
    val partialDownloadBytes: Long = 0L,
    val updateError: String? = null,
    val installRequested: Boolean = false,
    val isExporting: Boolean = false
)

class SettingsViewModel(
    private val settingsRepository: SettingsRepository,
    private val profileRepository: ProfileRepository,
    private val catalogRepository: CatalogRepository,
    private val backupManager: com.anics.nativeapp.sync.BackupManager,
    private val database: com.anics.nativeapp.data.local.AppDatabase? = null,
    private val context: android.content.Context? = null
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        loadSettingsAndProfiles()
        refreshDatabaseStats()
        refreshProfileStats()
    }

    private fun loadSettingsAndProfiles() {
        viewModelScope.launch {
            settingsRepository.settings.collect { s ->
                _uiState.value = _uiState.value.copy(settings = s)
            }
        }
        viewModelScope.launch {
            profileRepository.getAllProfiles().collect { list ->
                val active = list.firstOrNull { it.isActive } ?: profileRepository.getActiveProfile()
                _uiState.value = _uiState.value.copy(profiles = list, activeProfile = active)
            }
        }
        viewModelScope.launch {
            settingsRepository.syncSettings.collect { values ->
                try {
                    catalogRepository.updateSettings(JsonObject(values.mapValues { JsonPrimitive(it.value) }).toString())
                    val sources = catalogRepository.getAvailableSources()
                    _uiState.update { it.copy(availableSources = sources) }
                } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { showMessage(e.localizedMessage ?: "No se pudieron cargar las fuentes") }
            }
        }
    }

    fun selectTheme(theme: String) { viewModelScope.launch { settingsRepository.updateTheme(theme) } }
    fun addCatalog(name: String, url: String, type: String) = operation("Fuente agregada") {
        require(name.trim().isNotBlank()) { "Escribe un nombre para la fuente" }
        val uri = java.net.URI(url.trim())
        require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null) { "Usa una URL HTTPS válida" }
        val raw = settingsRepository.syncSettings.first()["custom_sources"]
        val current = raw?.let { Json.parseToJsonElement(it).jsonArray } ?: JsonArray(emptyList())
        val source = buildJsonObject { put("name", name.trim()); put("url", url.trim()); put("type", type) }
        settingsRepository.applySyncSettings(mapOf("custom_sources" to JsonArray(current + source).toString()))
        val values = settingsRepository.syncSettings.first()
        catalogRepository.updateSettings(JsonObject(values.mapValues { JsonPrimitive(it.value) }).toString())
        val sources = catalogRepository.getAvailableSources()
        _uiState.update { it.copy(availableSources = sources) }
    }
    fun deleteCatalog(sourceId: String) = operation("Fuente eliminada") {
        val customIndex = sourceId.removePrefix("custom_").toIntOrNull() ?: error("Solo se pueden eliminar fuentes personalizadas")
        val raw = settingsRepository.syncSettings.first()["custom_sources"] ?: error("La fuente ya no existe")
        val sources = Json.parseToJsonElement(raw).jsonArray.toMutableList()
        require(customIndex in sources.indices) { "Índice de fuente no válido" }
        sources.removeAt(customIndex)
        settingsRepository.applySyncSettings(mapOf("custom_sources" to JsonArray(sources).toString()))
        val values = settingsRepository.syncSettings.first()
        catalogRepository.updateSettings(JsonObject(values.mapValues { JsonPrimitive(it.value) }).toString())
        val available = catalogRepository.getAvailableSources()
        _uiState.update { it.copy(availableSources = available) }
    }
    fun setCatalogUrl(key: String, url: String) {
        viewModelScope.launch {
            try {
                val uri = java.net.URI(url.trim())
                require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null) { "Usa una URL HTTPS válida" }
                val customIndex = Regex("^custom_(\\d+)_base_url$").matchEntire(key)?.groupValues?.get(1)?.toInt()
                val updates = if (customIndex == null) mapOf(key to url.trim()) else {
                    val raw = settingsRepository.syncSettings.first()["custom_sources"] ?: error("La fuente ya no existe")
                    val sources = Json.parseToJsonElement(raw).jsonArray.toMutableList()
                    val source = sources.getOrNull(customIndex)?.jsonObject ?: error("La fuente ya no existe")
                    sources[customIndex] = JsonObject(source + ("url" to JsonPrimitive(url.trim())))
                    mapOf("custom_sources" to JsonArray(sources).toString())
                }
                settingsRepository.applySyncSettings(updates)
                val values = settingsRepository.syncSettings.first()
                catalogRepository.updateSettings(kotlinx.serialization.json.JsonObject(values.mapValues { kotlinx.serialization.json.JsonPrimitive(it.value) }).toString())
                _uiState.update { it.copy(availableSources = catalogRepository.getAvailableSources(), message = "Fuente guardada") }
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
              catch (e: Exception) { _uiState.update { it.copy(message = e.localizedMessage) } }
        }
    }
    fun exportBackup(context: android.content.Context, uri: android.net.Uri) = operation("Respaldo exportado") {
        val raw = backupManager.createBackupJson()
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(raw) } ?: error("No se pudo abrir el archivo")
        }
    }
    fun importBackup(context: android.content.Context, uri: android.net.Uri) = operation("Respaldo importado. Revisa el perfil activo en Ajustes.") {
        val raw = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { reader ->
                val result = StringBuilder(); val buffer = CharArray(8192)
                while (true) { val count = reader.read(buffer); if (count < 0) break
                    require(result.length + count <= 10 * 1024 * 1024) { "El respaldo supera 10 MB" }; result.append(buffer, 0, count) }
                result.toString()
            } ?: error("No se pudo leer el respaldo")
        }
        backupManager.restoreBackupJson(raw)
    }
    private var downloadJob: kotlinx.coroutines.Job? = null

    fun receiveUpdate(update: com.anics.nativeapp.updates.NativeUpdate, repository: com.anics.nativeapp.updates.UpdateRepository? = null) {
        val existingApk = repository?.getDownloadedApk(update)
        val partialBytes = repository?.getPartialDownloadSize() ?: 0L
        _uiState.update {
            it.copy(
                update = update,
                updateApk = existingApk ?: if (it.update?.identity == update.identity) it.updateApk else null,
                partialDownloadBytes = partialBytes,
                updateError = null
            )
        }
    }

    fun checkUpdates(repository: com.anics.nativeapp.updates.UpdateRepository) {
        if (_uiState.value.isCheckingUpdate || _uiState.value.isDownloadingUpdate) return
        viewModelScope.launch {
            _uiState.update { it.copy(isCheckingUpdate = true, updateError = null) }
            try {
                val update = repository.check(includeCurrent = true)
                val existingApk = update?.let { repository.getDownloadedApk(it) }
                val partialBytes = repository.getPartialDownloadSize()
                _uiState.update {
                    it.copy(
                        update = update,
                        updateApk = existingApk,
                        partialDownloadBytes = partialBytes,
                        updateError = if (update == null) "No hay una versión compatible publicada" else null
                    )
                }
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
              catch (e: Exception) { reportUpdateError(e.localizedMessage ?: "No se pudo comprobar la versión") }
            finally { _uiState.update { it.copy(isCheckingUpdate = false) } }
        }
    }

    fun downloadUpdate(repository: com.anics.nativeapp.updates.UpdateRepository) {
        if (_uiState.value.isDownloadingUpdate || _uiState.value.isCheckingUpdate) return
        val update = _uiState.value.update ?: return

        val existing = repository.getDownloadedApk(update)
        if (existing != null) {
            _uiState.update { it.copy(updateApk = existing, installRequested = true) }
            return
        }

        downloadJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isDownloadingUpdate = true,
                    updateApk = null,
                    updateError = null,
                    installRequested = false
                )
            }
            try {
                val apk = repository.download(update) { progress ->
                    _uiState.update {
                        it.copy(
                            updateProgress = progress,
                            partialDownloadBytes = progress.bytes
                        )
                    }
                }
                _uiState.update {
                    it.copy(
                        updateApk = apk,
                        installRequested = true,
                        partialDownloadBytes = 0L,
                        updateProgress = null
                    )
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                _uiState.update {
                    it.copy(
                        partialDownloadBytes = repository.getPartialDownloadSize()
                    )
                }
                throw e
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        partialDownloadBytes = repository.getPartialDownloadSize()
                    )
                }
                reportUpdateError(e.localizedMessage ?: "No se pudo descargar el APK")
            } finally {
                _uiState.update { it.copy(isDownloadingUpdate = false) }
            }
        }
    }

    fun cancelOrPauseDownload(repository: com.anics.nativeapp.updates.UpdateRepository? = null) {
        downloadJob?.cancel()
        downloadJob = null
        _uiState.update {
            it.copy(
                isDownloadingUpdate = false,
                partialDownloadBytes = repository?.getPartialDownloadSize() ?: it.partialDownloadBytes
            )
        }
    }

    fun restartDownload(repository: com.anics.nativeapp.updates.UpdateRepository) {
        cancelOrPauseDownload(repository)
        repository.deleteDownloadedApk()
        _uiState.update {
            it.copy(
                partialDownloadBytes = 0L,
                updateApk = null,
                updateProgress = null,
                updateError = null
            )
        }
        downloadUpdate(repository)
    }
    fun consumeInstallRequest() { _uiState.update { it.copy(installRequested = false) } }
    fun reportUpdateError(message: String) { _uiState.update { it.copy(updateError = message) } }
    fun showMessage(message: String) { _uiState.update { it.copy(message = message) } }
    private fun operation(success: String?, block: suspend () -> Unit) {
        if (_uiState.value.isExporting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isExporting = true, message = null) }
            try { block(); if (success != null) _uiState.update { it.copy(message = success) } }
            catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { _uiState.update { it.copy(message = e.localizedMessage ?: "No se pudo completar la operación") } }
            finally { _uiState.update { it.copy(isExporting = false) } }
        }
    }

    fun selectDefaultSource(sourceId: String) {
        viewModelScope.launch {
            settingsRepository.updateDefaultSource(sourceId)
        }
    }

    fun toggleAutoPlayNext(enabled: Boolean) {
        viewModelScope.launch {
            settingsRepository.updateAutoPlayNext(enabled)
        }
    }

    fun selectDownloadFolder(uri: String) { viewModelScope.launch { settingsRepository.updateDownloadFolderUri(uri); showMessage("Carpeta guardada. Busca los videos en Descargas.") } }
    fun selectPreferredServer(server: String) { viewModelScope.launch { settingsRepository.updatePreferredServer(server) } }
    fun selectDownloadServer(server: String) { viewModelScope.launch { settingsRepository.updateDownloadServer(server) } }
    fun selectDownloadLimit(limit: Int) { viewModelScope.launch { settingsRepository.updateMaxDownloads(limit) } }
    fun selectImageCache(limit: Int) { viewModelScope.launch { settingsRepository.updateImageCache(limit); showMessage("El límite de caché se aplicará al volver a abrir AniCS") } }
    fun toggleFallback(allow: Boolean) { viewModelScope.launch { settingsRepository.updateAllowFallback(allow) } }

    fun selectDefaultQuality(quality: String) {
        viewModelScope.launch {
            settingsRepository.updateDefaultQuality(quality)
        }
    }

    fun switchProfile(profileId: String) {
        viewModelScope.launch {
            profileRepository.switchProfile(profileId)
            refreshProfileStats()
            refreshDatabaseStats()
        }
    }

    fun createProfile(name: String, avatar: String) {
        viewModelScope.launch {
            profileRepository.createProfile(name, avatar)
            refreshProfileStats()
            refreshDatabaseStats()
        }
    }

    fun deleteProfile(profileId: String) {
        viewModelScope.launch {
            profileRepository.deleteProfile(profileId)
            refreshProfileStats()
            refreshDatabaseStats()
        }
    }

    fun refreshDatabaseStats() {
        viewModelScope.launch(Dispatchers.IO) {
            val dbFile = context?.getDatabasePath("anics.db")
            val sizeBytes = if (dbFile != null && dbFile.exists()) dbFile.length() else 0L
            val sizeFormatted = when {
                sizeBytes >= 1024 * 1024 -> String.format(java.util.Locale.US, "%.1f MB", sizeBytes.toDouble() / (1024 * 1024))
                sizeBytes >= 1024 -> String.format(java.util.Locale.US, "%.0f KB", sizeBytes.toDouble() / 1024)
                else -> "$sizeBytes B"
            }
            val historyCount = try { database?.historyDao()?.getHistoryCount() ?: 0 } catch (_: Exception) { 0 }
            val favoritesCount = try { database?.favoriteDao()?.getFavoritesCount() ?: 0 } catch (_: Exception) { 0 }
            _uiState.update { it.copy(databaseStats = DatabaseStats(sizeFormatted, historyCount, favoritesCount)) }
        }
    }

    fun refreshProfileStats() {
        viewModelScope.launch(Dispatchers.IO) {
            val currentProfiles = _uiState.value.profiles.ifEmpty {
                try { profileRepository.getAllProfiles().first() } catch (_: Exception) { emptyList() }
            }
            val statsMap = mutableMapOf<String, NativeProfileStats>()
            for (p in currentProfiles) {
                val list = try { database?.historyDao()?.getHistoryForProfileSync(p.id) ?: emptyList() } catch (_: Exception) { emptyList() }
                val completedOr80 = list.filter { item ->
                    item.completed || (item.watchProgress != null && item.watchProgress >= 0.80) ||
                        (item.durationSeconds > 0 && item.progressSeconds.toDouble() / item.durationSeconds.toDouble() >= 0.80)
                }
                val animesCount = completedOr80.map { it.animeTitle.trim().lowercase() }.distinct().size
                val episodesCount = completedOr80.map { "${it.animeTitle.trim().lowercase()}-${it.episodeNumber}" }.distinct().size
                val totalSeconds = completedOr80.sumOf { item ->
                    if (item.progressSeconds > 0) item.progressSeconds else ((item.watchProgress ?: 0.80) * (if (item.durationSeconds > 0) item.durationSeconds else 1440L)).toLong()
                }
                val hoursWatched = Math.round((totalSeconds.toDouble() / 3600.0) * 10.0) / 10.0
                statsMap[p.id] = NativeProfileStats(
                    animesCount = animesCount,
                    episodesCount = episodesCount,
                    hoursWatched = hoursWatched
                )
            }
            _uiState.update { it.copy(profileStats = statsMap) }
        }
    }

    fun optimizeDatabase() = operation("Base de datos optimizada y compactada (VACUUM exitoso).") {
        withContext(Dispatchers.IO) {
            database?.openHelper?.writableDatabase?.execSQL("VACUUM")
        }
        refreshDatabaseStats()
    }

    fun clearHistory() = operation("Historial eliminado correctamente.") {
        withContext(Dispatchers.IO) {
            val activeId = _uiState.value.activeProfile?.id
            if (activeId != null) {
                database?.historyDao()?.clearHistoryForProfile(activeId)
            } else {
                database?.historyDao()?.deleteAll()
            }
        }
        refreshDatabaseStats()
        refreshProfileStats()
    }

    fun resetDatabase() = operation("Base de datos restablecida.") {
        withContext(Dispatchers.IO) {
            database?.historyDao()?.deleteAll()
            database?.favoriteDao()?.deleteAll()
            database?.openHelper?.writableDatabase?.execSQL("VACUUM")
        }
        refreshDatabaseStats()
        refreshProfileStats()
    }
}
