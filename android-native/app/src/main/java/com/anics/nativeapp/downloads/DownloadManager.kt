package com.anics.nativeapp.downloads

import android.content.Context
import com.anics.nativeapp.data.local.*
import com.anics.nativeapp.data.repository.SettingsRepository
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
    private val sizeConnections = ConcurrentHashMap<String, HttpURLConnection>()
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
        // A restart or clock adjustment must not place new requests ahead of saved ones.
        val lastOrder = known.values.maxOfOrNull { it.queueOrder } ?: 0L
        order.updateAndGet { maxOf(it, lastOrder) }
        val rows = mutableListOf<DownloadEntity>()
        for (request in requests) {
            val equivalent = known.values.firstOrNull { it.episodeNumber == request.episodeNumber && com.anics.nativeapp.sync.SyncContract.titleKey(it.animeTitle) == com.anics.nativeapp.sync.SyncContract.titleKey(request.animeTitle) &&
                (it.status in listOf("queued", "downloading", "paused") || it.status == "completed" && runCatching { storageManager.requireReadableVideo(it.outputPath, it.totalBytes) }.isSuccess) }
            if (equivalent != null) continue
            val extension = if (request.streamUrl.contains(".m3u8", true)) "ts" else "mp4"
            val target = runCatching { storageManager.createDownloadTarget(folder, request.animeTitle, request.episodeNumber, extension) }
            if (target.isFailure) {
                rows.add(DownloadEntity(id = request.id, queueOrder = order.incrementAndGet(), animeTitle = request.animeTitle,
                    episodeNumber = request.episodeNumber, streamUrl = request.streamUrl, referer = request.referer,
                    outputPath = "", status = "failed", error = target.exceptionOrNull()?.localizedMessage ?: "No se pudo preparar el destino",
                    createdAt = java.time.Instant.now().toString(), animeUrl = request.animeUrl, episodeUrl = request.episodeUrl,
                    thumbnailUrl = request.thumbnailUrl, source = request.source))
                continue
            }
            val path = target.getOrThrow()
            val previous = known[path]
            val length = storageManager.getFileLength(path)
            if (previous != null && (previous.status in listOf("queued", "downloading", "paused") || previous.status == "completed" && runCatching { storageManager.requireReadableVideo(path, previous.totalBytes) }.isSuccess)) continue
            val local = previous == null && length > 0 && runCatching { storageManager.requireReadableVideo(path) }.isSuccess
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
    private suspend fun resolve(row: DownloadEntity, forceRefresh: Boolean = false): DownloadEntity {
        if (!forceRefresh && row.streamUrl.isNotBlank()) return row
        require(row.episodeUrl.isNotBlank()) { "No hay un episodio de catálogo asociado" }
        val options = settings.settings.first()
        catalog.updateSettings(kotlinx.serialization.json.JsonObject(settings.syncSettings.first().mapValues { kotlinx.serialization.json.JsonPrimitive(it.value) }).toString())
        val servers = withTimeout(60000) { catalog.getServers(row.episodeUrl, row.source) }
        val preferred = options.preferredDownloadServer
        val sorted = ServerSupport.ordered(servers).filter(ServerSupport::playable).sortedBy { if (it.name.equals(preferred, true)) 0 else 1 }
        val candidates = if (preferred.isNotBlank() && !options.allowFallback) sorted.filter { it.name.equals(preferred, true) } else sorted
        var reason = "No hay un servidor de descarga disponible"
        for (server in candidates) { try {
            val media = withTimeout(45000) { catalog.resolveStream(server, row.source) }
            val resolved = row.copy(streamUrl = media.directUrl, referer = media.referer)
            if (media.mediaType == com.anics.nativeapp.ffi.NativeMediaType.HLS || media.directUrl.contains(".m3u8", true)) hlsPlaylist(resolved)
            return resolved.also { downloadDao.updateDownload(it) }
        } catch (e: CancellationException) { throw e } catch (e: Exception) { reason = e.localizedMessage ?: reason } }
        error(reason)
    }
    private suspend fun readHlsResource(row: DownloadEntity, url: String, limit: Int): ByteArray {
        currentCoroutineContext().ensureActive()
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000; readTimeout = 20000
            setRequestProperty("User-Agent", "Mozilla/5.0")
            row.referer?.let { setRequestProperty("Referer", it) }
        }
        connections[row.id] = connection
        try {
            require(connection.responseCode == 200) { "Error HLS HTTP ${connection.responseCode}" }
            return connection.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    currentCoroutineContext().ensureActive()
                    val count = input.read(buffer); if (count < 0) break
                    require(output.size() + count <= limit) { "Recurso HLS demasiado grande" }
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
        } finally { connections.remove(row.id, connection); connection.disconnect() }
    }
    private suspend fun hlsPlaylist(row: DownloadEntity): HlsPlaylist {
        var url = row.streamUrl
        repeat(4) {
            val text = readHlsResource(row, url, 2 * 1024 * 1024).toString(Charsets.UTF_8)
            require(!Regex("#EXT-X-MEDIA:.*TYPE=\"?AUDIO\"?.*URI=").containsMatchIn(text)) { "El HLS tiene audio separado. Elige otro servidor" }
            val variant = HlsPlaylists.variant(text, url)
            if (variant == null) return HlsPlaylists.parse(text, url)
            url = variant
        }
        error("Demasiadas listas HLS anidadas")
    }
    private suspend fun transferHls(row: DownloadEntity, playlist: HlsPlaylist) {
        // Restart at a segment boundary after pause/restart: no partial segment is appended.
        val keys = mutableMapOf<String, ByteArray>()
        var bytes = 0L
        var lastBytes = 0L
        var lastAt = android.os.SystemClock.elapsedRealtime()
        val (output, _) = storageManager.openOutputStreamForAppend(row.outputPath, false)
        output.use { out ->
            playlist.initialization?.let { val data = readHlsResource(row, it, 8 * 1024 * 1024); out.write(data); bytes += data.size }
            playlist.segments.forEachIndexed { index, segment ->
                var data = readHlsResource(row, segment.url, 64 * 1024 * 1024)
                segment.keyUrl?.let { url ->
                    val key = keys[url] ?: readHlsResource(row, url, 16).also { require(it.size == 16) { "Clave AES no válida" }; keys[url] = it }
                    val cipher = javax.crypto.Cipher.getInstance("AES/CBC/PKCS5Padding")
                    cipher.init(javax.crypto.Cipher.DECRYPT_MODE, javax.crypto.spec.SecretKeySpec(key, "AES"), javax.crypto.spec.IvParameterSpec(segment.iv!!))
                    data = cipher.doFinal(data)
                }
                currentCoroutineContext().ensureActive()
                out.write(data); bytes += data.size
                val now = android.os.SystemClock.elapsedRealtime()
                downloadDao.updateTransfer(row.id, "downloading", playlist.progress(index + 1), bytes, null, (bytes - lastBytes) * 1000 / (now - lastAt).coerceAtLeast(1))
                lastAt = now; lastBytes = bytes
            }
            out.flush()
        }
        currentCoroutineContext().ensureActive()
        val savedBytes = storageManager.requireReadableVideo(row.outputPath)
        downloadDao.updateTransfer(row.id, "completed", 1f, savedBytes, savedBytes)
    }
    private suspend fun transfer(original: DownloadEntity) {
        var row = original
        var downloaded = 0L
        var total: Long? = row.totalBytes
        try {
            downloaded = storageManager.getFileLength(row.outputPath)
            downloadDao.updateTransfer(row.id, "downloading", row.progress, downloaded, total)
            row = resolve(row)
            currentCoroutineContext().ensureActive()
            var connection = (URL(row.streamUrl).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15000; readTimeout = 20000; instanceFollowRedirects = true
                setRequestProperty("User-Agent", DownloadSizes.USER_AGENT)
                setRequestProperty("Accept-Encoding", "identity")
                row.referer?.let { setRequestProperty("Referer", it) }
                if (downloaded > 0 && !row.streamUrl.contains(".m3u8", true)) setRequestProperty("Range", "bytes=$downloaded-")
            }
            connections[row.id] = connection
            currentCoroutineContext().ensureActive()
            connection.connect()
            var code = connection.responseCode
            if ((code == 403 || code == 410) && row.episodeUrl.isNotBlank()) {
                connection.disconnect()
                row = resolve(row, forceRefresh = true)
                currentCoroutineContext().ensureActive()
                connection = (URL(row.streamUrl).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 15000; readTimeout = 20000; instanceFollowRedirects = true
                    setRequestProperty("User-Agent", DownloadSizes.USER_AGENT)
                    setRequestProperty("Accept-Encoding", "identity")
                    row.referer?.let { setRequestProperty("Referer", it) }
                    if (downloaded > 0 && !row.streamUrl.contains(".m3u8", true)) setRequestProperty("Range", "bytes=$downloaded-")
                }
                connections[row.id] = connection
                currentCoroutineContext().ensureActive()
                connection.connect()
                code = connection.responseCode
            }
            if (code == 416) {
                total = connection.getHeaderField("Content-Range")?.substringAfter("bytes */", "")?.toLongOrNull()
                require(total != null && total == downloaded && downloaded > 0) { "No se pudo confirmar el archivo completo" }
                val savedBytes = storageManager.requireReadableVideo(row.outputPath, total)
                currentCoroutineContext().ensureActive()
                downloadDao.updateTransfer(row.id, "completed", 1f, savedBytes, total); return
            }
            require(code == 200 || code == 206) { "Error HTTP $code" }
            if (row.streamUrl.contains(".m3u8", true) || connection.contentType.orEmpty().contains("mpegurl", true)) {
                total = null
                connection.disconnect()
                val playlist = hlsPlaylist(row)
                val extension = if (playlist.initialization == null) "ts" else "mp4"
                val path = storageManager.createDownloadTarget(settings.settings.first().downloadFolderUri, row.animeTitle, row.episodeNumber, extension)
                if (path != row.outputPath) storageManager.deleteFile(row.outputPath)
                row = row.copy(outputPath = path, downloadedBytes = 0, totalBytes = null, progress = 0f)
                downloadDao.updateDownload(row)
                transferHls(row, playlist)
                return
            }
            require(!connection.contentType.orEmpty().contains("text/html", true) && !connection.contentType.orEmpty().contains("mpegurl", true)) { "El servidor no devolvió un video descargable" }
            val append = code == 206
            if (append) {
                val match = Regex("bytes (\\d+)-(\\d+)/(\\d+)").matchEntire(connection.getHeaderField("Content-Range").orEmpty())
                val start = match?.groupValues?.get(1)?.toLongOrNull()
                val end = match?.groupValues?.get(2)?.toLongOrNull()
                total = match?.groupValues?.get(3)?.toLongOrNull()
                require(start == downloaded && end != null && total != null && end >= start!! && end < total!! && (connection.contentLengthLong < 0 || connection.contentLengthLong == end - start + 1)) { "El servidor no respetó el rango de reanudación" }
            } else {
                downloaded = 0
                total = connection.contentLengthLong.takeIf { it > 0 }
                if (total == null) {
                    currentCoroutineContext().ensureActive()
                    total = DownloadSizes.probe(connection.url.toString(), row.referer,
                        onOpen = { probe -> sizeConnections[row.id] = probe },
                        onClose = { probe -> sizeConnections.remove(row.id, probe) })
                    currentCoroutineContext().ensureActive()
                }
            }
            val (output, offset) = storageManager.openOutputStreamForAppend(row.outputPath, append)
            downloaded = offset
            // Publish size as soon as response headers/probe are available, even before the first buffer.
            downloadDao.updateTransfer(row.id, "downloading", fraction(downloaded, total), downloaded, total)
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
            val savedBytes = storageManager.requireReadableVideo(row.outputPath, downloaded)
            currentCoroutineContext().ensureActive()
            downloadDao.updateTransfer(row.id, "completed", 1f, savedBytes, total ?: savedBytes)
        } catch (e: Exception) {
            withContext(NonCancellable) {
                if (row.id !in cancelledTasks && downloadDao.getDownloadById(row.id) != null) {
                    val paused = e is CancellationException || row.id in pausedTasks
                    val saved = downloadDao.getDownloadById(row.id)
                    downloaded = storageManager.getFileLength(row.outputPath)
                    // HLS owns progress and its eventual actual total; an estimate is display-only.
                    total = saved?.totalBytes ?: total
                    val progress = if (total == null) saved?.progress ?: 0f else fraction(downloaded, total)
                    downloadDao.updateTransfer(row.id, if (paused) "paused" else "failed", progress, downloaded, total, 0,
                        if (paused) null else e.localizedMessage ?: "Error durante la descarga")
                }
            }
        } finally { sizeConnections.remove(row.id)?.disconnect(); connections.remove(row.id)?.disconnect(); activeJobs.remove(row.id, currentCoroutineContext()[Job]) }
    }
    suspend fun pauseDownload(id: String) = controls.withLock {
        val job = admission.withLock { pausedTasks.add(id); activeJobs[id]?.also { it.cancel(); connections[id]?.disconnect(); sizeConnections[id]?.disconnect() } }
        job?.join()
        downloadDao.getDownloadById(id)?.takeIf { it.status in listOf("queued", "downloading") }?.let { downloadDao.updateTransfer(id, "paused", it.progress, it.downloadedBytes, it.totalBytes) }
    }
    suspend fun resumeDownload(id: String) = controls.withLock {
        activeJobs[id]?.join(); pausedTasks.remove(id)
        downloadDao.getDownloadById(id)?.takeIf { it.status != "completed" }?.let { row ->
            try {
                if (row.outputPath.isBlank() || !storageManager.targetExists(row.outputPath)) {
                    val folder = settings.settings.first().downloadFolderUri
                    require(!row.outputPath.startsWith("content://") || folder.isNotBlank()) { "Selecciona de nuevo la carpeta del video en Descargas" }
                    val extension = if (row.streamUrl.contains(".m3u8", true)) "ts" else "mp4"
                    val path = storageManager.createDownloadTarget(folder, row.animeTitle, row.episodeNumber, extension)
                    downloadDao.updateDownload(row.copy(outputPath = path, status = "queued", progress = 0f, downloadedBytes = 0, totalBytes = null, error = null))
                } else {
                    val resetUrl = if (row.status == "failed") "" else row.streamUrl
                    downloadDao.updateDownload(row.copy(streamUrl = resetUrl, status = "queued", error = null))
                }
            } catch (e: CancellationException) { throw e }
              catch (e: Exception) { downloadDao.updateTransfer(id, "failed", row.progress, row.downloadedBytes, row.totalBytes, error = e.localizedMessage ?: "No se pudo preparar el destino") }
        }
    }
    fun startDownload(id: String) { scope.launch { resumeDownload(id) } }
    fun close() { scope.cancel(); connections.values.forEach { it.disconnect() }; sizeConnections.values.forEach { it.disconnect() } }
    suspend fun cancelDownload(id: String) = controls.withLock {
        val job = admission.withLock { cancelledTasks.add(id); pausedTasks.add(id); activeJobs[id]?.also { it.cancel(); connections[id]?.disconnect(); sizeConnections[id]?.disconnect() } }
        try {
            job?.join()
            downloadDao.getDownloadById(id)?.let { storageManager.deleteFile(it.outputPath); downloadDao.deleteDownload(id) }
        } finally { cancelledTasks.remove(id); pausedTasks.remove(id) }
    }
    private fun fraction(bytes: Long, total: Long?) = if (total != null && total > 0) (bytes.toFloat() / total).coerceIn(0f, 1f) else 0f
}
