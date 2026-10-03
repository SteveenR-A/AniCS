package com.anics.nativeapp.downloads

import com.anics.nativeapp.ffi.NativeVideoServer

object ServerSupport {
    fun playable(server: NativeVideoServer): Boolean {
        val text = (server.name + " " + server.url).lowercase()
        // Keep the preview's automatic selection aligned with Rust server_policy:
        // these hosts currently lack a reliable resolver, even when a provider marks them direct.
        val unsupported = listOf("mega.nz", "mega.io", "1fichier", "rapidgator", "zippyshare", "torrent", "fembed", "movearnpre", "dhcplay", "streamwish", "sfastwish", "embedwish", "swish", "mp4upload", "voe", "mixdrop", "streamtape", "dood", "dooodster", "d-s.io", "filemoon", "fmoon", "bysesukior", "bysekoze")
        if (unsupported.any { it in text } || server.name.equals("Mega", true) || server.name.startsWith("Descarga", true)) return false
        return server.url.isNotBlank() && (server.isDirect || listOf("magi", "desu", "mediafire", "vidhide", "uqload", "lulu", "asura", "mdplayer", "redirector.php", ".mp4", ".m3u8").any { it in text })
    }
    fun ordered(servers: List<NativeVideoServer>): List<NativeVideoServer> = servers.distinctBy { it.name + it.url }.sortedBy { if (playable(it)) 0 else 1 }
}
