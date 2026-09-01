package com.anics.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.File
import java.lang.ref.WeakReference

/**
 * Puente nativo JavaScript <-> Android para AniCS.
 * Utiliza WeakReference para prevenir fugas de memoria y valida el ciclo de vida de la Activity.
 */
class AndroidNativeBridge(activity: Activity) {
    private val activityRef = WeakReference(activity)
    private val TAG = "AniCS"

    @JavascriptInterface
    @JvmOverloads
    fun startDownloadService(title: String, subtitle: String = "Iniciando descargas...", details: String = "") {
        val act = activityRef.get() ?: return
        if (act.isFinishing || act.isDestroyed) return

        act.runOnUiThread {
            try {
                val intent = Intent(act, DownloadService::class.java).apply {
                    action = DownloadService.ACTION_START
                    putExtra("title", title)
                    putExtra("subtitle", subtitle)
                    putExtra("details", details)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    act.startForegroundService(intent)
                } else {
                    act.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error iniciando DownloadService: ${e.message}", e)
            }
        }
    }

    @JavascriptInterface
    fun updateDownloadNotification(title: String, subtitle: String, progress: Int, details: String) {
        val act = activityRef.get() ?: return
        if (act.isFinishing || act.isDestroyed) return

        act.runOnUiThread {
            try {
                val intent = Intent(act, DownloadService::class.java).apply {
                    action = DownloadService.ACTION_UPDATE
                    putExtra("title", title)
                    putExtra("subtitle", subtitle)
                    putExtra("progress", progress)
                    putExtra("details", details)
                }
                act.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error actualizando notificación de DownloadService: ${e.message}", e)
            }
        }
    }

    @JavascriptInterface
    fun stopDownloadService() {
        val act = activityRef.get() ?: return
        if (act.isFinishing || act.isDestroyed) return

        act.runOnUiThread {
            try {
                val intent = Intent(act, DownloadService::class.java).apply {
                    action = DownloadService.ACTION_STOP
                }
                act.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error deteniendo DownloadService: ${e.message}", e)
            }
        }
    }

    @JavascriptInterface
    fun notifyDownloadComplete(title: String, episodeInfo: String) {
        val act = activityRef.get() ?: return
        if (act.isFinishing || act.isDestroyed) return

        act.runOnUiThread {
            try {
                val intent = Intent(act, DownloadService::class.java).apply {
                    action = DownloadService.ACTION_COMPLETE
                    putExtra("title", title)
                    putExtra("episodeInfo", episodeInfo)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    act.startForegroundService(intent)
                } else {
                    act.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error notificando descarga completada: ${e.message}", e)
            }
        }
    }

    @JavascriptInterface
    fun showUpdateNotification(title: String, body: String) {
        val act = activityRef.get() ?: return
        if (act.isFinishing || act.isDestroyed) return

        act.runOnUiThread {
            try {
                val intent = Intent(act, DownloadService::class.java).apply {
                    action = DownloadService.ACTION_UPDATE_NOTIF
                    putExtra("title", title)
                    putExtra("body", body)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    act.startForegroundService(intent)
                } else {
                    act.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error emitiendo notificación de actualización: ${e.message}", e)
            }
        }
    }

    @JavascriptInterface
    fun setKeepScreenOn(enabled: Boolean) {
        val act = activityRef.get() ?: return
        if (act.isFinishing || act.isDestroyed) return

        act.runOnUiThread {
            try {
                if (enabled) {
                    act.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    act.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error modificando FLAG_KEEP_SCREEN_ON: ${e.message}", e)
            }
        }
    }

    @JavascriptInterface
    fun setFullscreenMode(enabled: Boolean) {
        val act = activityRef.get() ?: return
        if (act.isFinishing || act.isDestroyed) return

        act.runOnUiThread {
            try {
                val controller = WindowCompat.getInsetsController(act.window, act.window.decorView)
                if (enabled) {
                    controller.systemBarsBehavior =
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    controller.hide(WindowInsetsCompat.Type.systemBars())
                } else {
                    controller.show(WindowInsetsCompat.Type.systemBars())
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error cambiando modo pantalla completa en Android: ${e.message}", e)
            }
        }
    }

    @JavascriptInterface
    fun setScreenOrientation(orientation: String) {
        val act = activityRef.get() ?: return
        if (act.isFinishing || act.isDestroyed) return

        act.runOnUiThread {
            try {
                when (orientation.lowercase()) {
                    "landscape" -> act.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    "portrait" -> act.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                    "sensor" -> act.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR
                    else -> act.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error cambiando orientación de pantalla en Android: ${e.message}", e)
            }
        }
    }

    @JavascriptInterface
    fun saveSecureToken(key: String, token: String) {
        val act = activityRef.get() ?: return
        try {
            val prefs = act.getSharedPreferences("anics_secure_prefs", Activity.MODE_PRIVATE)
            prefs.edit().putString(key, token).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error guardando secure token en Android: ${e.message}", e)
        }
    }

    @JavascriptInterface
    fun getSecureToken(key: String): String? {
        val act = activityRef.get() ?: return null
        return try {
            val prefs = act.getSharedPreferences("anics_secure_prefs", Activity.MODE_PRIVATE)
            prefs.getString(key, null)
        } catch (e: Exception) {
            Log.e(TAG, "Error obteniendo secure token en Android: ${e.message}", e)
            null
        }
    }

    @JavascriptInterface
    fun deleteSecureToken(key: String) {
        val act = activityRef.get() ?: return
        try {
            val prefs = act.getSharedPreferences("anics_secure_prefs", Activity.MODE_PRIVATE)
            prefs.edit().remove(key).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error eliminando secure token en Android: ${e.message}", e)
        }
    }

    @JavascriptInterface
    fun installApk(filePath: String) {
        val act = activityRef.get() ?: return
        if (act.isFinishing || act.isDestroyed) return

        act.runOnUiThread {
            try {
                val apkFile = File(filePath)
                if (!apkFile.exists()) {
                    val msg = "El archivo de actualización no se encontró en: $filePath"
                    Toast.makeText(act, msg, Toast.LENGTH_LONG).show()
                    Log.e(TAG, msg)
                    return@runOnUiThread
                }

                // Android 8.0+ (API 26+): verificar permiso de instalación de fuentes desconocidas
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (!act.packageManager.canRequestPackageInstalls()) {
                        val manageIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                            data = Uri.parse("package:${act.packageName}")
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        act.startActivity(manageIntent)
                        Toast.makeText(
                            act,
                            "Activa el permiso 'Instalar aplicaciones desconocidas' y vuelve a presionar Instalar",
                            Toast.LENGTH_LONG
                        ).show()
                        return@runOnUiThread
                    }
                }

                val uri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    FileProvider.getUriForFile(
                        act,
                        "${act.packageName}.fileprovider",
                        apkFile
                    )
                } else {
                    Uri.fromFile(apkFile)
                }

                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                act.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error al iniciar instalador APK: ${e.message}", e)
                val errDetail = "${e.javaClass.simpleName}: ${e.message ?: "Sin mensaje"}"
                Toast.makeText(act, "Error instalando APK ($errDetail)", Toast.LENGTH_LONG).show()
            }
        }
    }

    @JavascriptInterface
    fun openInBrowser(url: String) {
        val act = activityRef.get() ?: return
        if (act.isFinishing || act.isDestroyed) return

        act.runOnUiThread {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                act.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error al abrir navegador externo: ${e.message}", e)
            }
        }
    }
}

/**
 * MainActivity optimizada para Tauri + Android 8 a 15+.
 *
 * Características clave:
 * - Sin flags de seguridad vulnerables (allowUniversalAccessFromFileURLs desactivado).
 * - Sin memory leaks de observers: configuración única e idempotente del WebView.
 * - Solicitud de permisos moderna (POST_NOTIFICATIONS para Android 13+).
 * - Pantalla completa inmersiva y edge-to-edge limpia sin retrasos acumulativos.
 */
class MainActivity : TauriActivity() {

    companion object {
        private const val TAG = "AniCS"
        private const val REQ_CODE_STORAGE_LEGACY = 1001
    }

    private var isWebViewConfigured = false

    // Launcher para permiso de notificaciones (Android 13+ / API 33+)
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (!isGranted) {
            Toast.makeText(
                this,
                "Sin permiso de notificaciones no podrás ver el progreso de descargas en segundo plano",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setupEdgeToEdge()

        // Esperar a que Tauri infle el layout para encontrar el WebView
        window.decorView.post {
            findAndConfigureWebView()
            if (!isWebViewConfigured) {
                val observer = window.decorView.viewTreeObserver
                observer.addOnGlobalLayoutListener(object : android.view.ViewTreeObserver.OnGlobalLayoutListener {
                    override fun onGlobalLayout() {
                        findAndConfigureWebView()
                        if (isWebViewConfigured) {
                            try {
                                window.decorView.viewTreeObserver.removeOnGlobalLayoutListener(this)
                            } catch (_: Exception) {}
                        }
                    }
                })
            }
        }

        requestPermissionsIfNeeded()
        cleanOldApks()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && !isWebViewConfigured) {
            findAndConfigureWebView()
        }
    }

    override fun onResume() {
        super.onResume()
        if (!isWebViewConfigured) {
            findAndConfigureWebView()
        }
    }

    // -------------------------------------------------------------------------
    // Edge-to-edge moderno sin ocultar barras de navegación del sistema
    // -------------------------------------------------------------------------
    private fun setupEdgeToEdge() {
        WindowCompat.setDecorFitsSystemWindows(window, false)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        // Permitir que la barra de navegación y la barra de estado se muestren de forma estándar
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false
    }

    // -------------------------------------------------------------------------
    // Configuración segura del WebView (una sola vez)
    // -------------------------------------------------------------------------
    private fun findAndConfigureWebView() {
        if (isWebViewConfigured) return
        val root = window.decorView as? ViewGroup ?: return
        val wv = findWebView(root) ?: return

        try {
            wv.settings.apply {
                allowFileAccess = true
                allowContentAccess = true
                allowFileAccessFromFileURLs = false
                allowUniversalAccessFromFileURLs = false
                mediaPlaybackRequiresUserGesture = false
                domStorageEnabled = true
            }

            wv.addJavascriptInterface(AndroidNativeBridge(this), "AndroidBridge")
            isWebViewConfigured = true
            Log.i(TAG, "WebView configurado y AndroidBridge registrado exitosamente")
        } catch (e: Exception) {
            Log.e(TAG, "Error configurando WebView", e)
        }
    }

    private fun findWebView(root: ViewGroup): WebView? {
        val queue = ArrayDeque<View>()
        queue.add(root)
        while (queue.isNotEmpty()) {
            when (val child = queue.removeFirst()) {
                is WebView -> return child
                is ViewGroup -> {
                    for (i in 0 until child.childCount) {
                        queue.add(child.getChildAt(i))
                    }
                }
            }
        }
        return null
    }

    // -------------------------------------------------------------------------
    // Permisos
    // -------------------------------------------------------------------------
    private fun requestPermissionsIfNeeded() {
        // 1. Notificaciones (Android 13+ / API 33+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            when {
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED -> { /* Concedido */ }

                ActivityCompat.shouldShowRequestPermissionRationale(
                    this, Manifest.permission.POST_NOTIFICATIONS
                ) -> showNotificationRationale()

                else -> notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        // 2. Almacenamiento legacy (solo Android 9 y menor)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            val perms = arrayOf(
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            )
            val missing = perms.filter {
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
            }
            if (missing.isNotEmpty()) {
                ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQ_CODE_STORAGE_LEGACY)
            }
        }
    }

    private fun showNotificationRationale() {
        AlertDialog.Builder(this)
            .setTitle("Notificaciones de descarga")
            .setMessage("AniCS necesita mostrar notificaciones para que veas el progreso de tus descargas en segundo plano.")
            .setPositiveButton("Conceder") { _, _ ->
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_CODE_STORAGE_LEGACY) {
            if (grantResults.isNotEmpty() && grantResults[0] != PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "Permiso de almacenamiento denegado", Toast.LENGTH_LONG).show()
            }
        }
    }

    // -------------------------------------------------------------------------
    // Limpieza de APKs antiguos de caché
    // -------------------------------------------------------------------------
    private fun cleanOldApks() {
        try {
            val dirs = listOfNotNull(cacheDir, externalCacheDir)
            dirs.forEach { dir ->
                dir.listFiles { f -> f.isFile && f.name.endsWith(".apk", ignoreCase = true) }
                    ?.forEach { apk ->
                        try {
                            apk.delete()
                            Log.i(TAG, "APK temporal de caché eliminado: ${apk.name}")
                        } catch (_: Exception) {}
                    }
            }
        } catch (e: Exception) {
            Log.w(TAG, "No se pudieron limpiar APKs antiguos de caché: ${e.message}")
        }
    }
}
