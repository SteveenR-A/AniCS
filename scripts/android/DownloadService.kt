package com.anics.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Foreground Service inteligente y robusto para mantener el proceso de Rust vivo
 * y la CPU activa durante descargas en segundo plano.
 *
 * Características:
 * 1. startForeground() garantizado inmediatamente en onCreate() para evitar ANR/crashes en Android 8+.
 * 2. Partial WakeLock seguro que permite apagar la pantalla sin detener la descarga ni el proceso Rust.
 * 3. Compatibilidad total con acciones cortas ("START", "UPDATE", "STOP") y completas ("com.anics.app.action.*").
 * 4. startForegroundSafe con captura de excepciones para Android 14+ (evita crashes por foregroundServiceType).
 * 5. Notificación enriquecida con BigTextStyle y barra de progreso que no emite ruidos repetitivos.
 */
class DownloadService : Service() {

    companion object {
        const val CHANNEL_ID = "anics_downloads"
        const val NOTIF_ID   = 1001

        const val ACTION_START  = "com.anics.app.action.START"
        const val ACTION_UPDATE = "com.anics.app.action.UPDATE"
        const val ACTION_STOP   = "com.anics.app.action.STOP"

        @Volatile
        var isRunning = false
            private set
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createNotificationChannel()

        // startForeground() inmediato en onCreate() para cumplir con la ventana de 5s de Android 8+
        val initialNotif = buildNotification(
            title        = "AniCS",
            subtitle     = "Preparando descargas...",
            details      = "",
            progress     = 0,
            showProgress = false
        )
        startForegroundSafe(NOTIF_ID, initialNotif)
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            Log.w("AniCS", "DownloadService reiniciado con intent nulo")
            return START_STICKY
        }

        when (intent.action) {
            "START", ACTION_START -> {
                isRunning = true
                acquireWakeLock()

                val title    = intent.getStringExtra("title")   ?: "Descargas AniCS"
                val subtitle = intent.getStringExtra("subtitle") ?: "Iniciando descargas..."
                val details  = intent.getStringExtra("details")  ?: ""

                val notif = buildNotification(title, subtitle, details, 0, false)
                startForegroundSafe(NOTIF_ID, notif)
            }

            "UPDATE", ACTION_UPDATE -> {
                val title    = intent.getStringExtra("title")    ?: "Descargas AniCS"
                val subtitle = intent.getStringExtra("subtitle") ?: ""
                val details  = intent.getStringExtra("details")  ?: ""
                val progress = intent.getIntExtra("progress", -1)

                val showProgress = progress in 0..100
                val notif = buildNotification(title, subtitle, details, progress, showProgress)

                val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
                manager.notify(NOTIF_ID, notif)
            }

            "STOP", ACTION_STOP -> {
                isRunning = false
                releaseWakeLock()
                stopForegroundSafe()
                stopSelf()
            }

            else -> {
                Log.w("AniCS", "Acción no reconocida en DownloadService: ${intent.action}")
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

    // -------------------------------------------------------------------------
    // WakeLock
    // -------------------------------------------------------------------------
    private fun acquireWakeLock() {
        try {
            if (wakeLock == null || wakeLock?.isHeld == false) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "AniCS:DownloadWakeLock"
                ).apply {
                    setReferenceCounted(false)
                    acquire(10 * 60 * 60 * 1000L) // 10 horas de seguridad
                }
            }
        } catch (e: Exception) {
            Log.w("AniCS", "No se pudo adquirir WakeLock: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
            wakeLock = null
        } catch (e: Exception) {
            Log.w("AniCS", "No se pudo liberar WakeLock: ${e.message}")
        }
    }

    // -------------------------------------------------------------------------
    // Construcción de Notificación
    // -------------------------------------------------------------------------
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
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Descargas AniCS",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Muestra el progreso de las descargas en curso"
            enableVibration(false)
            setShowBadge(false)
        }
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    // -------------------------------------------------------------------------
    // Inicio y detención segura de Foreground
    // -------------------------------------------------------------------------
    private fun startForegroundSafe(id: Int, notification: Notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // API 34+
                startForeground(
                    id,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { // API 29+
                @Suppress("DEPRECATION")
                startForeground(id, notification)
            } else {
                @Suppress("DEPRECATION")
                startForeground(id, notification)
            }
        } catch (e: Exception) {
            // Fallback por si la versión de Android requiere configuración especial de permisos
            Log.w("AniCS", "Aviso en startForegroundSafe con tipo: ${e.message}, reintentando sin tipo...")
            try {
                @Suppress("DEPRECATION")
                startForeground(id, notification)
            } catch (e2: Exception) {
                Log.e("AniCS", "Error crítico en startForeground: ${e2.message}")
            }
        }
    }

    private fun stopForegroundSafe() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (e: Exception) {
            Log.w("AniCS", "Error en stopForegroundSafe: ${e.message}")
        }
    }
}
