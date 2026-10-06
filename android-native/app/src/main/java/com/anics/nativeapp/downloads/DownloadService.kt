package com.anics.nativeapp.downloads

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.os.*
import androidx.core.app.NotificationCompat
import com.anics.nativeapp.MainActivity
import com.anics.nativeapp.data.local.*
import com.anics.nativeapp.ui.components.formatBytes
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json

class DownloadService : Service() {
    companion object {
        const val CHANNEL_ID = "anics_downloads_channel"
        const val NOTIFICATION_ID = 2001
        const val ACTION_START = "com.anics.nativeapp.downloads.START"
        const val ACTION_BATCH = "com.anics.nativeapp.downloads.BATCH"
        const val ACTION_RESUME = "com.anics.nativeapp.downloads.RESUME"
        const val ACTION_PAUSE = "com.anics.nativeapp.downloads.PAUSE"
        const val ACTION_CANCEL = "com.anics.nativeapp.downloads.CANCEL"
        const val EXTRA_ID = "extra_download_id"
        const val EXTRA_TITLE = "extra_anime_title"
        const val EXTRA_EPISODE = "extra_episode_num"
        const val EXTRA_URL = "extra_stream_url"
        const val EXTRA_REFERER = "extra_referer"
        const val EXTRA_BATCH = "extra_batch"
        fun enqueue(context: Context, requests: List<DownloadRequest>) {
            // Large seasons use an app-private payload rather than overflowing Binder extras.
            val file = java.io.File(context.cacheDir, "download-batch-${java.util.UUID.randomUUID()}.json")
            file.writeText(Json.encodeToString(kotlinx.serialization.builtins.ListSerializer(DownloadRequest.serializer()), requests))
            androidx.core.content.ContextCompat.startForegroundService(context, Intent(context, DownloadService::class.java)
                .setAction(ACTION_BATCH).putExtra(EXTRA_BATCH, file.name))
        }
    }
    private lateinit var manager: DownloadManager
    private lateinit var dao: DownloadDao
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var lastCommand: Job? = null
    private val commands = java.util.concurrent.atomic.AtomicInteger(0)
    private var started = false
    private var sawWork = false
    @Volatile private var commandError: String? = null
    override fun onCreate() {
        super.onCreate()
        dao = AppDatabase.getInstance(applicationContext).downloadDao()
        val notifications = getSystemService(NotificationManager::class.java)
        notifications.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Descargas AniCS", NotificationManager.IMPORTANCE_LOW))
        manager = DownloadManager(applicationContext, dao)
        scope.launch { dao.getAllDownloads().collect { rows ->
            if (started) updateNotification(rows)
        } }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        commands.incrementAndGet()
        commandError = null
        val initial = notification(null, emptyList())
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, initial, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else startForeground(NOTIFICATION_ID, initial)
        started = true
        // Preserve Intent arrival order even when an earlier season takes longer to parse.
        val previousCommand = lastCommand
        lastCommand = scope.launch {
            previousCommand?.join()
            val id = intent?.getStringExtra(EXTRA_ID)
            try {
                when (intent?.action) {
                    ACTION_BATCH -> {
                        val name = intent.getStringExtra(EXTRA_BATCH) ?: error("No hay un lote")
                        require(Regex("download-batch-[a-f0-9-]+\\.json").matches(name))
                        val file = java.io.File(cacheDir, name)
                        try { manager.enqueueRequests(Json.decodeFromString(kotlinx.serialization.builtins.ListSerializer(DownloadRequest.serializer()), file.readText())) }
                        finally { file.delete() }
                    }
                    ACTION_START -> if (id != null) manager.enqueueDownload(id, intent.getStringExtra(EXTRA_TITLE) ?: "Anime", intent.getIntExtra(EXTRA_EPISODE, 1), intent.getStringExtra(EXTRA_URL) ?: "", intent.getStringExtra(EXTRA_REFERER))
                    ACTION_PAUSE -> if (id != null) manager.pauseDownload(id)
                    ACTION_RESUME -> if (id != null) manager.resumeDownload(id)
                    ACTION_CANCEL -> if (id != null) manager.cancelDownload(id)
                }
                sawWork = true
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                commandError = e.localizedMessage ?: "No se pudo iniciar la descarga"
                sawWork = true
            } finally {
                commands.decrementAndGet()
                updateNotification(dao.getAllDownloads().first())
            }
        }
        return START_NOT_STICKY
    }
    private fun updateNotification(rows: List<DownloadEntity>) {
        val active = rows.filter { it.status in listOf("queued", "downloading") }
        if (active.isNotEmpty()) sawWork = true
        if (active.isNotEmpty() || commands.get() == 0) {
            val row = active.firstOrNull { it.status == "downloading" } ?: active.firstOrNull()
                ?: rows.firstOrNull { it.status in listOf("paused", "failed") } ?: rows.lastOrNull()
            getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(row, active))
        }
        if (active.isEmpty() && commands.get() == 0 && sawWork) {
            stopForeground(STOP_FOREGROUND_DETACH)
            stopSelf()
        }
    }
    internal fun notification(row: DownloadEntity?, active: List<DownloadEntity>): Notification {
        val launch = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).putExtra("open_downloads", true), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val running = row?.status in listOf("queued", "downloading")
        val size = row?.let { DownloadSizes.info(it.downloadedBytes, it.totalBytes, it.progress) }
        val text = when (row?.status) {
            "downloading" -> com.anics.nativeapp.ui.components.downloadTransferText(row) + " · ${active.size} pendientes"
            "queued" -> "En cola · Preparando servidor"
            "paused" -> "Pausada · ${formatBytes(row.downloadedBytes)}"
            "failed" -> row.error ?: "No se pudo descargar"
            "completed" -> "Descarga completada"
            else -> commandError ?: "Preparando descargas…"
        }
        val builder = NotificationCompat.Builder(this, CHANNEL_ID).setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(row?.let { "${it.animeTitle} · Ep. ${it.episodeNumber}" } ?: "Descargas AniCS")
            .setContentText(text).setOnlyAlertOnce(true).setContentIntent(launch).setOngoing(running).setAutoCancel(!running)
        if (row != null && row.status != "completed") {
            builder.setProgress(100, ((size?.fraction ?: 0f) * 100).toInt(), row.status == "queued" || (running && size?.fraction == null))
            val action = if (running) ACTION_PAUSE else ACTION_RESUME
            builder.addAction(if (running) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (running) "Pausar" else "Reanudar", actionIntent(row.id, action))
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cancelar", actionIntent(row.id, ACTION_CANCEL))
        }
        return builder.build()
    }
    private fun actionIntent(id: String, action: String) = PendingIntent.getForegroundService(this, (id + action).hashCode(),
        Intent(this, DownloadService::class.java).setAction(action).putExtra(EXTRA_ID, id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onDestroy() { manager.close(); scope.cancel(); super.onDestroy() }
}
