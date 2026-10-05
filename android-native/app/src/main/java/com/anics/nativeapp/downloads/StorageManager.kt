package com.anics.nativeapp.downloads

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.documentfile.provider.DocumentFile
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream

class StorageManager(private val context: Context) {

    /**
     * Devuelve el directorio local de almacenamiento para descargas en la versión nativa preview.
     * Usa Anime compartida si ya hay permiso de escritura; de lo contrario, el directorio
     * externo de la app o sus archivos internos. SAF concede acceso a la carpeta de Tauri.
     */
    fun getDefaultDownloadFolder(): File {
        val externalFolder = context.getExternalFilesDir(Environment.DIRECTORY_MOVIES)
            ?: context.filesDir
        val shared = File(Environment.getExternalStorageDirectory(), "Anime")
        val animeFolder = if (shared.exists() && shared.canWrite()) shared else File(externalFolder, "Anime")
        if (!animeFolder.exists()) {
            animeFolder.mkdirs()
        }
        return animeFolder
    }

    fun createDownloadTarget(folderUri: String, title: String, episode: Int, extension: String = "mp4"): String {
        val safeTitle = title.replace(Regex("""[\\/:*?"<>|]"""), " ").trim(' ', '.').ifBlank { "Anime" }
        val name = "Ep" + episode.toString().padStart(3, '0') + ".$extension"
        if (folderUri.isNotBlank()) {
            val root = DocumentFile.fromTreeUri(context, Uri.parse(folderUri)) ?: error("La carpeta elegida no está disponible")
            val directory = root.findFile(safeTitle)?.takeIf { it.isDirectory } ?: root.createDirectory(safeTitle) ?: error("No se pudo crear la carpeta del anime")
            return (directory.findFile(name) ?: directory.createFile(if (extension == "ts") "video/mp2t" else "video/mp4", name) ?: error("No se pudo crear el episodio")).uri.toString()
        }
        val directory = File(getDefaultDownloadFolder(), safeTitle).apply { mkdirs() }
        return File(directory, name).absolutePath
    }
    /**
     * Genera un nombre de archivo normalizado y seguro para el sistema de archivos.
     */
    fun sanitizeFileName(title: String, episodeNumber: Int, extension: String = "mp4"): String {
        val cleanTitle = title.replace(Regex("[\\\\/:*?\"<>|]"), "_")
            .replace("\\s+".toRegex(), "_")
            .trim('_')
        return "${cleanTitle}_Ep${episodeNumber}.$extension"
    }

    /**
     * Obtiene el OutputStream y tamaño previo para un archivo de descarga,
     * admitiendo SAF Uri o archivos locales estándar.
     */
    fun openOutputStreamForAppend(
        destinationPath: String,
        append: Boolean = true
    ): Pair<OutputStream, Long> {
        return if (destinationPath.startsWith("content://")) {
            val uri = Uri.parse(destinationPath)
            val docFile = DocumentFile.fromSingleUri(context, uri)
            val currentLen = if (append) docFile?.length() ?: 0L else 0L
            val stream = context.contentResolver.openOutputStream(uri, if (append) "wa" else "wt")
                ?: throw IllegalStateException("No se pudo abrir OutputStream para $destinationPath")
            Pair(stream, currentLen)
        } else {
            val file = File(destinationPath)
            val parent = file.parentFile
            if (parent != null && !parent.exists()) {
                parent.mkdirs()
            }
            val currentLen = if (append && file.exists()) file.length() else 0L
            val stream = FileOutputStream(file, append)
            Pair(stream, currentLen)
        }
    }

    fun getFileLength(destinationPath: String): Long {
        return if (destinationPath.startsWith("content://")) {
            val doc = DocumentFile.fromSingleUri(context, Uri.parse(destinationPath))
            doc?.length() ?: 0L
        } else {
            val f = File(destinationPath)
            if (f.exists()) f.length() else 0L
        }
    }

    fun deleteFile(destinationPath: String): Boolean {
        return try {
            if (destinationPath.startsWith("content://")) {
                val doc = DocumentFile.fromSingleUri(context, Uri.parse(destinationPath))
                doc?.delete() ?: false
            } else {
                val f = File(destinationPath)
                if (f.exists()) f.delete() else false
            }
        } catch (_: Exception) {
            false
        }
    }
}
