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

data class SettingsUiState(
    val settings: AppSettings = AppSettings(),
    val profiles: List<ProfileEntity> = emptyList(),
    val activeProfile: ProfileEntity? = null,
    val availableSources: List<NativeSourceConfig> = emptyList(),
    val appVersion: String = "0.2.11-preview",
    val isExporting: Boolean = false
)

class SettingsViewModel(
    private val settingsRepository: SettingsRepository,
    private val profileRepository: ProfileRepository,
    private val catalogRepository: CatalogRepository
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
            try {
                val sources = catalogRepository.getAvailableSources()
                _uiState.value = _uiState.value.copy(availableSources = sources)
            } catch (_: Exception) {}
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
