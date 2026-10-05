package com.anics.nativeapp.ui.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.util.Base64
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import java.io.ByteArrayOutputStream

/** Portable PNG avatars also travel with JSON backups and cloud profiles. */
object ProfileImages {
    private const val PREFIX = "data:image/png;base64,"
    fun preset(id: String): Bitmap {
        val bitmap = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val colors = listOf("#66558C", "#3C7470", "#96566B", "#5A6B99")
        canvas.drawColor(Color.parseColor(colors[(id.removePrefix("avatar-").toIntOrNull()?.minus(1) ?: 0).coerceIn(0, 3)]))
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
        canvas.drawCircle(128f, 88f, 38f, paint)
        canvas.drawRoundRect(55f, 142f, 201f, 240f, 50f, 50f, paint)
        return bitmap
    }
    fun bytes(avatar: String): ByteArray = if (avatar.startsWith(PREFIX)) {
        Base64.decode(avatar.removePrefix(PREFIX), Base64.DEFAULT)
    } else ByteArrayOutputStream().use { out -> preset(avatar).compress(Bitmap.CompressFormat.PNG, 100, out); out.toByteArray() }

    fun import(context: Context, uri: Uri): String {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { "La imagen no es válida" }
        val options = BitmapFactory.Options().apply {
            inSampleSize = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / inSampleSize > 1024) inSampleSize *= 2
        }
        val image = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) } ?: error("No se pudo abrir la imagen")
        val side = minOf(image.width, image.height)
        val square = Bitmap.createBitmap(image, (image.width - side) / 2, (image.height - side) / 2, side, side)
        val scaled = Bitmap.createScaledBitmap(square, 256, 256, true)
        val data = ByteArrayOutputStream().use { out -> scaled.compress(Bitmap.CompressFormat.PNG, 100, out); out.toByteArray() }
        return PREFIX + Base64.encodeToString(data, Base64.NO_WRAP)
    }
    fun export(context: Context, avatar: String, uri: Uri) {
        val data = bytes(avatar)
        context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(data) } ?: error("No se pudo guardar la imagen")
    }
}

@Composable
fun ProfileAvatar(avatar: String, modifier: Modifier = Modifier) {
    val data = remember(avatar) { runCatching { ProfileImages.bytes(avatar) }.getOrElse { ProfileImages.bytes("avatar-1") } }
    AsyncImage(data, "Imagen del perfil", modifier, contentScale = ContentScale.Crop)
}
