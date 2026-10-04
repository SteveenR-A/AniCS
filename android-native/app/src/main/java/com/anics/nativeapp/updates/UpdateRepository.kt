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
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

data class NativeUpdate(
    val version: String,
    val notes: String,
    val pageUrl: String,
    val apkUrl: String?,
    val size: Long,
    val digest: String?,
    val assetId: Long = 0,
    val updatedAt: String = "",
    val tauriApkUrl: String? = null,
    val tauriApkSize: Long = 0
) {
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
    fun extractSignatures(info: PackageInfo): Set<String> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.signingInfo?.let { signingInfo ->
                val signers = if (signingInfo.hasMultipleSigners()) {
                    signingInfo.apkContentsSigners
                } else {
                    signingInfo.signingCertificateHistory
                }
                if (!signers.isNullOrEmpty()) {
                    return signers.map { it.toCharsString() }.toSet()
                }
            }
        }
        return info.signatures?.map { it.toCharsString() }?.toSet().orEmpty()
    }

    @Suppress("DEPRECATION")
    fun validate(archive: PackageInfo, installed: PackageInfo, expectedPackage: String) {
        require(archive.packageName == expectedPackage) {
            "El APK es de '${archive.packageName}'; necesitas la variante '$expectedPackage'"
        }
        fun code(info: PackageInfo) = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
        require(code(archive) >= code(installed)) {
            "El APK tiene un código de versión anterior (${code(archive)}) al instalado (${code(installed)})"
        }
        val archiveSigs = extractSignatures(archive)
        val installedSigs = extractSignatures(installed)
        if (archiveSigs.isNotEmpty() && installedSigs.isNotEmpty()) {
            require(archiveSigs == installedSigs) {
                "La firma del APK es distinta. Para actualizar conservando los datos, publícalo con la misma clave de firma de la app instalada."
            }
        }
    }
}

class UpdateRepository(
    private val context: Context,
    private val shareApk: (Context, File) -> Uri = { app, apk -> FileProvider.getUriForFile(app, app.packageName + ".fileprovider", apk) },
    private val openConnection: (URL) -> HttpURLConnection = { it.openConnection() as HttpURLConnection }
) {
    private val repo = "SteveenR-A/AniCS"
    private val directory get() = File(context.cacheDir, "updates").apply { mkdirs() }

    @Suppress("DEPRECATION")
    suspend fun check(includeCurrent: Boolean = false): NativeUpdate? = withContext(Dispatchers.IO) {
        val connection = openConnection(URL("https://api.github.com/repos/$repo/releases/latest"))
        connection.connectTimeout = 15000
        connection.readTimeout = 20000
        connection.useCaches = false
        connection.setRequestProperty("Accept", "application/vnd.github+json")
        connection.setRequestProperty("Cache-Control", "no-cache")
        connection.setRequestProperty("User-Agent", "AniCS-Native/" + BuildConfig.VERSION_NAME)
        try {
            if (connection.responseCode == 404) return@withContext null
            require(connection.responseCode == 200) { "GitHub no respondió correctamente (${connection.responseCode})" }
            val data = Json.parseToJsonElement(connection.inputStream.bufferedReader().use { it.readText() }).jsonObject
            val assets = data["assets"]?.jsonArray.orEmpty().map { it.jsonObject }
            val nativeAsset = assets.firstOrNull { it["name"]?.jsonPrimitive?.content == "AniCS-native.apk" && it["state"]?.jsonPrimitive?.content != "starter" }
            val tauriAsset = assets.firstOrNull { it["name"]?.jsonPrimitive?.content == "AniCS.apk" && it["state"]?.jsonPrimitive?.content != "starter" }

            val update = NativeUpdate(
                version = data["tag_name"]!!.jsonPrimitive.content,
                notes = data["body"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                pageUrl = data["html_url"]!!.jsonPrimitive.content,
                apkUrl = nativeAsset?.get("browser_download_url")?.jsonPrimitive?.contentOrNull,
                size = nativeAsset?.get("size")?.jsonPrimitive?.longOrNull ?: 0,
                digest = nativeAsset?.get("digest")?.jsonPrimitive?.contentOrNull,
                assetId = nativeAsset?.get("id")?.jsonPrimitive?.longOrNull ?: 0,
                updatedAt = nativeAsset?.get("updated_at")?.jsonPrimitive?.contentOrNull.orEmpty(),
                tauriApkUrl = tauriAsset?.get("browser_download_url")?.jsonPrimitive?.contentOrNull,
                tauriApkSize = tauriAsset?.get("size")?.jsonPrimitive?.longOrNull ?: 0
            )
            val installed = context.packageManager.getPackageInfo(context.packageName, 0)
            update.takeIf { UpdateVersions.eligible(it, BuildConfig.VERSION_NAME, installed.lastUpdateTime, includeCurrent) }
        } finally {
            connection.disconnect()
        }
    }

    fun getDownloadedApk(update: NativeUpdate): File? {
        val apk = File(directory, "native.apk")
        if (apk.exists() && apk.isFile && apk.length() == update.size) {
            val valid = runCatching { validatePackage(apk); true }.getOrDefault(false)
            if (valid) return apk
        }
        return null
    }

    fun getPartialDownloadSize(): Long {
        val pending = File(directory, "native.apk.part")
        return if (pending.exists() && pending.isFile) pending.length() else 0L
    }

    fun deleteDownloadedApk() {
        val apk = File(directory, "native.apk")
        if (apk.exists()) apk.delete()
        val pending = File(directory, "native.apk.part")
        if (pending.exists()) pending.delete()
    }

    suspend fun download(update: NativeUpdate, onProgress: (UpdateDownloadProgress) -> Unit = {}): File = withContext(Dispatchers.IO) {
        val url = update.apkUrl ?: error("El APK nativo todavía no está adjunto a este release. Intenta más tarde.")
        require(
            url.startsWith("https://github.com/$repo/releases/download/") ||
            url.startsWith("https://objects.githubusercontent.com/") ||
            url.startsWith("https://release-assets.githubusercontent.com/")
        ) { "Origen de actualización no válido: $url" }
        require(update.size in 1..300L * 1024 * 1024) { "Tamaño del APK no válido" }

        val pending = File(directory, "native.apk.part")
        val apk = File(directory, "native.apk")

        // Si ya tenemos el APK descargado, completo y verificado, devolverlo directamente
        getDownloadedApk(update)?.let {
            onProgress(UpdateDownloadProgress(update.size, update.size, verifying = false))
            return@withContext it
        }

        // Determinar si podemos reanudar desde una descarga previa incompleta
        var resumedBytes = 0L
        if (pending.exists()) {
            val len = pending.length()
            if (len in 1 until update.size) {
                resumedBytes = len
            } else if (len >= update.size) {
                pending.delete()
            }
        }

        // Seguir redirecciones HTTP (301, 302, 303, 307, 308)
        var currentUrl = url
        var redirects = 0
        var connection: HttpURLConnection
        var isPartial = false

        while (true) {
            val targetUrl = URL(currentUrl)
            connection = openConnection(targetUrl)
            connection.connectTimeout = 15000
            connection.readTimeout = 30000
            connection.useCaches = false
            connection.setRequestProperty("User-Agent", "AniCS-Native/" + BuildConfig.VERSION_NAME)
            connection.setRequestProperty("Accept", "application/octet-stream, application/vnd.android.package-archive, */*")
            connection.setRequestProperty("Cache-Control", "no-cache")

            if (resumedBytes > 0) {
                connection.setRequestProperty("Range", "bytes=$resumedBytes-")
            }

            val code = connection.responseCode
            if (code in listOf(HttpURLConnection.HTTP_MOVED_PERM, HttpURLConnection.HTTP_MOVED_TEMP, HttpURLConnection.HTTP_SEE_OTHER, 307, 308)) {
                val location = connection.getHeaderField("Location") ?: error("Redirección HTTP $code sin cabecera Location")
                connection.disconnect()
                currentUrl = URL(targetUrl, location).toString()
                redirects++
                require(redirects <= 5) { "Demasiadas redirecciones al descargar la actualización" }
                continue
            }

            if (code == 206) {
                isPartial = true
            } else if (code == 200) {
                // Servidor no usó Range o empezó desde 0
                isPartial = false
                resumedBytes = 0L
            } else {
                connection.disconnect()
                error("No se pudo descargar el APK (HTTP $code)")
            }
            break
        }

        try {
            onProgress(UpdateDownloadProgress(resumedBytes, update.size))

            val outputStream = if (isPartial && resumedBytes > 0) {
                FileOutputStream(pending, true)
            } else {
                pending.outputStream()
            }

            var total = resumedBytes
            var lastProgress = resumedBytes

            connection.inputStream.use { input ->
                outputStream.use { output ->
                    val buffer = ByteArray(65536)
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        require(total <= update.size) { "La descarga supera el tamaño declarado" }
                        output.write(buffer, 0, count)
                        if (total - lastProgress >= 256 * 1024 || total == update.size) {
                            onProgress(UpdateDownloadProgress(total, update.size))
                            lastProgress = total
                        }
                    }
                }
            }

            require(total == update.size) { "La descarga está incompleta ($total / ${update.size} bytes)" }
            onProgress(UpdateDownloadProgress(total, update.size, verifying = true))

            // Verificación hash SHA-256 si está presente
            update.digest?.takeIf { it.startsWith("sha256:") }?.let { digest ->
                val calculatedHash = FileInputStream(pending).use { fis ->
                    val md = MessageDigest.getInstance("SHA-256")
                    val buf = ByteArray(65536)
                    var r: Int
                    while (fis.read(buf).also { r = it } != -1) {
                        md.update(buf, 0, r)
                    }
                    md.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
                }
                require(calculatedHash.equals(digest.removePrefix("sha256:"), ignoreCase = true)) {
                    "El APK descargado no coincide con el hash SHA-256 de GitHub"
                }
            }

            currentCoroutineContext().ensureActive()
            validatePackage(pending)

            if (apk.exists()) check(apk.delete()) { "No se pudo reemplazar el APK anterior" }
            check(pending.renameTo(apk)) { "No se pudo guardar el APK verificado" }
            apk
        } catch (e: Throwable) {
            if (e !is CancellationException) {
                pending.delete()
            }
            throw e
        } finally {
            connection.disconnect()
        }
    }

    @Suppress("DEPRECATION")
    fun validatePackage(apk: File) {
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            PackageManager.GET_SIGNATURES
        }
        val archive = pm.getPackageArchiveInfo(apk.absolutePath, flags)
            ?: pm.getPackageArchiveInfo(apk.absolutePath, PackageManager.GET_SIGNATURES)
            ?: error("Archivo APK no válido")
        val installed = pm.getPackageInfo(context.packageName, flags)
        UpdatePackages.validate(archive, installed, context.packageName)
    }

    fun canInstall(): Boolean = context.packageManager.canRequestPackageInstalls()

    fun installIntent(apk: File): Intent {
        require(apk.canonicalPath == File(directory, "native.apk").canonicalPath && apk.isFile) {
            "Descarga y verifica el APK antes de instalar"
        }
        validatePackage(apk)
        if (!canInstall()) {
            return Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.packageName))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val uri = shareApk(context, apk)
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            clipData = android.content.ClipData.newRawUri("Actualización AniCS", uri)
        }
    }
}
