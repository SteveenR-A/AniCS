package com.anics.nativeapp.sync

import kotlinx.serialization.Serializable

@Serializable
data class SyncDataV2(
    val syncMeta: SyncMetaDto,
    val profiles: List<ProfileSyncDto> = emptyList(),
    val history: List<HistorySyncDto> = emptyList(),
    val favorites: List<FavoriteSyncDto> = emptyList(),
    val settingsMobile: SettingsMobileSyncDto? = null,
    val updatedAt: Long = System.currentTimeMillis()
)

@Serializable
data class SyncMetaDto(
    val schemaVersion: Int = 2,
    val deviceId: String,
    val clientType: String = "android-native",
    val lastSyncAt: Long = System.currentTimeMillis(),
    val tombstones: List<TombstoneDto> = emptyList()
)

@Serializable
data class TombstoneDto(
    val entityType: String, // "history", "favorite", "profile"
    val profileId: String,
    val entityKey: String, // url or profile id
    val deletedAt: Long
)

@Serializable
data class ProfileSyncDto(
    val id: String,
    val name: String,
    val avatar: String,
    val createdAt: Long
)

@Serializable
data class HistorySyncDto(
    val profileId: String,
    val animeTitle: String,
    val animeUrl: String,
    val episodeNumber: Int,
    val episodeUrl: String,
    val thumbnailUrl: String,
    val source: String,
    val progressSeconds: Long,
    val durationSeconds: Long,
    val completed: Boolean,
    val lastWatchedAt: Long
)

@Serializable
data class FavoriteSyncDto(
    val profileId: String,
    val title: String,
    val url: String,
    val thumbnailUrl: String,
    val source: String,
    val addedAt: Long
)

@Serializable
data class SettingsMobileSyncDto(
    val defaultSource: String = "jkanime",
    val autoPlayNext: Boolean = true,
    val defaultQuality: String = "auto"
)
