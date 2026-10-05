package com.anics.nativeapp.downloads

import android.content.Context
import android.net.Uri
import android.database.sqlite.SQLiteDatabase
import androidx.documentfile.provider.DocumentFile
import com.anics.nativeapp.sync.SyncContract
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

@Serializable
data class LibraryMetadata(val title: String, val animeUrl: String = "", val thumbnailUrl: String = "", val source: String = "jkanime", val localCover: String = "")

/** Reads a user-selected exported copy; never opens or modifies the other app's private DB. */
class TauriLibraryMetadata(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true }
    private val file get() = java.io.File(context.filesDir, "tauri-library-metadata.json")
    fun read(): Map<String, LibraryMetadata> = runCatching {
        json.decodeFromString(ListSerializer(LibraryMetadata.serializer()), file.readText()).associateBy { SyncContract.titleKey(it.title) }
    }.getOrDefault(emptyMap())
    /** The user grants the Anime tree once; subsequent scans need no database picker. */
    suspend fun importShared(root: DocumentFile): Map<String, LibraryMetadata> = withContext(Dispatchers.IO) {
        val cacheValid = runCatching { json.decodeFromString(ListSerializer(LibraryMetadata.serializer()), file.readText()) }.isSuccess
        val bridge = root.findFile(".anics")
        val manifest = bridge?.findFile("library.json")
        if (manifest != null) try {
            val rows = context.contentResolver.openInputStream(manifest.uri)?.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) { val count = input.read(buffer); if (count < 0) break
                    require(output.size() + count <= 8 * 1024 * 1024) { "Los metadatos superan 8 MB" }; output.write(buffer, 0, count) }
                json.decodeFromString(ListSerializer(LibraryMetadata.serializer()), output.toString("UTF-8"))
            }.orEmpty()
            save(read() + resolveSharedCovers(rows) { path ->
                var current = bridge
                for (part in path.split('/')) current = current?.findFile(part)
                current?.takeIf { it.isFile && it.canRead() }?.uri?.toString()
            })
        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
          catch (e: Exception) { android.util.Log.w("AniCS", "No se pudo leer la biblioteca compartida de Tauri", e) }
        // Directly discover offline covers placed in .anics/covers
        val coversFolder = bridge?.findFile("covers")
        if (coversFolder != null && coversFolder.isDirectory) {
            val collected = read().toMutableMap()
            coversFolder.listFiles().forEach { coverFile ->
                val name = coverFile.name ?: return@forEach
                val stem = name.substringBeforeLast('.')
                if (stem.isNotBlank()) {
                    val key = SyncContract.titleKey(stem)
                    val prev = collected[key]
                    if (prev == null || prev.thumbnailUrl.isBlank() || !prev.thumbnailUrl.startsWith("content://")) {
                        collected[key] = LibraryMetadata(
                            title = prev?.title?.ifBlank { stem } ?: stem,
                            animeUrl = prev?.animeUrl.orEmpty(),
                            thumbnailUrl = coverFile.uri.toString(),
                            source = prev?.source ?: "jkanime"
                        )
                    }
                }
            }
            save(collected)
        }
        // Older exported databases placed next to the videos are discovered automatically.
        root.findFile("anics.db")?.takeIf { it.isFile && it.canRead() }?.let { db ->
            try {
                val imports = context.getSharedPreferences("tauri-library-imports", Context.MODE_PRIVATE)
                val stamp = "${com.anics.nativeapp.BuildConfig.VERSION_CODE}:${db.lastModified()}:${db.length()}"
                // Providers without reliable timestamps are read again, never assumed unchanged.
                if (!cacheValid || db.lastModified() <= 0 || db.length() <= 0 || imports.getString(db.uri.toString(), null) != stamp) {
                    importDatabase(db.uri)
                    imports.edit().putString(db.uri.toString(), stamp).apply()
                }
            }
            catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { android.util.Log.w("AniCS", "No se pudo leer anics.db en Anime", e) }
        }
        read()
    }
    @Synchronized
    private fun save(collected: Map<String, LibraryMetadata>) {
        val data = json.encodeToString(ListSerializer(LibraryMetadata.serializer()), collected.toSortedMap().values.toList())
        if (file.isFile && runCatching { file.readText() == data }.getOrDefault(false)) return
        val temporary = java.io.File(file.parentFile, "tauri-library-${java.util.UUID.randomUUID()}.tmp")
        try {
            temporary.writeText(data)
            try {
                java.nio.file.Files.move(temporary.toPath(), file.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE)
            } catch (_: java.nio.file.AtomicMoveNotSupportedException) {
                java.nio.file.Files.move(temporary.toPath(), file.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING)
            }
        } finally { temporary.delete() }
    }
    suspend fun importDatabase(uri: Uri): Int = withContext(Dispatchers.IO) {
        val snapshot = java.io.File(context.cacheDir, "tauri-import-${java.util.UUID.randomUUID()}.db")
        try {
            context.contentResolver.openInputStream(uri)?.use { input -> snapshot.outputStream().use { output ->
                val buffer = ByteArray(8192); var total = 0L
                while (true) { val count = input.read(buffer); if (count < 0) break; total += count; require(total <= 128 * 1024 * 1024) { "La base de datos supera 128 MB" }; output.write(buffer, 0, count) }
            } } ?: error("No se pudo abrir la copia de anics.db")
            val collected = read().toMutableMap()
            SQLiteDatabase.openDatabase(snapshot.absolutePath, null, SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS).use { db ->
                val tables = mutableSetOf<String>()
                db.rawQuery("SELECT name FROM sqlite_master WHERE type='table'", null).use { while (it.moveToNext()) tables.add(it.getString(0)) }
                require("watch_history" in tables || "favorites" in tables) { "El archivo no es una base de datos de AniCS Tauri" }
                for (table in listOf("watch_history", "favorites").filter { it in tables }) {
                    db.rawQuery("SELECT * FROM $table", null).use { cursor ->
                        fun value(name: String): String { val index = cursor.getColumnIndex(name); return if (index >= 0 && !cursor.isNull(index)) cursor.getString(index) else "" }
                        while (cursor.moveToNext()) {
                            val title = value(if (table == "favorites") "title" else "anime_title")
                            if (title.isBlank()) continue
                            val key = SyncContract.titleKey(title)
                            val previous = collected[key]
                            val url = value(if (table == "favorites") "url" else "anime_url").takeIf { it.startsWith("http") } ?: previous?.animeUrl.orEmpty()
                            val cover = previous?.thumbnailUrl?.takeIf { it.startsWith("content://") }
                                ?: value("thumbnail_url").takeIf { it.startsWith("http") } ?: previous?.thumbnailUrl.orEmpty()
                            collected[key] = LibraryMetadata(title, url, cover, value("source").ifBlank { previous?.source ?: "jkanime" })
                        }
                    }
                }
            }
            save(collected)
            collected.size
        } finally { snapshot.delete() }
    }
}

/** Relative cover paths are resolved only within the selected .anics directory. */
fun resolveSharedCovers(rows: List<LibraryMetadata>, resolve: (String) -> String?): Map<String, LibraryMetadata> = rows
    .filter { it.title.isNotBlank() }.associate { row ->
        val parts = row.localCover.split('/')
        val safe = parts.size == 2 && parts[0] == "covers" && parts[1].isNotBlank() && parts.none { it == ".." || it == "." || '\\' in it }
        SyncContract.titleKey(row.title) to row.copy(thumbnailUrl = (if (safe) resolve(row.localCover) else null) ?: row.thumbnailUrl, localCover = "")
    }

fun mergeLibraryMetadata(primary: LibraryMetadata?, shared: LibraryMetadata?): LibraryMetadata? {
    if (primary == null) return shared
    if (shared == null) return primary
    return primary.copy(animeUrl = primary.animeUrl.ifBlank { shared.animeUrl },
        thumbnailUrl = shared.thumbnailUrl.takeIf { it.startsWith("content://") } ?: primary.thumbnailUrl.ifBlank { shared.thumbnailUrl },
        source = if (primary.animeUrl.isBlank()) shared.source else primary.source)
}
