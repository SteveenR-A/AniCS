package com.anics.nativeapp.ui.components

import com.anics.nativeapp.data.local.DownloadEntity
import com.anics.nativeapp.downloads.DownloadSizes

internal fun downloadTransferText(download: DownloadEntity): String {
    val size = DownloadSizes.info(download.downloadedBytes, download.totalBytes, download.progress)
    val percent = size.fraction?.let { "${(it * 100).toInt()}% · " }.orEmpty()
    val total = size.total?.let { if (size.estimated) " / ≈ ${formatBytes(it)} (estimado)" else " / ${formatBytes(it)}" }
        ?: " · Total no disponible"
    return percent + formatBytes(download.downloadedBytes) + total +
        if (download.status == "downloading") " · ${formatBytes(download.speedBytesPerSecond)}/s" else ""
}
