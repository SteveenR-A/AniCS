package com.anics.nativeapp.updates

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.anics.nativeapp.BuildConfig
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

data class NativeUpdate(val version: String, val notes: String, val pageUrl: String, val apkUrl: String?, val size: Long, val digest: String?,
    val assetId: Long = 0, val updatedAt: String = "") {
    val identity: String get() = "$version|$assetId|$updatedAt|${digest.orEmpty()}|$size"
}
data class UpdateDownloadProgress(val bytes: Long, val total: Long, val verifying: Boolean = false) {
    val fraction: Float get() = if (total > 0) (bytes.toFloat() / total).coerceIn(0f, 1f) else 0f
}
object UpdateVersions {
    fun compare(remote: String, current: String): Int? {
        fun parse(value: String) = Regex("""^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$""").matchEntire(value.trim())?.groupValues?.drop(1)?.map(String::toIntOrNull)
        val r = parse(remote) ?: return null; val c = parse(current) ?: return null
        if (r.any { it == null } || c.any { it == null }) return null
        for (i in 0..2) { val difference = r[i]!!.compareTo(c[i]!!); if (difference != 0) return difference }
        return 0
    }
    fun isNewer(remote: String, current: String) = compare(remote, current)?.let { it > 0 } == true
    fun eligible(update: NativeUpdate, current: String, installedAt: Long, includeCurrent: Boolean): Boolean {
        val comparison = compare(update.version, current) ?: return false
        if (comparison > 0) return true
        if (comparison < 0) return false
        val publishedAt = runCatching { java.time.Instant.parse(update.updatedAt).toEpochMilli() }.getOrDefault(0)
        return includeCurrent || (update.apkUrl != null && publishedAt > installedAt)
    }
}
object UpdatePackages {
    @Suppress("DEPRECATION")
    fun validate(archive: PackageInfo, installed: PackageInfo, expectedPackage: String) {
        require(archive.packageName == expectedPackage) { "El APK es de ${archive.packageName}; necesitas la variante $expectedPackage" }
        fun code(info: PackageInfo) = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
        require(code(archive) >= code(installed)) { "El APK tiene un código de versión anterior al instalado" }
        require(!archive.signatures.isNullOrEmpty() && !installed.signatures.isNullOrEmpty() && archive.signatures?.map { it.toCharsString() }?.toSet() == installed.signatures?.map { it.toCharsString() }?.toSet()) {
            "La firma del APK es distinta. Para actualizar conservando los datos, publícalo con la misma clave de firma de la app instalada."
        }
    }
}
class UpdateRepository(private val context: Context,
    private val shareApk: (Context, File) -> Uri = { app, apk -> FileProvider.getUriForFile(app, app.packageName + ".fileprovider", apk) },
    private val openConnection: (URL) -> HttpURLConnection = { it.openConnection() as HttpURLConnection }) {
    private val repo = "SteveenR-A/AniCS"
    private val directory get() = File(context.cacheDir, "updates").apply { mkdirs() }
    @Suppress("DEPRECATION")
    suspend fun check(includeCurrent: Boolean = false): NativeUpdate? = withContext(Dispatchers.IO) {
        val connection = openConnection(URL("https://api.github.com/repos/$repo/releases/latest"))
        connection.connectTimeout = 15000; connection.readTimeout = 20000; connection.useCaches = false
        connection.setRequestProperty("Accept", "application/vnd.github+json")
        connection.setRequestProperty("Cache-Control", "no-cache")
        connection.setRequestProperty("User-Agent", "AniCS-Native/" + BuildConfig.VERSION_NAME)
        try {
            if (connection.responseCode == 404) return@withContext null
            require(connection.responseCode == 200) { "GitHub no respondió correctamente (${connection.responseCode})" }
            val data = Json.parseToJsonElement(connection.inputStream.bufferedReader().use { it.readText() }).jsonObject
            val asset = data["assets"]?.jsonArray.orEmpty().map { it.jsonObject }.firstOrNull { it["name"]?.jsonPrimitive?.content == "AniCS-native.apk" && it["state"]?.jsonPrimitive?.content != "starter" }
            val update = NativeUpdate(data["tag_name"]!!.jsonPrimitive.content, data["body"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                data["html_url"]!!.jsonPrimitive.content, asset?.get("browser_download_url")?.jsonPrimitive?.contentOrNull,
                asset?.get("size")?.jsonPrimitive?.longOrNull ?: 0, asset?.get("digest")?.jsonPrimitive?.contentOrNull,
                asset?.get("id")?.jsonPrimitive?.longOrNull ?: 0, asset?.get("updated_at")?.jsonPrimitive?.contentOrNull.orEmpty())
            val installed = context.packageManager.getPackageInfo(context.packageName, 0)
            update.takeIf { UpdateVersions.eligible(it, BuildConfig.VERSION_NAME, installed.lastUpdateTime, includeCurrent) }
        } finally { connection.disconnect() }
    }
    suspend fun download(update: NativeUpdate, onProgress: (UpdateDownloadProgress) -> Unit = {}): File = withContext(Dispatchers.IO) {
        val url = update.apkUrl ?: error("El APK nativo todavía no está adjunto a este release. Intenta más tarde.")
        require(url.startsWith("https://github.com/$repo/releases/download/")) { "Origen de actualización no válido" }
        require(update.size in 1..300L * 1024 * 1024) { "Tamaño del APK no válido" }
        val pending = File(directory, "native.apk.part"); val apk = File(directory, "native.apk")
        val connection = openConnection(URL(url))
        connection.connectTimeout = 15000; connection.readTimeout = 30000; connection.useCaches = false
        connection.setRequestProperty("Cache-Control", "no-cache")
        try {
            onProgress(UpdateDownloadProgress(0, update.size))
            require(connection.responseCode == 200) { "No se pudo descargar el APK (HTTP ${connection.responseCode})" }
            var total = 0L; var lastProgress = 0L
            val hash = MessageDigest.getInstance("SHA-256")
            connection.inputStream.use { input -> pending.outputStream().use { output ->
                val buffer = ByteArray(65536)
                while (true) {
                    currentCoroutineContext().ensureActive()
                    val count = input.read(buffer); if (count < 0) break
                    total += count; require(total <= update.size) { "La descarga supera el tamaño declarado" }
                    output.write(buffer, 0, count); hash.update(buffer, 0, count)
                    if (total - lastProgress >= 256 * 1024 || total == update.size) { onProgress(UpdateDownloadProgress(total, update.size)); lastProgress = total }
                }
            } }
            require(total == update.size) { "La descarga está incompleta" }
            onProgress(UpdateDownloadProgress(total, update.size, verifying = true))
            update.digest?.takeIf { it.startsWith("sha256:") }?.let { digest ->
                require(hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) }.equals(digest.removePrefix("sha256:"), true)) { "El APK no coincide con el hash de GitHub" }
            }
            currentCoroutineContext().ensureActive()
            validatePackage(pending)
            if (apk.exists()) check(apk.delete()) { "No se pudo reemplazar el APK anterior" }
            check(pending.renameTo(apk)) { "No se pudo guardar el APK" }; apk
        } finally { connection.disconnect(); pending.delete() }
    }
    @Suppress("DEPRECATION")
    private fun validatePackage(apk: File) {
        val pm = context.packageManager
        val archive = pm.getPackageArchiveInfo(apk.absolutePath, PackageManager.GET_SIGNATURES) ?: error("Archivo APK no válido")
        UpdatePackages.validate(archive, pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES), context.packageName)
    }
    fun canInstall(): Boolean = context.packageManager.canRequestPackageInstalls()
    fun installIntent(apk: File): Intent {
        require(apk.canonicalPath == File(directory, "native.apk").canonicalPath && apk.isFile) { "Descarga y verifica el APK antes de instalar" }
        validatePackage(apk)
        if (!canInstall()) return Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.packageName))
        val uri = shareApk(context, apk)
        return Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply { clipData = android.content.ClipData.newRawUri("Actualización AniCS", uri) }
    }
}
