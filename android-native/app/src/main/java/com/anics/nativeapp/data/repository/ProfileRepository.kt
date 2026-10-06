package com.anics.nativeapp.data.repository

import com.anics.nativeapp.data.local.ProfileDao
import com.anics.nativeapp.data.local.ProfileEntity
import kotlinx.coroutines.flow.Flow
import androidx.room.withTransaction
import kotlinx.serialization.json.*
import com.anics.nativeapp.data.local.TombstoneEntity

class ProfileRepository(private val database: com.anics.nativeapp.data.local.AppDatabase) {
    private val profileDao = database.profileDao()
    val activeProfile = profileDao.getActiveProfileFlow()

    fun getAllProfiles(): Flow<List<ProfileEntity>> {
        return profileDao.getAllProfiles()
    }

    suspend fun getActiveProfile(): ProfileEntity {
        return profileDao.getActiveProfile() ?: profileDao.getAllProfilesSync().firstOrNull()?.let {
            profileDao.setActiveProfile(it.id)
            it.copy(isActive = true)
        } ?: run {
            val default = ProfileEntity(
                id = "default",
                name = "Principal",
                avatar = "avatar-1",
                isActive = true,
                createdAt = System.currentTimeMillis()
            )
            profileDao.insert(default)
            default
        }
    }

    suspend fun switchProfile(profileId: String) {
        profileDao.setActiveProfile(profileId)
    }

    suspend fun createProfile(name: String, avatar: String): ProfileEntity {
        val newProfile = ProfileEntity(
            id = java.util.UUID.randomUUID().toString(),
            name = name,
            avatar = avatar,
            isActive = false,
            createdAt = System.currentTimeMillis()
        )
        profileDao.insert(newProfile)
        return newProfile
    }

    suspend fun updateProfile(id: String, name: String, avatar: String) {
        require(name.trim().isNotEmpty()) { "El nombre no puede estar vacío" }
        database.withTransaction {
            val profile = profileDao.getProfileById(id) ?: error("El perfil ya no existe")
            profileDao.update(profile.copy(name = name.trim(), avatar = avatar))
        }
    }

    suspend fun deleteProfile(profileId: String) {
        if (profileId != "default") {
            database.withTransaction {
                val payload = buildJsonObject { put("profileId", profileId); put("deletedAt", com.anics.nativeapp.sync.SyncContract.iso(System.currentTimeMillis())) }
                database.tombstoneDao().upsert(TombstoneEntity("profile:$profileId", "deletedProfiles", payload.toString()))
                database.historyDao().clearHistoryForProfile(profileId)
                database.favoriteDao().clearFavoritesForProfile(profileId)
                profileDao.deleteProfile(profileId)
            }
            val active = profileDao.getActiveProfile()
            if (active == null) {
                profileDao.setActiveProfile("default")
            }
        }
    }
}
