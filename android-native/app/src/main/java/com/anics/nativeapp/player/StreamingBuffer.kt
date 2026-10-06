package com.anics.nativeapp.player

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl

/** VOD reserve comparable to the Tauri player, with a target for compressed media memory. */
@OptIn(UnstableApi::class)
internal fun streamingLoadControl() = DefaultLoadControl.Builder()
    .setBufferDurationsMs(60_000, 120_000, 4_000, 10_000)
    .setTargetBufferBytes(64 * 1024 * 1024)
    .setPrioritizeTimeOverSizeThresholds(false)
    .setBackBuffer(15_000, true)
    .build()
