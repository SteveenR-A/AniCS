package com.anics.nativeapp.downloads

import android.content.Context
import com.anics.nativeapp.data.local.*
import com.anics.nativeapp.data.repository.SettingsRepository
import com.anics.nativeapp.ffi.NativeMediaType
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

@Serializable
data class DownloadRequest(val id: String, val animeTitle: String, val episodeNumber: Int,
    val streamUrl: String = "", val referer: String? = null, val animeUrl: String = "",
    val episodeUrl: String = "", val thumbnailUrl: String = "", val source: String = "jkanime")

class DownloadManager(private val context: Context, private val downloadDao: DownloadDao,
    private val storageManager: StorageManager = StorageManager(context)) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val activeJobs = ConcurrentHashMap<String, Job>()
    private val connections = ConcurrentHashMap<String, HttpURLConnection>()
    private val pausedTasks = ConcurrentHashMap.newKeySet<String>()
    private val cancelledTasks = ConcurrentHashMap.newKeySet<String>()
    private val admission = Mutex()
    private val submission = Mutex()
    private val controls = Mutex()
    private val order = AtomicLong(System.currentTimeMillis())
    private val settings = SettingsRepository(context)
    private val catalog by lazy { com.anics.nativeapp.data.repository.CatalogRepository() }
    init { scope.launch {
        downloadDao.recoverInterrupted()
        while (isActive) {
            try { schedule() } catch (e: CancellationException) { throw e } catch (_: Exception) { }
            delay(250)
        }
    } }
    suspend fun enqueueDownload(id: String, animeTitle: String, episodeNumber: Int, streamUrl: String, referer: String? = null): DownloadEntity {
        enqueueRequests(listOf(DownloadRequest(id, animeTitle, episodeNumber, streamUrl, referer)))
        return downloadDao.getDownloadById(id) ?: downloadDao.getAllDownloads().first().first { it.animeTitle == animeTitle && it.episodeNumber == episodeNumber }
    }
    suspend fun enqueueRequests(requests: List<DownloadRequest>) = submission.withLock {
        require(requests.size <= 5000) { "El lote supera 5000 episodios" }
        val folder = settings.settings.first().downloadFolderUri
        val known = downloadDao.getAllDownloads().first().associateBy { it.outputPath }.toMutableMap()
        val rows = mutableListOf<DownloadEntity>()
        for (request in requests) {
            require(!request.streamUrl.contains(".m3u8", true)) { "Elige un servidor MP4 para descargar" }
            val equivalent = known.values.firstOrNull { it.episodeNumber == request.episodeNumber && com.anics.nativeapp.sync.SyncContract.titleKey(it.animeTitle) == com.anics.nativeapp.sync.SyncContract.titleKey(request.animeTitle) &&
                (it.status in listOf("queued", "downloading", "paused") || it.status == "completed" && storageManager.getFileLength(it.outputPath) > 0) }
            if (equivalent != null) continue
            val path = storageManager.createDownloadTarget(folder, request.animeTitle, request.episodeNumber)
            val previous = known[path]
            val length = storageManager.getFileLength(path)
            if (previous != null && (previous.status in listOf("queued", "downloading", "paused") || previous.status == "completed" && length > 0)) continue
            val local = previous == null && length > 0
            val row = DownloadEntity(id = previous?.id ?: request.id, queueOrder = order.updateAndGet { maxOf(it + 1, System.currentTimeMillis()) },
                animeTitle = request.animeTitle, episodeNumber = request.episodeNumber, streamUrl = request.streamUrl, referer = request.referer,
                outputPath = path, status = if (local) "completed" else "queued", progress = if (local) 1f else 0f,
                downloadedBytes = length, totalBytes = if (local) length else null, createdAt = java.time.Instant.now().toString(),
                animeUrl = request.animeUrl, episodeUrl = request.episodeUrl, thumbnailUrl = request.thumbnailUrl, source = request.source)
            rows.add(row); known[path] = row
        }
        // All episodes reserve their position before resolution begins.
        downloadDao.insertBatch(rows)
    }
    private suspend fun schedule() = admission.withLock {
        val available = (settings.settings.first().maxConcurrentDownloads.coerceIn(1, 4) - activeJobs.size).coerceAtLeast(0)
        val rows = downloadDao.getAllDownloads().first().filter { it.status == "queued" && !activeJobs.containsKey(it.id) && it.id !in pausedTasks }.take(available)
        rows.forEach { row -> val job = scope.launch(start = CoroutineStart.LAZY) { transfer(row) }; activeJobs[row.id] = job; job.start() }
    }
    private suspend fun resolve(row: DownloadEntity): DownloadEntity {
        if (row.streamUrl.isNotBlank()) return row
        require(row.episodeUrl.isNotBlank()) { "No hay un episodio de catálogo asociado" }
        val options = settings.settings.first()
        catalog.updateSettings(kotlinx.serialization.json.JsonObject(settings.syncSettings.first().mapValues { kotlinx.serialization.json.JsonPrimitive(it.value) }).toString())
        val servers = withTimeout(60000) { catalog.getServers(row.episodeUrl, row.source) }
        val preferred = options.preferredDownloadServer
        val sorted = ServerSupport.ordered(servers).filter(ServerSupport::playable).sortedBy { if (it.name.equals(preferred, true)) 0 else 1 }
        val candidates = if (preferred.isNotBlank() && !options.allowFallback) sorted.filter { it.name.equals(preferred, true) } else sorted
        var reason = "No hay un servidor MP4 disponible"
        for (server in candidates) { try {
            val media = withTimeout(45000) { catalog.resolveStream(server, row.source) }
            if (media.mediaType == NativeMediaType.HLS || media.directUrl.contains(".m3u8", true)) { reason = "${server.name} ofrece HLS. Elige un servidor MP4 para descargar."; continue }
            return row.copy(streamUrl = media.directUrl, referer = media.referer).also { downloadDao.updateDownload(it) }
        } catch (e: CancellationException) { throw e } catch (e: Exception) { reason = e.localizedMessage ?: reason } }
        error(reason)
    }
    private suspend fun transfer(original: DownloadEntity) {
        var row = original
        var downloaded = storageManager.getFileLength(row.outputPath)
        var total: Long? = row.totalBytes
        try {
            downloadDao.updateTransfer(row.id, "downloading", row.progress, downloaded, total)
            row = resolve(row)
            currentCoroutineContext().ensureActive()
            val connection = (URL(row.streamUrl).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15000; readTimeout = 20000; instanceFollowRedirects = true
                setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36")
                setRequestProperty("Accept-Encoding", "identity")
                row.referer?.let { setRequestProperty("Referer", it) }
                if (downloaded > 0) setRequestProperty("Range", "bytes=$downloaded-")
            }
            connections[row.id] = connection
            currentCoroutineContext().ensureActive()
            connection.connect()
            val code = connection.responseCode
            if (code == 416) {
                total = connection.getHeaderField("Content-Range")?.substringAfter("bytes */", "")?.toLongOrNull()
                require(total != null && total == downloaded && downloaded > 0) { "No se pudo confirmar el archivo completo" }
                downloadDao.updateTransfer(row.id, "completed", 1f, downloaded, total); return
            }
            require(code == 200 || code == 206) { "Error HTTP $code" }
            require(!connection.contentType.orEmpty().contains("text/html", true) && !connection.contentType.orEmpty().contains("mpegurl", true)) { "El servidor no devolvió un video descargable" }
            val append = code == 206
            if (append) {
                val match = Regex("bytes (\\d+)-(\\d+)/(\\d+)").matchEntire(connection.getHeaderField("Content-Range").orEmpty())
                val start = match?.groupValues?.get(1)?.toLongOrNull()
                val end = match?.groupValues?.get(2)?.toLongOrNull()
                total = match?.groupValues?.get(3)?.toLongOrNull()
                require(start == downloaded && end != null && total != null && end >= start!! && end < total!! && (connection.contentLengthLong < 0 || connection.contentLengthLong == end - start + 1)) { "El servidor no respetó el rango de reanudación" }
            } else { downloaded = 0; total = connection.contentLengthLong.takeIf { it > 0 } }
            val (output, offset) = storageManager.openOutputStreamForAppend(row.outputPath, append)
            downloaded = offset
            var lastAt = android.os.SystemClock.elapsedRealtime(); var lastBytes = downloaded
            output.use { out -> connection.inputStream.use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    currentCoroutineContext().ensureActive()
                    val read = input.read(buffer); if (read < 0) break
                    currentCoroutineContext().ensureActive()
                    out.write(buffer, 0, read); downloaded += read
                    val now = android.os.SystemClock.elapsedRealtime()
                    if (now - lastAt >= 500) {
                        downloadDao.updateTransfer(row.id, "downloading", fraction(downloaded, total), downloaded, total, (downloaded - lastBytes) * 1000 / (now - lastAt).coerceAtLeast(1))
                        lastAt = now; lastBytes = downloaded
                    }
                }
                out.flush()
            } }
            require(downloaded > 0 && (total == null || downloaded == total)) { "La descarga está incompleta" }
            currentCoroutineContext().ensureActive()
            downloadDao.updateTransfer(row.id, "completed", 1f, downloaded, total ?: downloaded)
        } catch (e: Exception) {
            withContext(NonCancellable) {
                if (row.id !in cancelledTasks && downloadDao.getDownloadById(row.id) != null) {
                    val paused = e is CancellationException || row.id in pausedTasks
                    downloadDao.updateTransfer(row.id, if (paused) "paused" else "failed", fraction(downloaded, total), downloaded, total, 0,
                        if (paused) null else e.localizedMessage ?: "Error durante la descarga")
                }
            }
        } finally { connections.remove(row.id)?.disconnect(); activeJobs.remove(row.id, currentCoroutineContext()[Job]) }
    }
    suspend fun pauseDownload(id: String) = controls.withLock {
        val job = admission.withLock { pausedTasks.add(id); activeJobs[id]?.also { it.cancel(); connections[id]?.disconnect() } }
        job?.join()
        downloadDao.getDownloadById(id)?.takeIf { it.status in listOf("queued", "downloading") }?.let { downloadDao.updateTransfer(id, "paused", it.progress, it.downloadedBytes, it.totalBytes) }
    }
    suspend fun resumeDownload(id: String) = controls.withLock {
        activeJobs[id]?.join(); pausedTasks.remove(id)
        downloadDao.getDownloadById(id)?.takeIf { it.status != "completed" }?.let { downloadDao.updateTransfer(id, "queued", it.progress, it.downloadedBytes, it.totalBytes) }
    }
    fun startDownload(id: String) { scope.launch { resumeDownload(id) } }
    fun close() { scope.cancel(); connections.values.forEach { it.disconnect() } }
    suspend fun cancelDownload(id: String) = controls.withLock {
        val job = admission.withLock { cancelledTasks.add(id); pausedTasks.add(id); activeJobs[id]?.also { it.cancel(); connections[id]?.disconnect() } }
        try {
            job?.join()
            downloadDao.getDownloadById(id)?.let { storageManager.deleteFile(it.outputPath); downloadDao.deleteDownload(id) }
        } finally { cancelledTasks.remove(id); pausedTasks.remove(id) }
    }
    private fun fraction(bytes: Long, total: Long?) = if (total != null && total > 0) (bytes.toFloat() / total).coerceIn(0f, 1f) else 0f
}
