package com.anics.nativeapp.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.anics.nativeapp.data.local.FavoriteEntity
import com.anics.nativeapp.data.repository.FavoriteRepository
import com.anics.nativeapp.data.repository.ProfileRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class FavoritesUiState(
    val isLoading: Boolean = true,
    val favorites: List<FavoriteEntity> = emptyList(),
    val profileName: String = ""
)

@OptIn(ExperimentalCoroutinesApi::class)
class FavoritesViewModel(
    private val favoriteRepository: FavoriteRepository,
    private val profileRepository: ProfileRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(FavoritesUiState())
    val uiState: StateFlow<FavoritesUiState> = _uiState.asStateFlow()

    init {
        loadFavorites()
    }

    private fun loadFavorites() {
        viewModelScope.launch {
            profileRepository.activeProfile.filterNotNull().flatMapLatest { activeProfile ->
                _uiState.update { it.copy(profileName = activeProfile.name) }
                favoriteRepository.getFavoritesForProfile(activeProfile.id)
            }.collect { list ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        favorites = list
                    )
                }
        }
    }

    fun removeFavorite(animeUrl: String) {
        viewModelScope.launch {
            val activeProfile = profileRepository.getActiveProfile()
            favoriteRepository.removeFavorite(activeProfile.id, animeUrl)
        }
    }
}
