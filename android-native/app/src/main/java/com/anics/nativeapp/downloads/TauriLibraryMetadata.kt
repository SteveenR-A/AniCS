package com.anics.nativeapp.downloads

import android.content.Context
import android.net.Uri
import android.database.sqlite.SQLiteDatabase
import com.anics.nativeapp.sync.SyncContract
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

@Serializable
data class LibraryMetadata(val title: String, val animeUrl: String = "", val thumbnailUrl: String = "", val source: String = "jkanime")

/** Reads a user-selected exported copy; never opens or modifies the other app's private DB. */
class TauriLibraryMetadata(private val context: Context) {
    private val file get() = java.io.File(context.filesDir, "tauri-library-metadata.json")
    fun read(): Map<String, LibraryMetadata> = runCatching {
        Json.decodeFromString(ListSerializer(LibraryMetadata.serializer()), file.readText()).associateBy { SyncContract.titleKey(it.title) }
    }.getOrDefault(emptyMap())
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
                            val cover = value("thumbnail_url").takeIf { it.startsWith("http") } ?: previous?.thumbnailUrl.orEmpty()
                            collected[key] = LibraryMetadata(title, url, cover, value("source").ifBlank { previous?.source ?: "jkanime" })
                        }
                    }
                }
            }
            val temporary = java.io.File(file.parentFile, "tauri-library-metadata.tmp")
            temporary.writeText(Json.encodeToString(ListSerializer(LibraryMetadata.serializer()), collected.values.toList()))
            require(temporary.renameTo(file)) { "No se pudieron guardar los metadatos" }
            collected.size
        } finally { snapshot.delete() }
    }
}
