package com.anics.nativeapp.downloads

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.anics.nativeapp.MainActivity
import com.anics.nativeapp.data.local.AppDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first

class DownloadService : Service() {

    companion object {
        const val CHANNEL_ID = "anics_downloads_channel"
        const val NOTIFICATION_ID = 2001

        const val ACTION_START = "com.anics.nativeapp.downloads.START"
        const val ACTION_RESUME = "com.anics.nativeapp.downloads.RESUME"
        const val ACTION_PAUSE = "com.anics.nativeapp.downloads.PAUSE"
        const val ACTION_CANCEL = "com.anics.nativeapp.downloads.CANCEL"

        const val EXTRA_ID = "extra_download_id"
        const val EXTRA_TITLE = "extra_anime_title"
        const val EXTRA_EPISODE = "extra_episode_num"
        const val EXTRA_URL = "extra_stream_url"
        const val EXTRA_REFERER = "extra_referer"
    }

    private lateinit var downloadManager: DownloadManager
    private var hasSeenWork = false
    private val pendingCommands = java.util.concurrent.atomic.AtomicInteger(0)
    private val serviceScope = CoroutineScope(Dispatchers.IO + kotlinx.coroutines.SupervisorJob())

    override fun onCreate() {
        super.onCreate()
        val database = AppDatabase.getInstance(applicationContext)
        downloadManager = DownloadManager(applicationContext, database.downloadDao())
        createNotificationChannel()
        serviceScope.launch {
            database.downloadDao().getAllDownloads().collect { rows ->
                val active = rows.filter { it.status == "queued" || it.status == "downloading" }
                if (active.isNotEmpty()) {
                    hasSeenWork = true
                    val downloading = active.firstOrNull { it.status == "downloading" } ?: active.first()
                    val manager = getSystemService(NotificationManager::class.java)
                    manager.notify(NOTIFICATION_ID, buildNotification(downloading.animeTitle + " · Ep. " + downloading.episodeNumber, (downloading.progress * 100).toInt()))
                } else if (hasSeenWork && pendingCommands.get() == 0) stopSelf()
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        val downloadId = intent?.getStringExtra(EXTRA_ID)

        val notification = buildNotification("Descargando contenido...", 0)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        when (action) {
            ACTION_START -> {
                if (downloadId != null) {
                    val title = intent.getStringExtra(EXTRA_TITLE) ?: "Anime"
                    val ep = intent.getIntExtra(EXTRA_EPISODE, 1)
                    val url = intent.getStringExtra(EXTRA_URL) ?: ""
                    val referer = intent.getStringExtra(EXTRA_REFERER)

                    serviceScope.launch {
                        try { downloadManager.enqueueDownload(downloadId, title, ep, url, referer) }
                        catch (e: kotlinx.coroutines.CancellationException) { throw e }
                        catch (e: Exception) {
                            AppDatabase.getInstance(applicationContext).downloadDao().insertDownload(com.anics.nativeapp.data.local.DownloadEntity(
                                id = downloadId, animeTitle = title, episodeNumber = ep, streamUrl = url, referer = referer, outputPath = "", status = "failed",
                                error = e.localizedMessage ?: "No se pudo crear la descarga", createdAt = java.time.Instant.now().toString()))
                            stopSelf()
                        }
                    }
                }
            }
            ACTION_RESUME -> { downloadId?.let { id -> serviceScope.launch { downloadManager.resumeDownload(id) } } }
            ACTION_PAUSE -> {
                downloadId?.let { downloadManager.pauseDownload(it) }
            }
            ACTION_CANCEL -> {
                downloadId?.let { id ->
                    pendingCommands.incrementAndGet()
                    serviceScope.launch {
                        try { downloadManager.cancelDownload(id) }
                        finally {
                            pendingCommands.decrementAndGet()
                            if (AppDatabase.getInstance(applicationContext).downloadDao().getAllDownloads().first().none { it.status == "queued" || it.status == "downloading" }) stopSelf()
                        }
                    }
                }
            }
        }

        serviceScope.launch {
            kotlinx.coroutines.delay(1500)
            val rows = AppDatabase.getInstance(applicationContext).downloadDao().getAllDownloads().first()
            if (pendingCommands.get() == 0 && rows.none { it.status == "queued" || it.status == "downloading" }) stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() { downloadManager.close(); serviceScope.coroutineContext[kotlinx.coroutines.Job]?.cancel(); super.onDestroy() }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Descargas AniCS",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Progreso de descargas de episodios"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String, progress: Int): android.app.Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AniCS - Gestor de Descargas")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setProgress(100, progress, progress == 0)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }
}
