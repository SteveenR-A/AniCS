package com.anics.nativeapp

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.Signature
import android.provider.Settings
import androidx.test.core.app.ApplicationProvider
import com.anics.nativeapp.updates.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class UpdateFlowTest {
    private val context get() = ApplicationProvider.getApplicationContext<Context>()
    @Suppress("DEPRECATION")
    private fun pkg(code: Int = 3003, signature: String = "1234", name: String = context.packageName) = PackageInfo().apply {
        packageName = name; longVersionCode = code.toLong(); signatures = arrayOf(Signature(signature))
    }
    private fun release(bytes: ByteArray = byteArrayOf(1)) = NativeUpdate(BuildConfig.VERSION_NAME, "Todas las notas", "https://github.com/SteveenR-A/AniCS/releases/latest",
        "https://github.com/SteveenR-A/AniCS/releases/download/v0.3.3/AniCS-native.apk", bytes.size.toLong(),
        "sha256:" + MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }, updatedAt = "2026-10-02T12:00:00Z")
    private class Connection(
        url: URL,
        private val bytes: ByteArray,
        private val status: Int = 200,
        private val headers: Map<String, String> = emptyMap()
    ) : HttpURLConnection(url) {
        var disconnected = false
        override fun connect() {}
        override fun disconnect() { disconnected = true }
        override fun usingProxy() = false
        override fun getResponseCode() = status
        override fun getInputStream() = bytes.inputStream()
        override fun getHeaderField(name: String): String? = headers[name]
    }
    @Test fun sameVersionCanBeReinstalledAndNewAssetTriggersPatchNotice() {
        val update = release()
        val date = java.time.Instant.parse(update.updatedAt).toEpochMilli()
        assertTrue(UpdateVersions.eligible(update, update.version, date + 1, includeCurrent = true))
        assertTrue(UpdateVersions.eligible(update, update.version, date - 1, includeCurrent = false))
        assertFalse(UpdateVersions.eligible(update, update.version, date + 1, includeCurrent = false))
        assertFalse(UpdateVersions.eligible(update.copy(version = "0.1.0"), "0.3.3", 0, true))
    }
    @Test fun packagesAllowEqualCodesButRejectDowngradesWrongVariantsAndSignatures() {
        UpdatePackages.validate(pkg(), pkg(), context.packageName)
        UpdatePackages.validate(pkg(3004), pkg(), context.packageName)
        listOf(pkg(3002), pkg(signature = "5678"), pkg(name = "another.app")).forEach { archive ->
            assertThrows(IllegalArgumentException::class.java) { UpdatePackages.validate(archive, pkg(), context.packageName) }
        }
    }
    @Test fun verifiedDownloadReportsProgressAndInstallerKeepsReadPermission() = runBlocking {
        val bytes = ByteArray(800000) { (it % 255).toByte() }
        val shadow = shadowOf(context.packageManager)
        shadow.getInternalMutablePackageInfo(context.packageName).apply { longVersionCode = 3003; @Suppress("DEPRECATION") signatures = pkg().signatures }
        val directory = File(context.cacheDir, "updates").apply { mkdirs() }
        shadow.setPackageArchiveInfo(File(directory, "native.apk.part").absolutePath, pkg())
        shadow.setPackageArchiveInfo(File(directory, "native.apk").absolutePath, pkg())
        lateinit var connection: Connection
        // Android FileProvider uses '/' internally; Windows Robolectric paths use '\\'.
        // Exercise installer permissions with the provider boundary supplied by this fixture.
        val repository = UpdateRepository(context, shareApk = { _, _ -> android.net.Uri.parse("content://${context.packageName}.fileprovider/cache_files/updates/native.apk") }) { url -> Connection(url, bytes).also { connection = it } }
        val progress = mutableListOf<UpdateDownloadProgress>()
        val apk = repository.download(release(bytes), progress::add)
        assertArrayEquals(bytes, apk.readBytes())
        assertEquals(0L, progress.first().bytes)
        assertTrue(progress.any { it.fraction > 0 && it.fraction < 1 })
        assertEquals(1f, progress.last().fraction, .001f); assertTrue(progress.last().verifying)
        assertTrue(connection.disconnected); assertFalse(File(directory, "native.apk.part").exists())
        shadow.setCanRequestPackageInstalls(false)
        assertEquals(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, repository.installIntent(apk).action)
        shadow.setCanRequestPackageInstalls(true)
        val installer = repository.installIntent(apk)
        assertEquals(Intent.ACTION_VIEW, installer.action)
        assertEquals("application/vnd.android.package-archive", installer.type)
        assertEquals("content", installer.data?.scheme)
        assertTrue(installer.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertEquals(installer.data, installer.clipData?.getItemAt(0)?.uri)
    }
    @Test fun incompleteOrTamperedDownloadsNeverBecomeInstallable() = runBlocking {
        val bytes = ByteArray(500)
        val directory = File(context.cacheDir, "updates").apply { mkdirs() }
        val existing = File(directory, "native.apk").apply { writeText("previous verified APK") }
        val repository = UpdateRepository(context) { url -> Connection(url, bytes) }
        for (update in listOf(release(bytes).copy(size = 501), release(bytes).copy(digest = "sha256:bad"))) {
            try { repository.download(update); fail("Corrupt APK accepted") } catch (_: IllegalArgumentException) {}
            assertFalse(File(directory, "native.apk.part").exists())
            assertEquals("previous verified APK", existing.readText())
        }
    }
    @Test fun githubCheckKeepsCompleteNotesAndSameVersionOnManualCheck() = runBlocking {
        val notes = "Notas completas ".repeat(400)
        val body = kotlinx.serialization.json.buildJsonObject {
            put("tag_name", kotlinx.serialization.json.JsonPrimitive(BuildConfig.VERSION_NAME))
            put("html_url", kotlinx.serialization.json.JsonPrimitive("https://github.com/SteveenR-A/AniCS/releases/latest"))
            put("body", kotlinx.serialization.json.JsonPrimitive(notes))
            put("assets", kotlinx.serialization.json.buildJsonArray {})
        }.toString().toByteArray()
        val repository = UpdateRepository(context) { url -> Connection(url, body) }
        val update = repository.check(includeCurrent = true)!!
        assertEquals(notes, update.notes); assertNull(update.apkUrl)
    }
    @Test fun downloadFollowsRedirectAndSupportsResumption() = runBlocking {
        val totalBytes = ByteArray(1000) { it.toByte() }
        val shadow = shadowOf(context.packageManager)
        shadow.getInternalMutablePackageInfo(context.packageName).apply { longVersionCode = 3003; @Suppress("DEPRECATION") signatures = pkg().signatures }
        val directory = File(context.cacheDir, "updates").apply { mkdirs() }
        shadow.setPackageArchiveInfo(File(directory, "native.apk.part").absolutePath, pkg())
        shadow.setPackageArchiveInfo(File(directory, "native.apk").absolutePath, pkg())

        var callCount = 0
        val repository = UpdateRepository(context, shareApk = { _, f -> android.net.Uri.fromFile(f) }) { targetUrl ->
            callCount++
            if (targetUrl.toString().contains("releases/download")) {
                Connection(targetUrl, byteArrayOf(), status = 302, headers = mapOf("Location" to "https://release-assets.githubusercontent.com/test.apk"))
            } else {
                Connection(targetUrl, totalBytes, status = 200)
            }
        }
        val apk = repository.download(release(totalBytes))
        assertArrayEquals(totalBytes, apk.readBytes())
        assertEquals(2, callCount)
    }
    @Test fun partialDownloadResumesWhenRangeSupported() = runBlocking {
        val totalBytes = ByteArray(1000) { it.toByte() }
        val shadow = shadowOf(context.packageManager)
        shadow.getInternalMutablePackageInfo(context.packageName).apply { longVersionCode = 3003; @Suppress("DEPRECATION") signatures = pkg().signatures }
        val directory = File(context.cacheDir, "updates").apply { mkdirs() }
        val part = File(directory, "native.apk.part").apply { writeBytes(totalBytes.copyOfRange(0, 400)) }
        shadow.setPackageArchiveInfo(File(directory, "native.apk.part").absolutePath, pkg())
        shadow.setPackageArchiveInfo(File(directory, "native.apk").absolutePath, pkg())

        val remainingBytes = totalBytes.copyOfRange(400, 1000)
        val repository = UpdateRepository(context, shareApk = { _, f -> android.net.Uri.fromFile(f) }) { targetUrl ->
            Connection(targetUrl, remainingBytes, status = 206)
        }
        val progress = mutableListOf<UpdateDownloadProgress>()
        val apk = repository.download(release(totalBytes), progress::add)
        assertArrayEquals(totalBytes, apk.readBytes())
        assertEquals(400L, progress.first().bytes)
    }
}
