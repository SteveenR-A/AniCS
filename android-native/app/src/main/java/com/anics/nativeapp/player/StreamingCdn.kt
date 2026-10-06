package com.anics.nativeapp.player

import java.net.URI
import java.util.Locale

/** Same mirror family already handled by Tauri; never replace a host inside a path or token. */
internal fun streamingCdnCandidates(url: String, rememberedHost: String? = null): List<String> {
    val uri = runCatching { URI(url) }.getOrNull() ?: return listOf(url)
    val host = uri.host?.lowercase(Locale.ROOT) ?: return listOf(url)
    if (uri.scheme?.lowercase(Locale.ROOT) !in listOf("http", "https") || uri.rawUserInfo != null ||
        uri.port != -1 || !Regex("cdn[1-6]\\.ducvomes\\.com").matches(host)) return listOf(url)
    val preferred = if (host in listOf("cdn2.ducvomes.com", "cdn5.ducvomes.com")) "cdn1.ducvomes.com" else host
    val remembered = rememberedHost?.takeIf { Regex("cdn[1-6]\\.ducvomes\\.com").matches(it) }
    val hosts = listOfNotNull(remembered, preferred, host, "cdn1.ducvomes.com", "cdn3.ducvomes.com", "cdn4.ducvomes.com", "cdn6.ducvomes.com")
        .distinct().take(4)
    val start = url.indexOf("://") + 3
    return hosts.map { url.replaceRange(start, start + uri.rawAuthority.length, it) }
}
