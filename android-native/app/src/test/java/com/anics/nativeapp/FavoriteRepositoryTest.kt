package com.anics.nativeapp

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.anics.nativeapp.data.local.AppDatabase
import com.anics.nativeapp.data.repository.FavoriteRepository
import com.anics.nativeapp.data.repository.canonicalAnimeUrl
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FavoriteRepositoryTest {
    private lateinit var db: AppDatabase
    private lateinit var repo: FavoriteRepository

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).allowMainThreadQueries().build()
        repo = FavoriteRepository(db)
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun canonicalAnimeUrlNormalizesEpisodeAndTrailingSlashes() {
        assertEquals("https://jkanime.net/one-piece/", canonicalAnimeUrl("https://jkanime.net/one-piece/1122/"))
        assertEquals("https://jkanime.net/one-piece/", canonicalAnimeUrl("https://jkanime.net/one-piece/1122"))
        assertEquals("https://jkanime.net/one-piece/", canonicalAnimeUrl("https://jkanime.net/one-piece/"))
        assertEquals("https://jkanime.net/one-piece/", canonicalAnimeUrl("https://jkanime.net/one-piece"))
        assertEquals("https://mundodonghua.com/donghua/soul-land/", canonicalAnimeUrl("https://mundodonghua.com/donghua/soul-land/"))
    }

    @Test
    fun favoriteCanBeQueriedWithEpisodeUrlOrSeriesUrl() = runBlocking {
        val profileId = "default"
        val added = repo.toggleFavorite(
            profileId = profileId,
            title = "One Piece",
            url = "https://jkanime.net/one-piece/1122/",
            thumbnailUrl = "https://thumb.jpg",
            source = "jkanime"
        )
        assertTrue(added)

        // Verificamos que se detecta favorito usando cualquier variación de la URL
        assertTrue(repo.isFavorite(profileId, "https://jkanime.net/one-piece/1122/"))
        assertTrue(repo.isFavorite(profileId, "https://jkanime.net/one-piece/1122"))
        assertTrue(repo.isFavorite(profileId, "https://jkanime.net/one-piece/"))
        assertTrue(repo.isFavorite(profileId, "https://jkanime.net/one-piece"))
        assertFalse(repo.isFavorite(profileId, "https://jkanime.net/naruto/"))

        // La lista en el repositorio contiene la serie canónica
        val favorites = repo.getFavoritesForProfile(profileId).first()
        assertEquals(1, favorites.size)
        assertEquals("https://jkanime.net/one-piece/", favorites[0].url)
        assertEquals("One Piece", favorites[0].title)

        // Alternar de nuevo quita el favorito
        val removed = repo.toggleFavorite(
            profileId = profileId,
            title = "One Piece",
            url = "https://jkanime.net/one-piece/",
            thumbnailUrl = "https://thumb.jpg",
            source = "jkanime"
        )
        assertFalse(removed)
        assertFalse(repo.isFavorite(profileId, "https://jkanime.net/one-piece/"))
        assertFalse(repo.isFavorite(profileId, "https://jkanime.net/one-piece/1122/"))
    }

    @Test
    fun removeFavoriteDeletesAllUrlVariants() = runBlocking {
        val profileId = "default"
        repo.toggleFavorite(
            profileId = profileId,
            title = "Solo Leveling",
            url = "https://jkanime.net/solo-leveling/",
            thumbnailUrl = "https://thumb.jpg",
            source = "jkanime"
        )
        assertTrue(repo.isFavorite(profileId, "https://jkanime.net/solo-leveling/"))

        // Remover usando URL sin slash final
        repo.removeFavorite(profileId, "https://jkanime.net/solo-leveling")
        assertFalse(repo.isFavorite(profileId, "https://jkanime.net/solo-leveling/"))
        assertFalse(repo.isFavorite(profileId, "https://jkanime.net/solo-leveling"))
        val favorites = repo.getFavoritesForProfile(profileId).first()
        assertTrue(favorites.isEmpty())
    }

    @Test
    fun favoritesAreIsolatedByProfile() = runBlocking {
        repo.toggleFavorite("profile1", "Bleach", "https://jkanime.net/bleach/", "", "jkanime")
        assertTrue(repo.isFavorite("profile1", "https://jkanime.net/bleach/"))
        assertFalse(repo.isFavorite("profile2", "https://jkanime.net/bleach/"))
    }
}
