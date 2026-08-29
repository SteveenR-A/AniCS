package com.anics.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Foreground Service inteligente que mantiene el proceso de Rust vivo y la CPU activa
 * mediante un Partial WakeLock mientras hay descargas en curso.
 *
 * Muestra notificaciones enriquecidas (BigTextStyle) que reflejan descargas simultáneas
 * de múltiples animes y episodios con progreso combinado y desglose detallado.
 */
class DownloadService : Service() {

    companion object {
        const val CHANNEL_ID = "anics_downloads"
        const val NOTIF_ID   = 1001
        var isRunning        = false
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        acquireWakeLock()
        createNotificationChannel()
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "AniCS:DownloadWakeLock"
                ).apply {
                    setReferenceCounted(false)
                    acquire(10 * 60 * 60 * 1000L) // Máximo 10 horas de seguridad
                }
            }
        } catch (e: Exception) {
            android.util.Log.w("AniCS", "No se pudo adquirir Partial WakeLock: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
            wakeLock = null
        } catch (e: Exception) {
            android.util.Log.w("AniCS", "No se pudo liberar Partial WakeLock: ${e.message}")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "START" -> {
                acquireWakeLock()
                val title    = intent.getStringExtra("title")   ?: "Descargas AniCS"
                val subtitle = intent.getStringExtra("subtitle") ?: "Iniciando descargas..."
                val details  = intent.getStringExtra("details")  ?: ""
                startForeground(NOTIF_ID, buildNotification(title, subtitle, details, 0, false))
            }

            "UPDATE" -> {
                val title    = intent.getStringExtra("title")    ?: "Descargas AniCS"
                val subtitle = intent.getStringExtra("subtitle") ?: ""
                val details  = intent.getStringExtra("details")  ?: ""
                val progress = intent.getIntExtra("progress", 0)
                val notif    = buildNotification(title, subtitle, details, progress, true)
                val manager  = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
                manager.notify(NOTIF_ID, notif)
            }

            "STOP" -> {
                isRunning = false
                releaseWakeLock()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        releaseWakeLock()
    }

    private fun buildNotification(
        title:        String,
        subtitle:     String,
        details:      String,
        progress:     Int,
        showProgress: Boolean,
    ): Notification {
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)

        if (details.isNotBlank()) {
            builder.setStyle(
                NotificationCompat.BigTextStyle()
                    .setBigContentTitle(title)
                    .setSummaryText(subtitle)
                    .bigText(details)
            )
        }

        if (showProgress) {
            builder.setProgress(100, progress, false)
        }

        return builder.build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Descargas AniCS",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description       = "Muestra el progreso de las descargas en curso"
            enableVibration(false)
            setShowBadge(false)
        }
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }
}
