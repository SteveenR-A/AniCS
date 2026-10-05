package com.anics.nativeapp.downloads

import java.net.URI

data class HlsSegment(val url: String, val keyUrl: String? = null, val iv: ByteArray? = null)
data class HlsPlaylist(val segments: List<HlsSegment>, val initialization: String? = null)

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
        val segments = mutableListOf<HlsSegment>()
        for (line in text.lineSequence().map(String::trim)) when {
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
                segments.add(HlsSegment(URI(base).resolve(line).toString(), key, if (key != null) iv else null))
                sequence++
            }
        }
        require(segments.isNotEmpty() && segments.size <= 20000) { "Lista HLS vacía o demasiado grande" }
        return HlsPlaylist(segments, initialization)
    }
}
