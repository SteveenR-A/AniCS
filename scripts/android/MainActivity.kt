package com.anics.app

import android.os.Bundle
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import android.webkit.JavascriptInterface
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import android.util.Log
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.app.ActivityCompat
import androidx.core.content.FileProvider
import android.Manifest
import android.provider.Settings
import java.io.File

class AndroidNativeBridge(private val activity: android.app.Activity) {
  @JavascriptInterface
  fun installApk(filePath: String) {
    activity.runOnUiThread {
      try {
        val apkFile = File(filePath)
        if (!apkFile.exists()) {
          val msg = "El archivo de actualización no se encontró en: $filePath"
          Toast.makeText(activity, msg, Toast.LENGTH_LONG).show()
          Log.e("AniCS", msg)
          return@runOnUiThread
        }

        // Android 8.0+ (API 26+): verificar permiso de instalación de fuentes desconocidas
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          if (!activity.packageManager.canRequestPackageInstalls()) {
            val manageIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
              data = Uri.parse("package:${activity.packageName}")
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(manageIntent)
            Toast.makeText(
              activity,
              "Activa el permiso 'Instalar aplicaciones desconocidas' y vuelve a presionar Instalar",
              Toast.LENGTH_LONG
            ).show()
            return@runOnUiThread
          }
        }

        val uri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          FileProvider.getUriForFile(
            activity,
            "${activity.packageName}.fileprovider",
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
        activity.startActivity(intent)
      } catch (e: Exception) {
        Log.e("AniCS", "Error al iniciar instalador APK: ${e.message}", e)
        val errDetail = "${e.javaClass.simpleName}: ${e.message ?: "Sin mensaje"}"
        Toast.makeText(activity, "Error instalando APK ($errDetail)", Toast.LENGTH_LONG).show()
      }
    }
  }
}

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Pantalla completa inmersiva de borde a borde y a través de notch/recortes de pantalla
    WindowCompat.setDecorFitsSystemWindows(window, false)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.attributes.layoutInDisplayCutoutMode =
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    }

    @Suppress("DEPRECATION")
    window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
    @Suppress("DEPRECATION")
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    hideSystemBars()

    window.decorView.post {
      hideSystemBars()
    }

    window.decorView.setOnSystemUiVisibilityChangeListener { visibility ->
      if ((visibility and View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) {
        window.decorView.postDelayed({ hideSystemBars() }, 1500)
      }
    }

    startWebViewObserver()
    requestStoragePermissions()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      hideSystemBars()
      window.decorView.postDelayed({ hideSystemBars() }, 200)
    }
  }

  override fun onResume() {
    super.onResume()
    hideSystemBars()
    window.decorView.postDelayed({ hideSystemBars() }, 200)
    configureWebViewSettings()
  }

  private fun hideSystemBars() {
    try {
      val controller = WindowCompat.getInsetsController(window, window.decorView)
      controller.systemBarsBehavior =
        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      controller.hide(WindowInsetsCompat.Type.systemBars())
    } catch (e: Exception) {}

    // Flags inmersivos universales (compatibles con todos los fabricantes: Samsung, Xiaomi, Motorola, etc.)
    @Suppress("DEPRECATION")
    window.decorView.systemUiVisibility = (
      View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
      or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
      or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
      or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
      or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
      or View.SYSTEM_UI_FLAG_FULLSCREEN
    )
  }

  private fun configureWebViewSettings() {
    try {
      val root = window.decorView as? ViewGroup
      root?.let { enableWebViewFileAccess(it) }
    } catch (e: Exception) {}
  }

  private fun startWebViewObserver() {
    window.decorView.viewTreeObserver.addOnGlobalLayoutListener {
      configureWebViewSettings()
    }
  }

  private fun enableWebViewFileAccess(viewGroup: ViewGroup) {
    for (i in 0 until viewGroup.childCount) {
      val child = viewGroup.getChildAt(i)
      if (child is WebView) {
        child.settings.apply {
          allowFileAccess = true
          allowContentAccess = true
          allowFileAccessFromFileURLs = true
          allowUniversalAccessFromFileURLs = true
          mediaPlaybackRequiresUserGesture = false
          domStorageEnabled = true
        }
        child.addJavascriptInterface(AndroidNativeBridge(this@MainActivity), "AndroidBridge")
      } else if (child is ViewGroup) {
        enableWebViewFileAccess(child)
      }
    }
  }

  private fun requestStoragePermissions() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      val permissions = arrayOf(
        Manifest.permission.READ_EXTERNAL_STORAGE,
        Manifest.permission.WRITE_EXTERNAL_STORAGE
      )
      ActivityCompat.requestPermissions(this, permissions, 1001)
    }
  }
}
