package com.anics.nativeapp.downloads

import android.content.Context
import com.anics.nativeapp.data.local.DownloadDao
import com.anics.nativeapp.data.local.DownloadEntity
import kotlinx.coroutines.*
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

    suspend fun enqueueDownload(
        id: String,
        animeTitle: String,
        episodeNumber: Int,
        streamUrl: String,
        referer: String? = null
    ): DownloadEntity {
        val fileName = storageManager.sanitizeFileName(animeTitle, episodeNumber)
        val targetFile = java.io.File(storageManager.getDefaultDownloadFolder(), fileName)

        val entity = DownloadEntity(
            id = id,
            queueOrder = System.currentTimeMillis(),
            animeTitle = animeTitle,
            episodeNumber = episodeNumber,
            streamUrl = streamUrl,
            referer = referer,
            outputPath = targetFile.absolutePath,
            status = "queued",
            progress = 0f,
            downloadedBytes = 0L,
            totalBytes = null,
            error = null,
            createdAt = java.time.Instant.now().toString()
        )

        downloadDao.insertDownload(entity)
        startDownload(id)
        return entity
    }

    fun startDownload(id: String) {
        if (activeJobs.containsKey(id)) return
        pausedTasks.remove(id)

        val job = scope.launch {
            val entity = downloadDao.getDownloadById(id) ?: return@launch
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

                val (outputStream, downloadedStart) = when (responseCode) {
                    HttpURLConnection.HTTP_PARTIAL -> {
                        // 206 Partial Content: el servidor soporta Range
                        storageManager.openOutputStreamForAppend(entity.outputPath, append = true)
                    }
                    HttpURLConnection.HTTP_OK -> {
                        // 200 OK: el servidor no soporta Range o iniciamos desde cero
                        storageManager.openOutputStreamForAppend(entity.outputPath, append = false)
                    }
                    416 -> {
                        // 416 Range Not Satisfiable: ya está completamente descargado
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

                // Finalización exitosa
                downloadDao.updateProgress(id, "completed", 1f, currentDownloaded)

            } catch (e: CancellationException) {
                downloadDao.updateProgress(id, "paused", entity.progress, entity.downloadedBytes)
            } catch (e: Exception) {
                downloadDao.insertDownload(
                    entity.copy(
                        status = "failed",
                        error = e.localizedMessage ?: "Error de red durante la descarga"
                    )
                )
            } finally {
                inputStream?.close()
                connection?.disconnect()
                activeJobs.remove(id)
            }
        }

        activeJobs[id] = job
    }

    fun pauseDownload(id: String) {
        pausedTasks.add(id)
        activeJobs[id]?.cancel()
        activeJobs.remove(id)
    }

    fun cancelDownload(id: String) {
        pausedTasks.remove(id)
        activeJobs[id]?.cancel()
        activeJobs.remove(id)
        scope.launch {
            val entity = downloadDao.getDownloadById(id)
            if (entity != null) {
                storageManager.deleteFile(entity.outputPath)
                downloadDao.deleteDownload(id)
            }
        }
    }
}
