package com.anics.nativeapp

import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.PowerManager
import androidx.test.core.app.ApplicationProvider
import com.anics.nativeapp.updates.UpdateDownloadService
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowPowerManager

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class UpdateDownloadServiceTest {
    private val context get() = ApplicationProvider.getApplicationContext<Context>()
    private fun command(action: String, token: String) = Intent(context, UpdateDownloadService::class.java)
        .setAction(action).putExtra(UpdateDownloadService.EXTRA_TOKEN, token).putExtra("version", "v0.3.14")

    @Test fun screenOffKeepsTransferProtectedUntilItFinishes() {
        val controller = Robolectric.buildService(UpdateDownloadService::class.java).create()
        val service = controller.get()
        try {
            service.onStartCommand(command(UpdateDownloadService.ACTION_START, "update"), 0, 1)
            val lock = ShadowPowerManager.getLatestWakeLock()
            assertTrue(lock.isHeld)
            assertNotNull(shadowOf(service).lastForegroundNotification)
            val info = context.packageManager.getServiceInfo(android.content.ComponentName(context, UpdateDownloadService::class.java), 0)
            assertEquals(ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC, info.foregroundServiceType)

            shadowOf(context.getSystemService(PowerManager::class.java)).setIsInteractive(false)
            service.onStartCommand(command(UpdateDownloadService.ACTION_PROGRESS, "update").putExtra("progress", 40), 0, 2)
            assertTrue(lock.isHeld)
            assertEquals("Descargando v0.3.14 · 40%",
                shadowOf(context.getSystemService(android.app.NotificationManager::class.java))
                    .getNotification(UpdateDownloadService.NOTIFICATION_ID).extras.getCharSequence(android.app.Notification.EXTRA_TEXT).toString())

            service.onStartCommand(command(UpdateDownloadService.ACTION_FINISH, "update"), 0, 3)
            assertFalse(lock.isHeld)
        } finally { controller.destroy() }
    }

    @Test fun endingAnEarlierTransferDoesNotStopItsReplacement() {
        val controller = Robolectric.buildService(UpdateDownloadService::class.java).create()
        val service = controller.get()
        try {
            service.onStartCommand(command(UpdateDownloadService.ACTION_START, "old"), 0, 1)
            service.onStartCommand(command(UpdateDownloadService.ACTION_START, "new"), 0, 2)
            val lock = ShadowPowerManager.getLatestWakeLock()
            service.onStartCommand(command(UpdateDownloadService.ACTION_FINISH, "old"), 0, 3)
            assertTrue(lock.isHeld)
            service.onStartCommand(command(UpdateDownloadService.ACTION_FINISH, "new"), 0, 4)
            assertFalse(lock.isHeld)
        } finally { controller.destroy() }
    }

    @Test fun serviceDestructionReleasesTheWakeLock() {
        val controller = Robolectric.buildService(UpdateDownloadService::class.java).create()
        val lock = ShadowPowerManager.getLatestWakeLock()
        assertTrue(lock.isHeld)
        controller.destroy()
        assertFalse(lock.isHeld)
    }
}
