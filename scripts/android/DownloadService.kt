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
import java.util.concurrent.atomic.AtomicInteger

/**
 * Foreground Service inteligente y robusto para mantener el proceso de Rust vivo
 * y la CPU activa durante descargas en segundo plano.
 *
 * Características:
 * 1. startForeground() garantizado inmediatamente en onCreate() para evitar ANR/crashes en Android 8+.
 * 2. Partial WakeLock seguro que permite apagar la pantalla sin detener la descarga ni el proceso Rust.
 * 3. Notificaciones nativas para:
 *    - Progreso en tiempo real (BigTextStyle agrupado, canal 'anics_downloads').
 *    - Descarga completada con aviso sonoro/vibratorio (canal 'anics_complete').
 *    - Notificación de nueva versión disponible (canal 'anics_updates').
 * 4. startForegroundSafe con captura de excepciones para Android 14+ (evita crashes por foregroundServiceType).
 */
class DownloadService : Service() {

    companion object {
        const val TAG = "AniCS-DownloadService"

        // Canales de Notificación
        const val CHANNEL_DOWNLOADS_ID = "anics_downloads"
        const val CHANNEL_COMPLETE_ID  = "anics_complete"
        const val CHANNEL_UPDATES_ID   = "anics_updates"

        // IDs base de Notificaciones
        const val NOTIF_ID_PROGRESS    = 1001
        const val NOTIF_ID_UPDATE      = 2001
        private val completeNotifCounter = AtomicInteger(3000)

        // Acciones Intent
        const val ACTION_START        = "com.anics.app.action.START"
        const val ACTION_UPDATE       = "com.anics.app.action.UPDATE"
        const val ACTION_STOP         = "com.anics.app.action.STOP"
        const val ACTION_COMPLETE     = "com.anics.app.action.COMPLETE"
        const val ACTION_UPDATE_NOTIF = "com.anics.app.action.UPDATE_NOTIF"

        @Volatile
        var isRunning = false
            private set
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createNotificationChannels()

        // startForeground() inmediato en onCreate() para cumplir con la ventana de 5s de Android 8+
        val initialNotif = buildProgressNotification(
            title        = "AniCS",
            subtitle     = "Preparando descargas...",
            details      = "",
            progress     = 0,
            showProgress = false
        )
        startForegroundSafe(NOTIF_ID_PROGRESS, initialNotif)
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            Log.w(TAG, "DownloadService reiniciado con intent nulo")
            return START_STICKY
        }

        when (intent.action) {
            "START", ACTION_START -> {
                isRunning = true
                acquireWakeLock()

                val title    = intent.getStringExtra("title")   ?: "Descargas AniCS"
                val subtitle = intent.getStringExtra("subtitle") ?: "Iniciando descargas..."
                val details  = intent.getStringExtra("details")  ?: ""

                val notif = buildProgressNotification(title, subtitle, details, 0, false)
                startForegroundSafe(NOTIF_ID_PROGRESS, notif)
            }

            "UPDATE", ACTION_UPDATE -> {
                if (!isRunning) {
                    isRunning = true
                    acquireWakeLock()
                }
                val title    = intent.getStringExtra("title")    ?: "Descargas AniCS"
                val subtitle = intent.getStringExtra("subtitle") ?: ""
                val details  = intent.getStringExtra("details")  ?: ""
                val progress = intent.getIntExtra("progress", -1)

                val showProgress = progress in 0..100
                val notif = buildProgressNotification(title, subtitle, details, progress, showProgress)

                val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
                manager.notify(NOTIF_ID_PROGRESS, notif)
            }

            "STOP", ACTION_STOP -> {
                isRunning = false
                releaseWakeLock()
                stopForegroundSafe()
                stopSelf()
            }

            "COMPLETE", ACTION_COMPLETE -> {
                val title       = intent.getStringExtra("title")       ?: "Anime"
                val episodeInfo = intent.getStringExtra("episodeInfo") ?: "Episodio descargado"
                showCompletionNotification(title, episodeInfo)
            }

            "UPDATE_NOTIF", ACTION_UPDATE_NOTIF -> {
                val title = intent.getStringExtra("title") ?: "AniCS · Nueva versión disponible"
                val body  = intent.getStringExtra("body")  ?: "Hay una actualización lista para instalar."
                showUpdateAvailableNotification(title, body)
            }

            else -> {
                Log.w(TAG, "Acción no reconocida en DownloadService: ${intent.action}")
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
                    acquire(10 * 60 * 60 * 1000L) // 10 horas de seguridad máxima
                }
                Log.d(TAG, "Partial WakeLock adquirido")
            }
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo adquirir WakeLock: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.d(TAG, "Partial WakeLock liberado")
            }
            wakeLock = null
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo liberar WakeLock: ${e.message}")
        }
    }

    // -------------------------------------------------------------------------
    // Construcción de Notificaciones
    // -------------------------------------------------------------------------
    private fun buildProgressNotification(
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

        val builder = NotificationCompat.Builder(this, CHANNEL_DOWNLOADS_ID)
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

    private fun showCompletionNotification(title: String, episodeInfo: String) {
        try {
            val openIntent = PendingIntent.getActivity(
                this,
                0,
                packageManager.getLaunchIntentForPackage(packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

            val notif = NotificationCompat.Builder(this, CHANNEL_COMPLETE_ID)
                .setContentTitle("Descarga completada")
                .setContentText("$title · $episodeInfo")
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentIntent(openIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setStyle(
                    NotificationCompat.BigTextStyle()
                        .setBigContentTitle("Descarga completada")
                        .bigText("Se ha completado la descarga de $title ($episodeInfo). Ya puedes reproducirlo sin conexión.")
                )
                .build()

            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            val notifId = completeNotifCounter.incrementAndGet()
            manager.notify(notifId, notif)
            Log.i(TAG, "Notificación de descarga completada emitida para: $title ($episodeInfo)")
        } catch (e: Exception) {
            Log.e(TAG, "Error mostrando notificación de completado: ${e.message}", e)
        }
    }

    private fun showUpdateAvailableNotification(title: String, body: String) {
        try {
            val openIntent = PendingIntent.getActivity(
                this,
                0,
                packageManager.getLaunchIntentForPackage(packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

            val notif = NotificationCompat.Builder(this, CHANNEL_UPDATES_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentIntent(openIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .build()

            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIF_ID_UPDATE, notif)
            Log.i(TAG, "Notificación de actualización emitida: $title")
        } catch (e: Exception) {
            Log.e(TAG, "Error mostrando notificación de actualización: ${e.message}", e)
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        // 1. Canal de progreso en curso (baja intrusión sonora para no pitar a cada fragmento)
        val dlChannel = NotificationChannel(
            CHANNEL_DOWNLOADS_ID,
            "Descargas en curso",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Muestra el progreso continuo de las descargas"
            enableVibration(false)
            setShowBadge(false)
        }
        manager.createNotificationChannel(dlChannel)

        // 2. Canal de descargas completadas (aviso visible con alerta en barra superior)
        val completeChannel = NotificationChannel(
            CHANNEL_COMPLETE_ID,
            "Descargas completadas",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Avisos al finalizar la descarga de episodios"
            enableVibration(true)
            setShowBadge(true)
        }
        manager.createNotificationChannel(completeChannel)

        // 3. Canal de nuevas versiones disponibles
        val updatesChannel = NotificationChannel(
            CHANNEL_UPDATES_ID,
            "Actualizaciones de la aplicación",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Notificaciones de nuevas versiones de AniCS"
            enableVibration(true)
            setShowBadge(true)
        }
        manager.createNotificationChannel(updatesChannel)
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
            Log.w(TAG, "Aviso en startForegroundSafe con tipo: ${e.message}, reintentando sin tipo...")
            try {
                @Suppress("DEPRECATION")
                startForeground(id, notification)
            } catch (e2: Exception) {
                Log.e(TAG, "Error crítico en startForeground: ${e2.message}")
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
            Log.w(TAG, "Error en stopForegroundSafe: ${e.message}")
        }
    }
}
