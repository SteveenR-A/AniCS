package com.anics.nativeapp.downloads

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import com.anics.nativeapp.data.local.DownloadDao
import com.anics.nativeapp.data.local.DownloadEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.first
import java.security.MessageDigest
import java.time.Instant
import kotlin.coroutines.coroutineContext

object LocalEpisodeNames {
    fun parse(fileName: String, parent: String?): Pair<String, Int> {
        val stem = fileName.substringBeforeLast('.').replace('_', ' ')
        val match = Regex("""(?i)(?:^|[\s._-])(?:episodio|episode|capitulo|capítulo|cap|ep|e)[\s._-]*(\d+)""").find(stem)
            ?: Regex("""(?:^|[\s._-])(\d+)$""").find(stem)
        val episode = match?.groupValues?.get(1)?.toIntOrNull() ?: 1
        val title = parent?.takeIf { it.isNotBlank() }?.replace('_', ' ')
            ?: match?.let { stem.substring(0, it.range.first).trim(' ', '-', '.') }?.takeIf { it.isNotBlank() } ?: stem
        return title to episode
    }
}
class LocalLibrary(private val context: Context, private val dao: DownloadDao) {
    suspend fun scan(treeUri: String): Int = withContext(Dispatchers.IO) {
        val root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri)) ?: error("La carpeta no está disponible")
        require(root.exists() && root.canRead()) { "Selecciona de nuevo la carpeta para conceder acceso" }
        val knownPaths = dao.getAllDownloads().first().map { it.outputPath }.toSet()
        val result = mutableListOf<DownloadEntity>()
        val visited = mutableSetOf<String>()
        fun visit(directory: DocumentFile, depth: Int) {
            require(depth <= 20) { "La carpeta contiene demasiados niveles" }
            if (!visited.add(directory.uri.toString())) return
            directory.listFiles().forEach { file ->
                if (file.isDirectory) visit(file, depth + 1)
                else {
                    val name = file.name ?: return@forEach
                    if (name.substringAfterLast('.', "").lowercase() !in listOf("mp4", "mkv", "webm", "avi", "mov", "m4v", "ts")) return@forEach
                    if (file.length() <= 100) return@forEach
                    val (title, episode) = LocalEpisodeNames.parse(name, if (depth > 0) directory.name else null)
                    val path = file.uri.toString()
                    if (path in knownPaths) return@forEach
                    val id = "local:" + MessageDigest.getInstance("SHA-256").digest(path.toByteArray()).joinToString("") { "%02x".format(it.toInt() and 255) }
                    result.add(DownloadEntity(id = id, animeTitle = title, episodeNumber = episode, streamUrl = "", outputPath = path,
                        status = "completed", progress = 1f, downloadedBytes = file.length(), totalBytes = file.length(), createdAt = Instant.ofEpochMilli(file.lastModified()).toString()))
                }
            }
        }
        visit(root, 0)
        coroutineContext.ensureActive()
        // Path-derived IDs make rescans idempotent. Existing cloud/download queues remain intact.
        dao.insertBatch(result)
        result.size
    }
}
