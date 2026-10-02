package com.anics.nativeapp.data.repository

import com.anics.nativeapp.data.local.ProfileDao
import com.anics.nativeapp.data.local.ProfileEntity
import kotlinx.coroutines.flow.Flow

class ProfileRepository(private val profileDao: ProfileDao) {

    fun getAllProfiles(): Flow<List<ProfileEntity>> {
        return profileDao.getAllProfiles()
    }

    suspend fun getActiveProfile(): ProfileEntity {
        return profileDao.getActiveProfile() ?: run {
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

    suspend fun deleteProfile(profileId: String) {
        if (profileId != "default") {
            profileDao.deleteProfile(profileId)
            val active = profileDao.getActiveProfile()
            if (active == null) {
                profileDao.setActiveProfile("default")
            }
        }
    }
}
