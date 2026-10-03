package com.anics.nativeapp.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.anics.nativeapp.data.local.ProfileEntity
import com.anics.nativeapp.data.repository.AppSettings
import com.anics.nativeapp.data.repository.CatalogRepository
import com.anics.nativeapp.data.repository.ProfileRepository
import com.anics.nativeapp.data.repository.SettingsRepository
import com.anics.nativeapp.ffi.NativeSourceConfig
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

data class SettingsUiState(
    val settings: AppSettings = AppSettings(),
    val profiles: List<ProfileEntity> = emptyList(),
    val activeProfile: ProfileEntity? = null,
    val availableSources: List<NativeSourceConfig> = emptyList(),
    val appVersion: String = com.anics.nativeapp.BuildConfig.VERSION_NAME,
    val message: String? = null,
    val update: com.anics.nativeapp.updates.NativeUpdate? = null,
    val updateApk: java.io.File? = null,
    val isExporting: Boolean = false
)

class SettingsViewModel(
    private val settingsRepository: SettingsRepository,
    private val profileRepository: ProfileRepository,
    private val catalogRepository: CatalogRepository,
    private val backupManager: com.anics.nativeapp.sync.BackupManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        loadSettingsAndProfiles()
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
    fun checkUpdates(repository: com.anics.nativeapp.updates.UpdateRepository) = operation(null) {
        val update = repository.check()
        _uiState.update { it.copy(update = update, updateApk = null, message = if (update == null) "Tienes la versión más reciente" else "Nueva versión disponible: " + update.version) }
    }
    fun downloadUpdate(repository: com.anics.nativeapp.updates.UpdateRepository) = operation("APK verificado. Pulsa Instalar actualización.") {
        val update = _uiState.value.update ?: error("Comprueba actualizaciones primero")
        val apk = repository.download(update)
        _uiState.update { it.copy(updateApk = apk) }
    }
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
    fun toggleFallback(allow: Boolean) { viewModelScope.launch { settingsRepository.updateAllowFallback(allow) } }

    fun selectDefaultQuality(quality: String) {
        viewModelScope.launch {
            settingsRepository.updateDefaultQuality(quality)
        }
    }

    fun switchProfile(profileId: String) {
        viewModelScope.launch {
            profileRepository.switchProfile(profileId)
        }
    }

    fun createProfile(name: String, avatar: String) {
        viewModelScope.launch {
            profileRepository.createProfile(name, avatar)
        }
    }

    fun deleteProfile(profileId: String) {
        viewModelScope.launch {
            profileRepository.deleteProfile(profileId)
        }
    }
}
