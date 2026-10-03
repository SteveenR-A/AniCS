package com.anics.nativeapp

import android.app.Notification
import com.anics.nativeapp.data.local.DownloadEntity
import com.anics.nativeapp.downloads.DownloadService
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadNotificationTest {
    @Test fun notificationExposesProgressSpeedAndPauseOrResumeActions() {
        val service = Robolectric.buildService(DownloadService::class.java).get()
        val row = DownloadEntity("notification", animeTitle = "Anime", episodeNumber = 3, streamUrl = "", outputPath = "/video.mp4", status = "downloading", progress = .42f, totalBytes = 10000, speedBytesPerSecond = 1024, createdAt = "2026-10-02")
        val running = service.notification(row, listOf(row))
        assertEquals(42, running.extras.getInt(Notification.EXTRA_PROGRESS))
        assertTrue(running.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("/s"))
        assertEquals(listOf("Pausar", "Cancelar"), running.actions.map { it.title.toString() })
        assertNotNull(running.contentIntent)
        val paused = service.notification(row.copy(status = "paused"), emptyList())
        assertEquals(listOf("Reanudar", "Cancelar"), paused.actions.map { it.title.toString() })
        assertEquals(0, paused.flags and Notification.FLAG_ONGOING_EVENT)
    }
}
