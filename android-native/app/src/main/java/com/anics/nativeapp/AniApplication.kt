package com.anics.nativeapp

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache

class AniApplication : Application(), ImageLoaderFactory {
    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .memoryCache { MemoryCache.Builder(this).maxSizePercent(.08).build() }
        .diskCache { DiskCache.Builder().directory(java.io.File(cacheDir, "covers"))
            .maxSizeBytes(getSharedPreferences("image_cache", MODE_PRIVATE).getInt("limit_mb", 300).coerceIn(100, 1024) * 1024L * 1024).build() }
        .crossfade(true).build()
}
