package com.anics.nativeapp.updates

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import com.anics.nativeapp.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Only the native APK asset is eligible; the Tauri APK is a different package. */
data class NativeUpdate(val version: String, val notes: String, val pageUrl: String, val apkUrl: String?, val size: Long, val digest: String?)
object UpdateVersions {
    fun isNewer(remote: String, current: String): Boolean {
        fun parse(value: String) = Regex("""^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$""").matchEntire(value.trim())?.groupValues?.drop(1)?.map(String::toIntOrNull)
        val r = parse(remote) ?: return false; val c = parse(current) ?: return false
        if (r.any { it == null } || c.any { it == null }) return false
        for (i in 0..2) { if (r[i]!! > c[i]!!) return true; if (r[i]!! < c[i]!!) return false }
        return false
    }
}
class UpdateRepository(private val context: Context) {
    private val repo = "SteveenR-A/AniCS"
    suspend fun check(): NativeUpdate? = withContext(Dispatchers.IO) {
        val connection = URL("https://api.github.com/repos/$repo/releases/latest").openConnection() as HttpURLConnection
        connection.connectTimeout = 15000; connection.readTimeout = 20000
        connection.setRequestProperty("Accept", "application/vnd.github+json")
        connection.setRequestProperty("User-Agent", "AniCS-Native/" + BuildConfig.VERSION_NAME)
        try {
            if (connection.responseCode == 404) return@withContext null
            require(connection.responseCode == 200) { "GitHub no respondió correctamente (${connection.responseCode})" }
            val data = Json.parseToJsonElement(connection.inputStream.bufferedReader().use { it.readText() }).jsonObject
            val tag = data["tag_name"]!!.jsonPrimitive.content
            if (!UpdateVersions.isNewer(tag, BuildConfig.VERSION_NAME)) return@withContext null
            val asset = data["assets"]!!.jsonArray.map { it.jsonObject }.firstOrNull { it["name"]?.jsonPrimitive?.content == "AniCS-native.apk" }
            NativeUpdate(tag, data["body"]?.jsonPrimitive?.contentOrNull ?: "", data["html_url"]!!.jsonPrimitive.content,
                asset?.get("browser_download_url")?.jsonPrimitive?.contentOrNull,
                asset?.get("size")?.jsonPrimitive?.longOrNull ?: 0, asset?.get("digest")?.jsonPrimitive?.contentOrNull)
        } finally { connection.disconnect() }
    }
    suspend fun download(update: NativeUpdate): File = withContext(Dispatchers.IO) {
        val url = update.apkUrl ?: error("El APK nativo todavía no está adjunto a este release. Intenta más tarde.")
        require(url.startsWith("https://github.com/$repo/releases/download/")) { "Origen de actualización no válido" }
        require(update.size in 1..300L * 1024 * 1024) { "Tamaño del APK no válido" }
        val directory = File(context.cacheDir, "updates").apply { mkdirs() }
        val pending = File(directory, "native.apk.part"); val apk = File(directory, "native.apk")
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 15000; connection.readTimeout = 30000
        try {
            require(connection.responseCode == 200) { "No se pudo descargar el APK" }
            var total = 0L
            connection.inputStream.use { input -> pending.outputStream().use { output ->
                val buffer = ByteArray(65536)
                while (true) {
                    val count = input.read(buffer); if (count < 0) break
                    total += count; require(total <= update.size) { "La descarga supera el tamaño declarado" }
                    output.write(buffer, 0, count)
                }
            } }
            require(total == update.size) { "La descarga está incompleta" }
            update.digest?.takeIf { it.startsWith("sha256:") }?.let { digest ->
                val hash = MessageDigest.getInstance("SHA-256")
                pending.inputStream().use { input -> val buffer = ByteArray(65536); while (true) { val n = input.read(buffer); if (n < 0) break; hash.update(buffer, 0, n) } }
                require(hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) } == digest.removePrefix("sha256:")) { "El APK no coincide con el hash de GitHub" }
            }
            validatePackage(pending)
            if (apk.exists()) check(apk.delete())
            check(pending.renameTo(apk)); apk
        } finally { connection.disconnect(); pending.delete() }
    }
    @Suppress("DEPRECATION")
    private fun validatePackage(apk: File) {
        val pm = context.packageManager
        val archive = pm.getPackageArchiveInfo(apk.absolutePath, PackageManager.GET_SIGNATURES) ?: error("Archivo APK no válido")
        val installed = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
        require(archive.packageName == context.packageName) { "Este APK corresponde a otra variante de AniCS" }
        require(archive.versionCode > installed.versionCode) { "El APK no tiene un código de versión más reciente" }
        require(!archive.signatures.isNullOrEmpty() && !installed.signatures.isNullOrEmpty() && archive.signatures?.map { it.toCharsString() }?.toSet() == installed.signatures?.map { it.toCharsString() }?.toSet()) {
            "La firma del APK cambió. Se necesita la misma clave de firma para actualizar sin desinstalar. Exporta un respaldo antes de una reinstalación."
        }
    }
    fun installIntent(apk: File): Intent {
        validatePackage(apk)
        if (!context.packageManager.canRequestPackageInstalls()) return Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.packageName))
        val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", apk)
        return Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
}
