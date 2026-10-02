package com.anics.nativeapp.downloads

import android.content.Context
import com.anics.nativeapp.data.local.DownloadDao
import com.anics.nativeapp.data.local.DownloadEntity
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

class DownloadManager(
    private val context: Context,
    private val downloadDao: DownloadDao,
    private val storageManager: StorageManager = StorageManager(context)
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val activeJobs = ConcurrentHashMap<String, Job>()
    private val pausedTasks = ConcurrentHashMap.newKeySet<String>()
    private val cancelledTasks = ConcurrentHashMap.newKeySet<String>()

    suspend fun enqueueDownload(
        id: String,
        animeTitle: String,
        episodeNumber: Int,
        streamUrl: String,
        referer: String? = null
    ): DownloadEntity {
        require(!streamUrl.contains(".m3u8", ignoreCase = true)) { "Las descargas HLS todavía no están disponibles en la versión nativa. Elige un servidor MP4." }
        val folder = com.anics.nativeapp.data.repository.SettingsRepository(context).settings.first().downloadFolderUri
        val targetPath = storageManager.createDownloadTarget(folder, animeTitle, episodeNumber)

        val existingByPath = downloadDao.getAllDownloads().first().firstOrNull { it.outputPath == targetPath }
        val fileLength = storageManager.getFileLength(targetPath)
        val existing = existingByPath?.takeIf { it.status in listOf("queued", "downloading", "paused") || (it.status == "completed" && fileLength > 0) }
        if (existing != null) return existing
        // A video already present in the shared folder belongs to the user's library.
        // Only known partial downloads may be resumed or replaced.
        val useExistingVideo = existingByPath == null && fileLength > 0
        val entity = DownloadEntity(
            id = id,
            queueOrder = System.currentTimeMillis(),
            animeTitle = animeTitle,
            episodeNumber = episodeNumber,
            streamUrl = streamUrl,
            referer = referer,
            outputPath = targetPath,
            status = if (useExistingVideo) "completed" else "queued",
            progress = if (useExistingVideo) 1f else 0f,
            downloadedBytes = if (useExistingVideo) fileLength else 0L,
            totalBytes = if (useExistingVideo) fileLength else null,
            error = null,
            createdAt = java.time.Instant.now().toString()
        )

        downloadDao.insertDownload(entity)
        if (!useExistingVideo) startDownload(id)
        return entity
    }

    fun startDownload(id: String) {
        if (activeJobs.containsKey(id)) return
        pausedTasks.remove(id)

        val job = scope.launch(start = CoroutineStart.LAZY) {
            val entity = downloadDao.getDownloadById(id) ?: run { activeJobs.remove(id, coroutineContext[Job]); return@launch }
            var connection: HttpURLConnection? = null
            var inputStream: InputStream? = null

            try {
                downloadDao.updateProgress(id, "downloading", entity.progress, entity.downloadedBytes)

                val url = URL(entity.streamUrl)
                connection = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 15000
                    readTimeout = 20000
                    instanceFollowRedirects = true
                    setRequestProperty(
                        "User-Agent",
                        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"
                    )
                    entity.referer?.let { setRequestProperty("Referer", it) }
                }

                // Verificar cuántos bytes se han descargado previamente para reanudar con Range
                val currentExistingBytes = storageManager.getFileLength(entity.outputPath)
                val isResuming = currentExistingBytes > 0
                if (isResuming) {
                    connection.setRequestProperty("Range", "bytes=$currentExistingBytes-")
                }

                connection.connect()
                val responseCode = connection.responseCode
                val contentType = connection.contentType.orEmpty()
                require(!contentType.contains("mpegurl", true) && !contentType.contains("text/html", true)) { "El servidor no devolvió un video MP4 descargable" }

                val (outputStream, downloadedStart) = when (responseCode) {
                    HttpURLConnection.HTTP_PARTIAL -> {
                        val firstByte = Regex("""bytes (\d+)-\d+/.*""").matchEntire(connection.getHeaderField("Content-Range").orEmpty())?.groupValues?.get(1)?.toLongOrNull()
                        require(firstByte == currentExistingBytes) { "El servidor no respetó el rango de reanudación" }
                        // 206 Partial Content: el servidor soporta Range
                        storageManager.openOutputStreamForAppend(entity.outputPath, append = true)
                    }
                    HttpURLConnection.HTTP_OK -> {
                        // 200 OK: el servidor no soporta Range o iniciamos desde cero
                        storageManager.openOutputStreamForAppend(entity.outputPath, append = false)
                    }
                    416 -> {
                        // 416 Range Not Satisfiable: ya está completamente descargado
                        val declared = connection.getHeaderField("Content-Range")?.substringAfter("bytes */", "")?.toLongOrNull()
                        require(declared != null && currentExistingBytes == declared && currentExistingBytes > 0) { "No se pudo confirmar que el archivo esté completo" }
                        downloadDao.updateProgress(id, "completed", 1f, currentExistingBytes)
                        return@launch
                    }
                    else -> {
                        throw IllegalStateException("HTTP Error $responseCode: ${connection.responseMessage}")
                    }
                }

                val contentLength = connection.contentLengthLong
                val totalBytes = if (responseCode == HttpURLConnection.HTTP_PARTIAL) {
                    downloadedStart + contentLength
                } else {
                    contentLength
                }

                inputStream = connection.inputStream
                val buffer = ByteArray(64 * 1024)
                var bytesRead: Int
                var currentDownloaded = downloadedStart
                var lastUpdateTimestamp = System.currentTimeMillis()

                outputStream.use { out ->
                    while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                        if (pausedTasks.contains(id) || !isActive) {
                            downloadDao.updateProgress(
                                id,
                                "paused",
                                if (totalBytes > 0) currentDownloaded.toFloat() / totalBytes else 0f,
                                currentDownloaded
                            )
                            return@launch
                        }

                        out.write(buffer, 0, bytesRead)
                        currentDownloaded += bytesRead

                        val now = System.currentTimeMillis()
                        if (now - lastUpdateTimestamp >= 1000) {
                            lastUpdateTimestamp = now
                            val progress = if (totalBytes > 0) {
                                (currentDownloaded.toFloat() / totalBytes.toFloat()).coerceIn(0f, 1f)
                            } else 0f

                            downloadDao.updateProgress(id, "downloading", progress, currentDownloaded)
                        }
                    }
                    out.flush()
                }

                require(totalBytes <= 0 || currentDownloaded == totalBytes) { "La descarga está incompleta" }
                // Finalización exitosa
                downloadDao.updateProgress(id, "completed", 1f, currentDownloaded)

            } catch (e: CancellationException) {
                withContext(NonCancellable) {
                    val current = downloadDao.getDownloadById(id)
                    if (current != null && id !in cancelledTasks) downloadDao.updateProgress(id, "paused", current.progress, storageManager.getFileLength(entity.outputPath))
                }
            } catch (e: Exception) {
                downloadDao.insertDownload(
                    (downloadDao.getDownloadById(id) ?: entity).copy(
                        status = "failed",
                        error = e.localizedMessage ?: "Error de red durante la descarga"
                    )
                )
            } finally {
                inputStream?.close()
                connection?.disconnect()
                activeJobs.remove(id, coroutineContext[Job])
            }
        }

        activeJobs[id] = job
        job.start()
    }

    fun pauseDownload(id: String) {
        pausedTasks.add(id)
        activeJobs[id]?.cancel()
    }

    suspend fun resumeDownload(id: String) { activeJobs[id]?.join(); startDownload(id) }

    fun close() { scope.cancel() }

    suspend fun cancelDownload(id: String) {
        cancelledTasks.add(id)
        val worker = activeJobs[id]
        worker?.cancel()
        try {
            worker?.join()
            pausedTasks.remove(id)
            val entity = downloadDao.getDownloadById(id)
            if (entity != null) {
                storageManager.deleteFile(entity.outputPath)
                downloadDao.deleteDownload(id)
            }
        } finally {
            cancelledTasks.remove(id)
        }
    }
}
