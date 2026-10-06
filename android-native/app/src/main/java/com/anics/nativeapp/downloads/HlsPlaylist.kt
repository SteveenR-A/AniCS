package com.anics.nativeapp.downloads

import java.net.URI

data class HlsSegment(val url: String, val keyUrl: String? = null, val iv: ByteArray? = null, val durationSeconds: Double = 0.0)
data class HlsPlaylist(val segments: List<HlsSegment>, val initialization: String? = null) {
    private val fractions: FloatArray by lazy {
        val duration = segments.sumOf { it.durationSeconds }
        val weighted = duration.isFinite() && duration > 0 && segments.all { it.durationSeconds > 0 }
        var elapsed = 0.0
        FloatArray(segments.size + 1) { index ->
            if (index == 0) 0f else {
                elapsed += segments[index - 1].durationSeconds
                if (weighted) (elapsed / duration).toFloat().coerceIn(0f, 1f) else index.toFloat() / segments.size
            }
        }
    }
    fun progress(completedSegments: Int): Float {
        return fractions[completedSegments.coerceIn(0, segments.size)]
    }
}

/** Finite full-resource playlists. Reject unsupported formats before writing a video. */
object HlsPlaylists {
    private fun attribute(line: String, name: String): String? = Regex("(?:^|,)${name}=(\"[^\"]*\"|[^,]*)").find(line.substringAfter(':'))?.groupValues?.get(1)?.trim('"')
    fun variant(text: String, base: String): String? {
        val lines = text.lineSequence().map(String::trim).toList()
        return lines.indices.filter { lines[it].startsWith("#EXT-X-STREAM-INF:") }.mapNotNull { index ->
            lines.drop(index + 1).firstOrNull { it.isNotBlank() && !it.startsWith('#') }?.let {
                (attribute(lines[index], "BANDWIDTH")?.toLongOrNull() ?: 0L) to URI(base).resolve(it).toString()
            }
        }.maxByOrNull { it.first }?.second
    }
    fun parse(text: String, base: String): HlsPlaylist {
        require(text.trimStart().startsWith("#EXTM3U")) { "El servidor no devolvió una lista HLS" }
        require(text.contains("#EXT-X-ENDLIST")) { "No se admiten descargas de emisiones en directo" }
        require(!text.contains("#EXT-X-BYTERANGE") && !text.contains("#EXT-X-DISCONTINUITY")) { "Este formato HLS requiere otro servidor" }
        var key: String? = null
        var explicitIv: ByteArray? = null
        var sequence = 0L
        var initialization: String? = null
        var duration = 0.0
        val segments = mutableListOf<HlsSegment>()
        for (line in text.lineSequence().map(String::trim)) when {
            line.startsWith("#EXTINF:") -> duration = line.substringAfter(':').substringBefore(',').toDoubleOrNull()
                ?.takeIf { it.isFinite() && it > 0 } ?: 0.0
            line.startsWith("#EXT-X-MEDIA-SEQUENCE:") -> sequence = line.substringAfter(':').toLong()
            line.startsWith("#EXT-X-MAP:") -> {
                require(attribute(line, "BYTERANGE") == null && key == null) { "Inicialización HLS no compatible" }
                require(initialization == null) { "Múltiples inicializaciones HLS no compatibles" }
                initialization = URI(base).resolve(attribute(line, "URI") ?: error("Falta inicialización HLS")).toString()
            }
            line.startsWith("#EXT-X-KEY:") -> {
                val method = attribute(line, "METHOD")
                require(method == "NONE" || method == "AES-128") { "El servidor usa cifrado HLS no compatible" }
                require(attribute(line, "KEYFORMAT") in listOf(null, "identity")) { "No se admite DRM" }
                key = if (method == "NONE") null else URI(base).resolve(attribute(line, "URI") ?: error("Falta la clave HLS")).toString()
                explicitIv = attribute(line, "IV")?.removePrefix("0x")?.let { hex ->
                    require(hex.length <= 32 && hex.all { it.digitToIntOrNull(16) != null }) { "IV HLS no válido" }
                    hex.padStart(32, '0').chunked(2).map { it.toInt(16).toByte() }.toByteArray()
                }
            }
            line.isNotBlank() && !line.startsWith('#') -> {
                val iv = explicitIv ?: java.nio.ByteBuffer.allocate(16).putLong(0).putLong(sequence).array()
                segments.add(HlsSegment(URI(base).resolve(line).toString(), key, if (key != null) iv else null, duration))
                duration = 0.0
                sequence++
            }
        }
        require(segments.isNotEmpty() && segments.size <= 20000) { "Lista HLS vacía o demasiado grande" }
        return HlsPlaylist(segments, initialization)
    }
}
