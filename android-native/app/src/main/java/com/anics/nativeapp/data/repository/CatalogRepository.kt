package com.anics.nativeapp.data.repository

import com.anics.nativeapp.ffi.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Repositorio de catálogo anime respaldado por el cliente nativo FFI (Rust anics-core).
 * Ejecuta todas las operaciones pesadas de red y parsing en el despachador de E/S.
 */
class CatalogRepository(
    private val client: NativeCatalogClient = NativeCatalogClient(null)
) : com.anics.nativeapp.player.PlaybackCatalog {

    suspend fun getAvailableSources(): List<NativeSourceConfig> = withContext(Dispatchers.IO) {
        client.getAvailableSources()
    }

    suspend fun getLatest(source: String, page: Int = 1): List<NativeAnimeResult> = withContext(Dispatchers.IO) {
        safeCards(client.getLatest(source, page.toUInt()))
    }

    suspend fun search(query: String, source: String? = null): List<NativeAnimeResult> = withContext(Dispatchers.IO) {
        client.search(query, source)
    }

    suspend fun advancedSearch(filters: NativeSearchFilters, source: String): NativeSearchResultPage = withContext(Dispatchers.IO) {
        client.advancedSearch(filters, source)
    }

    override suspend fun getDetails(url: String, source: String): NativeAnimeDetails = withContext(Dispatchers.IO) {
        client.getDetails(url, source)
    }

    override suspend fun getServers(episodeUrl: String, source: String): List<NativeVideoServer> = withContext(Dispatchers.IO) {
        client.getServers(episodeUrl, source)
    }

    override suspend fun resolveStream(server: NativeVideoServer, source: String): NativeResolvedMedia = withContext(Dispatchers.IO) {
        client.resolveStream(server, source)
    }

    suspend fun getScheduleDays(source: String): List<NativeScheduleDay> = withContext(Dispatchers.IO) {
        client.getScheduleDays(source).distinctBy { it.day }.map { it.copy(animes = safeCards(it.animes).distinctBy { row -> listOf(row.source, row.url) }) }
    }

    suspend fun getTop(source: String): List<NativeAnimeResult> = withContext(Dispatchers.IO) { safeCards(client.getTop(source)).distinctBy { listOf(it.source, it.url) } }

    suspend fun getGenres(source: String): List<NativeGenreItem> = withContext(Dispatchers.IO) {
        client.getGenres(source)
    }

    fun unpackJs(script: String): String? {
        return client.unpackJs(script)
    }

    fun extractStreamUrl(html: String): String? {
        return client.extractStreamUrl(html)
    }

    fun updateSettings(settingsJson: String) {
        client.updateSettings(settingsJson)
    }
}

// Some providers repeat cards for their desktop/mobile carousels. Compose keys must be unique.
fun safeCards(rows: List<NativeAnimeResult>): List<NativeAnimeResult> = rows.filter { it.url.isNotBlank() }.distinctBy { listOf(it.source, it.url, it.episode.orEmpty()) }
