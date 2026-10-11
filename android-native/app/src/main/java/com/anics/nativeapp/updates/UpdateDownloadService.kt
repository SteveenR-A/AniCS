package com.anics.nativeapp.updates

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.anics.nativeapp.MainActivity
import java.io.Closeable
import java.util.UUID

/** Protects the native updater transfer without keeping the display on. */
class UpdateDownloadService : Service() {
    companion object {
        const val CHANNEL_ID = "anics_update_download"
        const val NOTIFICATION_ID = 2002
        internal const val ACTION_START = "com.anics.nativeapp.updates.START"
        internal const val ACTION_PROGRESS = "com.anics.nativeapp.updates.PROGRESS"
        internal const val ACTION_FINISH = "com.anics.nativeapp.updates.FINISH"
        internal const val EXTRA_TOKEN = "token"

        fun start(context: Context, version: String): Session {
            val app = context.applicationContext
            val token = UUID.randomUUID().toString()
            ContextCompat.startForegroundService(app, Intent(app, UpdateDownloadService::class.java)
                .setAction(ACTION_START).putExtra(EXTRA_TOKEN, token).putExtra("version", version))
            return Session(app, token)
        }
    }

    class Session internal constructor(private val context: Context, private val token: String) : Closeable {
        fun progress(value: UpdateDownloadProgress) {
            context.startService(Intent(context, UpdateDownloadService::class.java)
                .setAction(ACTION_PROGRESS).putExtra(EXTRA_TOKEN, token)
                .putExtra("progress", (value.fraction * 100).toInt()).putExtra("verifying", value.verifying))
        }
        override fun close() {
            context.startService(Intent(context, UpdateDownloadService::class.java)
                .setAction(ACTION_FINISH).putExtra(EXTRA_TOKEN, token))
        }
    }

    private val transfers = mutableMapOf<String, String>()
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Actualizaciones AniCS", NotificationManager.IMPORTANCE_LOW))
        val initial = notification("Preparando actualización…", 0, true)
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, initial, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else startForeground(NOTIFICATION_ID, initial)
        acquireWakeLock()
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AniCS:UpdateDownload").apply {
                setReferenceCounted(false)
                acquire(30 * 60 * 1000L)
            }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val token = intent?.getStringExtra(EXTRA_TOKEN)
        when (intent?.action) {
            ACTION_START -> if (token != null) {
                acquireWakeLock()
                transfers[token] = intent.getStringExtra("version").orEmpty()
                getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID,
                    notification("Descargando ${transfers[token]}", 0, true))
            }
            ACTION_PROGRESS -> if (token != null && token in transfers) {
                val verifying = intent.getBooleanExtra("verifying", false)
                val progress = intent.getIntExtra("progress", 0)
                getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID,
                    notification(if (verifying) "Verificando APK…" else "Descargando ${transfers[token]} · $progress%", progress, verifying))
            }
            ACTION_FINISH -> if (token != null) transfers.remove(token)
        }
        if (transfers.isEmpty()) {
            releaseWakeLock()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf(startId)
        }
        return START_NOT_STICKY
    }

    private fun notification(text: String, progress: Int, indeterminate: Boolean): Notification {
        val open = PendingIntent.getActivity(this, NOTIFICATION_ID,
            Intent(this, MainActivity::class.java).putExtra("open_updates", true),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("Actualización AniCS")
            .setContentText(text).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .setProgress(100, progress.coerceIn(0, 100), indeterminate).build()
    }

    private fun releaseWakeLock() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    override fun onBind(intent: Intent?): IBinder? = null
    override fun onDestroy() { releaseWakeLock(); super.onDestroy() }
}
