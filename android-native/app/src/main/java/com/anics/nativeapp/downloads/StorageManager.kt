package com.anics.nativeapp.downloads

import android.content.Context
import android.net.Uri
import android.os.Environment
import androidx.documentfile.provider.DocumentFile
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.OutputStream

class StorageManager(private val context: Context) {
    /** Public Anime requires an explicit SAF grant on scoped-storage Android. */
    fun getDefaultDownloadFolder(): File {
        val external = context.getExternalFilesDir(Environment.DIRECTORY_MOVIES)
        if (external != null) {
            try { return ensureDirectory(File(external, "Anime")) }
            catch (_: IOException) { /* External storage may be unmounted. */ }
        }
        return ensureDirectory(File(context.filesDir, "Anime"))
    }

    private fun ensureDirectory(directory: File): File {
        if ((!directory.isDirectory && !directory.mkdirs() && !directory.isDirectory) || !directory.canWrite()) {
            throw IOException("No se pudo crear o escribir en la carpeta: ${directory.absolutePath}. Elige otra carpeta en Descargas.")
        }
        return directory
    }

    fun createDownloadTarget(folderUri: String, title: String, episode: Int, extension: String = "mp4"): String {
        val safeTitle = title.replace(Regex("""[\\/:*?"<>|]"""), " ").trim(' ', '.').ifBlank { "Anime" }
        val name = "Ep" + episode.toString().padStart(3, '0') + ".$extension"
        if (folderUri.isNotBlank()) {
            val root = DocumentFile.fromTreeUri(context, Uri.parse(folderUri))
                ?: error("La carpeta elegida no está disponible. Selecciónala de nuevo en Descargas.")
            require(root.exists() && root.isDirectory && root.canRead() && root.canWrite()) {
                "No hay permiso de escritura en la carpeta elegida. Selecciónala de nuevo en Descargas."
            }
            val directory = root.findFile(safeTitle) ?: root.createDirectory(safeTitle)
                ?: error("No se pudo crear la carpeta del anime")
            require(directory.isDirectory && directory.canWrite()) { "La carpeta del anime no se puede escribir" }
            val mimeType = if (extension == "ts") "video/mp2t" else "video/mp4"
            val target = directory.findFile(name) ?: directory.createFile(mimeType, name)
                ?: error("No se pudo crear el episodio")
            require(target.isFile && target.canWrite()) { "No se puede escribir el archivo del episodio" }
            return target.uri.toString()
        }
        return File(ensureDirectory(File(getDefaultDownloadFolder(), safeTitle)), name).absolutePath
    }

    fun sanitizeFileName(title: String, episodeNumber: Int, extension: String = "mp4"): String {
        val cleanTitle = title.replace(Regex("""[\\/:*?"<>|]"""), "_")
            .replace("\\s+".toRegex(), "_").trim('_')
        return "${cleanTitle}_Ep${episodeNumber}.$extension"
    }

    private fun localFile(path: String): File = if (path.startsWith("file://")) {
        File(requireNotNull(Uri.parse(path).path) { "La ruta del video no es válida" })
    } else File(path)

    fun targetExists(path: String): Boolean = if (path.startsWith("content://")) {
        DocumentFile.fromSingleUri(context, Uri.parse(path))?.isFile == true
    } else localFile(path).isFile

    fun openOutputStreamForAppend(destinationPath: String, append: Boolean = true): Pair<OutputStream, Long> {
        return if (destinationPath.startsWith("content://")) {
            val uri = Uri.parse(destinationPath)
            val doc = DocumentFile.fromSingleUri(context, uri)
            require(doc?.isFile == true && doc.canWrite()) { "El destino no existe o no permite escribir. Selecciona de nuevo la carpeta en Descargas." }
            val currentLen = if (append) getFileLength(destinationPath) else 0L
            val stream = context.contentResolver.openOutputStream(uri, if (append) "wa" else "wt")
                ?: throw IOException("No se pudo abrir el archivo de descarga")
            stream to currentLen
        } else {
            val file = localFile(destinationPath)
            file.parentFile?.let(::ensureDirectory)
            val currentLen = if (append && file.isFile) file.length() else 0L
            FileOutputStream(file, append) to currentLen
        }
    }

    fun getFileLength(destinationPath: String): Long = if (destinationPath.startsWith("content://")) {
        val uri = Uri.parse(destinationPath)
        val doc = DocumentFile.fromSingleUri(context, uri)
        if (doc?.isFile != true) 0L
        else {
            val descriptorLength = context.contentResolver.openFileDescriptor(uri, "r")?.use { it.statSize } ?: -1L
            if (descriptorLength >= 0) descriptorLength else doc.length()
        }
    } else localFile(destinationPath).takeIf { it.isFile }?.length() ?: 0L

    /** Verify the persisted file after closing the writer, including SAF read access. */
    fun requireReadableVideo(path: String, expectedBytes: Long? = null): Long {
        try {
            require(path.isNotBlank() && targetExists(path)) { "El archivo del episodio no existe. Descárgalo de nuevo." }
            val length = getFileLength(path)
            require(length > 0) { "El archivo del episodio está vacío. Descárgalo de nuevo." }
            require(expectedBytes == null || expectedBytes <= 0 || length == expectedBytes) {
                "La descarga está incompleta: se guardaron $length de $expectedBytes bytes. Reanuda la descarga."
            }
            val input = if (path.startsWith("content://")) context.contentResolver.openInputStream(Uri.parse(path))
                else localFile(path).inputStream()
            require(input?.use { it.read() >= 0 } == true) { "El archivo del episodio no se puede leer" }
            return length
        } catch (e: SecurityException) {
            throw IOException("Se perdió el permiso para leer el video. Selecciona de nuevo su carpeta en Descargas.", e)
        } catch (e: java.io.FileNotFoundException) {
            throw IOException("El archivo del episodio no está disponible. Selecciona de nuevo la carpeta o descárgalo otra vez.", e)
        }
    }

    fun deleteFile(destinationPath: String, folderUri: String? = null, animeTitle: String? = null): Boolean = try {
        if (destinationPath.startsWith("content://")) {
            val uri = Uri.parse(destinationPath)
            var deleted = DocumentFile.fromSingleUri(context, uri)?.delete() == true
            if (!deleted) {
                deleted = try {
                    android.provider.DocumentsContract.deleteDocument(context.contentResolver, uri)
                } catch (_: Exception) { false }
            }
            if (!deleted) {
                deleted = try {
                    context.contentResolver.delete(uri, null, null) > 0
                } catch (_: Exception) { false }
            }
            if (!deleted && !folderUri.isNullOrBlank()) {
                try {
                    val root = DocumentFile.fromTreeUri(context, Uri.parse(folderUri))
                    if (root != null && root.exists()) {
                        val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: ""
                        val candidates = mutableListOf<DocumentFile>()
                        if (!animeTitle.isNullOrBlank()) {
                            val safeTitle = animeTitle.replace(Regex("""[\\/:*?"<>|]"""), " ").trim(' ', '.').ifBlank { "Anime" }
                            val dir = root.findFile(safeTitle)
                                ?: root.listFiles().firstOrNull { it.isDirectory && (it.name.equals(safeTitle, true) || it.name.equals(animeTitle, true)) }
                            if (dir != null) {
                                candidates.addAll(dir.listFiles())
                            }
                        }
                        if (candidates.isEmpty()) {
                            candidates.addAll(root.listFiles())
                        }
                        val matched = candidates.firstOrNull { it.isFile && (it.uri == uri || it.name.equals(fileName, true)) }
                        if (matched?.delete() == true) deleted = true
                    }
                } catch (_: Exception) { }
            }
            deleted || getFileLength(destinationPath) == 0L
        } else {
            val file = localFile(destinationPath)
            val deleted = file.delete() || !file.exists()
            deleted
        }
    } catch (_: Exception) { false }

    fun cleanEmptyAnimeFolderSafely(animeTitle: String, folderUri: String? = null, fallbackTarget: File? = null): Boolean {
        var cleaned = false
        val safeTitle = animeTitle.replace(Regex("""[\\/:*?"<>|]"""), " ").trim(' ', '.').ifBlank { "Anime" }
        val videoExts = setOf("mp4", "mkv", "webm", "ts", "avi", "mov", "m4v")

        // 1. En árbol SAF
        if (!folderUri.isNullOrBlank()) {
            try {
                val root = DocumentFile.fromTreeUri(context, Uri.parse(folderUri))
                if (root != null && root.exists() && root.canWrite()) {
                    val dir = root.findFile(safeTitle)
                        ?: root.listFiles().firstOrNull { it.isDirectory && (it.name.equals(safeTitle, true) || it.name.equals(animeTitle, true)) }
                    if (dir != null && dir.isDirectory) {
                        val children = dir.listFiles()
                        val hasVideos = children.any { child ->
                            child.isFile && child.name?.substringAfterLast('.', "")?.lowercase() in videoExts
                        }
                        if (!hasVideos) {
                            children.forEach { runCatching { it.delete() } }
                            cleaned = dir.delete() || !dir.exists()
                        }
                    }
                }
            } catch (_: Exception) { }
        }

        // 2. En carpeta local de la app
        try {
            val localDir = File(getDefaultDownloadFolder(), safeTitle)
            if (localDir.exists() && localDir.isDirectory) {
                val children = localDir.listFiles() ?: emptyArray()
                val hasVideos = children.any { child ->
                    child.isFile && child.extension.lowercase() in videoExts
                }
                if (!hasVideos) {
                    cleaned = localDir.deleteRecursively() || cleaned
                }
            }
        } catch (_: Exception) { }

        // 3. En carpeta compartida si existe
        try {
            val sharedDir = File("/storage/emulated/0/Anime", safeTitle)
            if (sharedDir.exists() && sharedDir.isDirectory && sharedDir.canWrite()) {
                val children = sharedDir.listFiles() ?: emptyArray()
                val hasVideos = children.any { child ->
                    child.isFile && child.extension.lowercase() in videoExts
                }
                if (!hasVideos) {
                    cleaned = sharedDir.deleteRecursively() || cleaned
                }
            }
        } catch (_: Exception) { }

        // 4. En carpeta padre del archivo específico si se proporcionó
        try {
            val parentDir = if (fallbackTarget?.isDirectory == true) fallbackTarget else fallbackTarget?.parentFile
            if (parentDir != null && parentDir.exists() && parentDir.isDirectory) {
                val children = parentDir.listFiles() ?: emptyArray()
                val hasVideos = children.any { child ->
                    child.isFile && child.extension.lowercase() in videoExts
                }
                if (!hasVideos) {
                    cleaned = parentDir.deleteRecursively() || cleaned
                }
            }
        } catch (_: Exception) { }

        return cleaned
    }

    fun deleteAnimeFolder(animeTitle: String, folderUri: String? = null, fallbackDirs: List<File> = emptyList()): Boolean {
        var anyDeleted = false
        val safeTitle = animeTitle.replace(Regex("""[\\/:*?"<>|]"""), " ").trim(' ', '.').ifBlank { "Anime" }

        // 1. Árbol SAF
        if (!folderUri.isNullOrBlank()) {
            try {
                val root = DocumentFile.fromTreeUri(context, Uri.parse(folderUri))
                if (root != null && root.exists() && root.canWrite()) {
                    val dir = root.findFile(safeTitle)
                        ?: root.listFiles().firstOrNull { it.isDirectory && (it.name.equals(safeTitle, true) || it.name.equals(animeTitle, true)) }
                    if (dir != null && dir.isDirectory) {
                        if (dir.delete() || !dir.exists()) {
                            anyDeleted = true
                        }
                    }
                }
            } catch (_: Exception) { }
        }

        // 2. Carpeta local de la app
        try {
            val localDir = File(getDefaultDownloadFolder(), safeTitle)
            if (localDir.exists() && localDir.isDirectory) {
                if (localDir.deleteRecursively()) {
                    anyDeleted = true
                }
            }
        } catch (_: Exception) { }

        // 3. Carpeta compartida
        try {
            val sharedDir = File("/storage/emulated/0/Anime", safeTitle)
            if (sharedDir.exists() && sharedDir.isDirectory && sharedDir.canWrite()) {
                if (sharedDir.deleteRecursively()) {
                    anyDeleted = true
                }
            }
        } catch (_: Exception) { }

        // 4. Carpetas directas fallback
        fallbackDirs.forEach { dir ->
            try {
                val target = if (dir.isDirectory) dir else dir.parentFile
                if (target != null && target.exists() && target.isDirectory) {
                    if (target.deleteRecursively()) {
                        anyDeleted = true
                    }
                }
            } catch (_: Exception) { }
        }

        return anyDeleted
    }
}
