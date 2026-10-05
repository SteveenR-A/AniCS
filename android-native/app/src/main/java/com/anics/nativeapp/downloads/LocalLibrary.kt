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

object LocalCovers {
    fun animeSlug(title: String): String = title
        .lowercase()
        .map { if (it.isLetterOrDigit() || it == '-' || it == ' ') it else ' ' }
        .joinToString("")
        .split(Regex("\\s+"))
        .filter { it.isNotBlank() }
        .joinToString("-")

    fun cdnCover(title: String): String {
        val slug = animeSlug(title)
        return if (slug.isNotBlank()) "https://cdn.jkdesa.com/assets/images/animes/image/$slug.jpg" else ""
    }
}

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
class LocalLibrary(private val context: Context, private val dao: DownloadDao,
    private val openTree: (String) -> DocumentFile? = { DocumentFile.fromTreeUri(context, Uri.parse(it)) }) {
    suspend fun validateCompletedDownloads() = withContext(Dispatchers.IO) {
        val storage = StorageManager(context)
        for (row in dao.getAllDownloads().first().filter { it.status == "completed" }) {
            coroutineContext.ensureActive()
            try { storage.requireReadableVideo(row.outputPath, row.totalBytes ?: row.downloadedBytes) }
            catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { dao.markFileUnavailable(row.id, e.localizedMessage ?: "El archivo del episodio no se puede leer") }
        }
    }
    suspend fun scan(treeUri: String): Int = withContext(Dispatchers.IO) {
        val root = openTree(treeUri) ?: error("La carpeta no está disponible")
        require(root.exists() && root.canRead()) { "Selecciona de nuevo la carpeta para conceder acceso" }
        val knownPaths = dao.getAllDownloads().first().associateBy { it.outputPath }
        val metadata = TauriLibraryMetadata(context).importShared(root)
        val db = com.anics.nativeapp.data.local.AppDatabase.getInstance(context)
        val saved = (db.historyDao().getAllHistorySync().map { LibraryMetadata(it.animeTitle, it.animeUrl, it.thumbnailUrl, it.source) } +
            db.favoriteDao().getAllFavoritesSync().map { LibraryMetadata(it.title, it.url, it.thumbnailUrl, it.source) }).associateBy { com.anics.nativeapp.sync.SyncContract.titleKey(it.title) }
        var found = 0
        val result = mutableListOf<DownloadEntity>()
        val visited = mutableSetOf<String>()
        fun visit(directory: DocumentFile, depth: Int) {
            require(depth <= 20) { "La carpeta contiene demasiados niveles" }
            if (!visited.add(directory.uri.toString())) return
            val files = directory.listFiles()
            val localCover = listOf("poster.jpg", "poster.png", "cover.jpg", "cover.png", "cover.webp", "folder.jpg", "thumbnail.jpg").firstNotNullOfOrNull { name -> files.firstOrNull { it.name.equals(name, true) }?.uri?.toString() }
            files.forEach { file ->
                if (file.isDirectory) { if (file.name != ".anics") visit(file, depth + 1) }
                else {
                    val name = file.name ?: return@forEach
                    if (name.substringAfterLast('.', "").lowercase() !in listOf("mp4", "mkv", "webm", "avi", "mov", "m4v", "ts")) return@forEach
                    if (file.length() <= 100) return@forEach
                    val (title, episode) = LocalEpisodeNames.parse(name, if (depth > 0) directory.name else null)
                    val path = file.uri.toString()
                    val key = com.anics.nativeapp.sync.SyncContract.titleKey(title)
                    val meta = mergeLibraryMetadata(saved[key], metadata[key])
                    val cdnCover = LocalCovers.cdnCover(title)
                    val cover = localCover ?: meta?.thumbnailUrl?.takeIf(String::isNotBlank) ?: cdnCover
                    val animeUrl = meta?.animeUrl?.takeIf(String::isNotBlank).orEmpty()
                    val known = knownPaths[path]
                    if (known != null && known.status != "completed" &&
                        !(known.status == "failed" && known.totalBytes != null && known.totalBytes > 0 && known.totalBytes == file.length())) return@forEach
                    // A document can report a size even after its read permission was revoked.
                    try { StorageManager(context).requireReadableVideo(path, known?.totalBytes ?: file.length()) }
                    catch (e: kotlinx.coroutines.CancellationException) { throw e }
                    catch (_: Exception) { return@forEach }
                    found++
                    if (known != null) {
                        val updatedCover = if (known.thumbnailUrl.isNotBlank()) known.thumbnailUrl else cover
                        val updatedUrl = if (known.animeUrl.isNotBlank()) known.animeUrl else animeUrl
                        result.add(known.copy(animeUrl = updatedUrl, thumbnailUrl = updatedCover, source = meta?.source ?: known.source,
                            status = "completed", progress = 1f, downloadedBytes = file.length(), totalBytes = file.length(), error = null))
                        return@forEach
                    }
                    val id = "local:" + MessageDigest.getInstance("SHA-256").digest(path.toByteArray()).joinToString("") { "%02x".format(it.toInt() and 255) }
                    result.add(DownloadEntity(id = id, animeTitle = title, episodeNumber = episode, streamUrl = "", outputPath = path,
                        status = "completed", progress = 1f, downloadedBytes = file.length(), totalBytes = file.length(), createdAt = Instant.ofEpochMilli(file.lastModified()).toString(), animeUrl = animeUrl, thumbnailUrl = cover, source = meta?.source ?: "jkanime"))
                }
            }
        }
        visit(root, 0)
        coroutineContext.ensureActive()
        // Path-derived IDs make rescans idempotent. Existing cloud/download queues remain intact.
        dao.insertBatch(result)
        validateCompletedDownloads()
        found
    }
}
