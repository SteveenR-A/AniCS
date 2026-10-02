package com.anics.nativeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import androidx.lifecycle.lifecycleScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.anics.nativeapp.data.local.AppDatabase
import com.anics.nativeapp.data.repository.*
import com.anics.nativeapp.ffi.NativeResolvedMedia
import com.anics.nativeapp.player.PlayerController
import com.anics.nativeapp.player.PlayerScreen
import com.anics.nativeapp.ui.screens.*
import com.anics.nativeapp.ui.theme.AniCSTheme
import com.anics.nativeapp.ui.viewmodels.*
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

sealed class Screen(val route: String, val title: String, val icon: ImageVector) {
    object Home : Screen("home", "Inicio", Icons.Default.Home)
    object Search : Screen("search", "Buscar", Icons.Default.Search)
    object Favorites : Screen("favorites", "Favoritos", Icons.Default.Favorite)
    object Downloads : Screen("downloads", "Descargas", Icons.Default.Download)
    object Settings : Screen("settings", "Ajustes", Icons.Default.Settings)
}

class MainActivity : ComponentActivity() {

    private lateinit var playerController: PlayerController
    private lateinit var localMediaServer: com.anics.nativeapp.downloads.LocalMediaServer

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val database = AppDatabase.getInstance(applicationContext)
        val catalogRepo = CatalogRepository()
        val historyRepo = HistoryRepository(database)
        val favoriteRepo = FavoriteRepository(database)
        val profileRepo = ProfileRepository(database)
        val settingsRepo = SettingsRepository(applicationContext)

        playerController = PlayerController(applicationContext)
        localMediaServer = com.anics.nativeapp.downloads.LocalMediaServer(applicationContext)

        lifecycleScope.launch {
            settingsRepo.syncSettings.collect { values ->
                catalogRepo.updateSettings(kotlinx.serialization.json.JsonObject(values.mapValues { kotlinx.serialization.json.JsonPrimitive(it.value) }).toString())
            }
        }
        setContent {
            val settings by settingsRepo.settings.collectAsState(initial = AppSettings())
            AniCSTheme(themeId = settings.themeMode) {
                val navController = rememberNavController()
                val currentBackStackEntry by navController.currentBackStackEntryAsState()
                val currentRoute = currentBackStackEntry?.destination?.route

                val isPlayerRoute = currentRoute?.startsWith("player") == true
                var newVersion by remember { mutableStateOf<com.anics.nativeapp.updates.NativeUpdate?>(null) }
                LaunchedEffect(Unit) {
                    try { newVersion = com.anics.nativeapp.updates.UpdateRepository(applicationContext).check() }
                    catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { }
                }
                newVersion?.let { update ->
                    AlertDialog(onDismissRequest = { newVersion = null }, title = { Text("Actualización disponible") },
                        text = { Text("AniCS " + update.version + " está disponible en GitHub.") },
                        confirmButton = { TextButton(onClick = { newVersion = null; navController.navigate(Screen.Settings.route) }) { Text("Ver en Ajustes") } },
                        dismissButton = { TextButton(onClick = { newVersion = null }) { Text("Más tarde") } })
                }
                var playbackSession by remember { mutableStateOf<com.anics.nativeapp.data.local.HistoryEntity?>(null) }

                Scaffold(
                    bottomBar = {
                        if (!isPlayerRoute) {
                            val items = listOf(
                                Screen.Home,
                                Screen.Search,
                                Screen.Favorites,
                                Screen.Downloads,
                                Screen.Settings
                            )
                            NavigationBar(
                                containerColor = MaterialTheme.colorScheme.surface,
                                contentColor = MaterialTheme.colorScheme.onSurface
                            ) {
                                items.forEach { screen ->
                                    val isSelected = currentRoute == screen.route
                                    NavigationBarItem(
                                        icon = {
                                            Icon(
                                                imageVector = screen.icon,
                                                contentDescription = screen.title
                                            )
                                        },
                                        label = { Text(screen.title) },
                                        selected = isSelected,
                                        onClick = {
                                            if (currentRoute != screen.route) {
                                                navController.navigate(screen.route) {
                                                    popUpTo(navController.graph.findStartDestination().id) {
                                                        saveState = true
                                                    }
                                                    launchSingleTop = true
                                                    restoreState = true
                                                }
                                            }
                                        },
                                        colors = NavigationBarItemDefaults.colors(
                                            selectedIconColor = MaterialTheme.colorScheme.primary,
                                            selectedTextColor = MaterialTheme.colorScheme.primary,
                                            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                            indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                                        )
                                    )
                                }
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                ) { innerPadding ->
                    NavHost(
                        navController = navController,
                        startDestination = Screen.Home.route,
                        modifier = if (isPlayerRoute) Modifier else Modifier.padding(innerPadding).consumeWindowInsets(innerPadding)
                    ) {
                        composable(Screen.Home.route) {
                            val homeVm = viewModel { HomeViewModel(catalogRepo, settingsRepo, historyRepo, profileRepo) }
                            HomeScreen(
                                viewModel = homeVm,
                                onAnimeClick = { url, source ->
                                    val encodedUrl = URLEncoder.encode(url, StandardCharsets.UTF_8.toString())
                                    navController.navigate("details/$encodedUrl/$source")
                                },
                                onSearchClick = {
                                    navController.navigate(Screen.Search.route)
                                }
                            )
                        }

                        composable(Screen.Search.route) {
                            val searchVm = viewModel { SearchViewModel(catalogRepo) }
                            SearchScreen(
                                viewModel = searchVm,
                                onAnimeClick = { url, source ->
                                    val encodedUrl = URLEncoder.encode(url, StandardCharsets.UTF_8.toString())
                                    navController.navigate("details/$encodedUrl/$source")
                                }
                            )
                        }

                        composable(Screen.Favorites.route) {
                            val favVm = viewModel { FavoritesViewModel(favoriteRepo, profileRepo) }
                            FavoritesScreen(
                                viewModel = favVm,
                                onAnimeClick = { url, source ->
                                    val encodedUrl = URLEncoder.encode(url, StandardCharsets.UTF_8.toString())
                                    navController.navigate("details/$encodedUrl/$source")
                                }
                            )
                        }

                        composable(Screen.Downloads.route) {
                            val downVm = viewModel { DownloadsViewModel(database.downloadDao(), com.anics.nativeapp.downloads.LocalLibrary(applicationContext, database.downloadDao()), settingsRepo, applicationContext) }
                            DownloadsScreen(
                                viewModel = downVm,
                                onPlayOffline = { filePath, title, ep ->
                                    lifecycleScope.launch {
                                        try {
                                            val profile = profileRepo.getActiveProfile()
                                            val previous = historyRepo.getHistoryItem(profile.id, filePath) ?: historyRepo.getEpisodeProgress(profile.id, title, ep)
                                            val length = if (filePath.startsWith("content://")) androidx.documentfile.provider.DocumentFile.fromSingleUri(applicationContext, android.net.Uri.parse(filePath))?.length() ?: 0L else java.io.File(filePath).length()
                                            playerController.prepareStream(localMediaServer.videoUrl(filePath, length), false,
                                                resumeFraction = previous?.watchProgress ?: previous?.let { if (it.durationSeconds > 0) it.progressSeconds.toDouble() / it.durationSeconds else null })
                                            playbackSession = com.anics.nativeapp.data.local.HistoryEntity(profileId = profile.id, animeTitle = title, animeUrl = "local://" + title, episodeNumber = ep, episodeUrl = filePath, source = "local")
                                            val encodedTitle = URLEncoder.encode(title, StandardCharsets.UTF_8.toString())
                                            navController.navigate("player/$encodedTitle/$ep")
                                        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
                                          catch (e: Exception) { downVm.showMessage(e.localizedMessage ?: "No se pudo reproducir el archivo") }
                                    }
                                }
                            )
                        }

                        composable(Screen.Settings.route) {
                            val setVm = viewModel { SettingsViewModel(settingsRepo, profileRepo, catalogRepo, com.anics.nativeapp.sync.BackupManager(database, settingsRepo)) }
                            SettingsScreen(viewModel = setVm)
                        }

                        composable(
                            route = "details/{url}/{source}",
                            arguments = listOf(
                                navArgument("url") { type = NavType.StringType },
                                navArgument("source") { type = NavType.StringType }
                            )
                        ) { backStackEntry ->
                            val rawUrl = backStackEntry.arguments?.getString("url") ?: ""
                            val decodedUrl = URLDecoder.decode(rawUrl, StandardCharsets.UTF_8.toString())
                            val source = backStackEntry.arguments?.getString("source") ?: "jkanime"

                            val detailsVm: DetailsViewModel = viewModel(key = decodedUrl + source) { DetailsViewModel(catalogRepo, favoriteRepo, historyRepo, profileRepo) }

                            DetailsScreen(
                                url = decodedUrl,
                                source = source,
                                viewModel = detailsVm,
                                onBack = { navController.popBackStack() },
                                onDownloadEpisode = { media, animeTitle, episodeNumber ->
                                    val service = com.anics.nativeapp.downloads.DownloadService
                                    val intent = android.content.Intent(this@MainActivity, com.anics.nativeapp.downloads.DownloadService::class.java)
                                        .setAction(service.ACTION_START).putExtra(service.EXTRA_ID, java.util.UUID.randomUUID().toString())
                                        .putExtra(service.EXTRA_TITLE, animeTitle).putExtra(service.EXTRA_EPISODE, episodeNumber)
                                        .putExtra(service.EXTRA_URL, media.directUrl).putExtra(service.EXTRA_REFERER, media.referer)
                                    androidx.core.content.ContextCompat.startForegroundService(this@MainActivity, intent)
                                    navController.navigate(Screen.Downloads.route)
                                },
                                onPlayEpisode = { media, animeTitle, episodeNumber ->
                                    val detailsState = detailsVm.uiState.value
                                    lifecycleScope.launch {
                                        val profile = profileRepo.getActiveProfile()
                                        playbackSession = com.anics.nativeapp.data.local.HistoryEntity(profileId = profile.id, animeTitle = animeTitle, animeUrl = decodedUrl,
                                            episodeNumber = episodeNumber, episodeUrl = detailsState.selectedEpisode?.url ?: "", thumbnailUrl = detailsState.details?.thumbnailUrl ?: "", source = source)
                                    }
                                    val isHls = media.mediaType == com.anics.nativeapp.ffi.NativeMediaType.HLS
                                    playerController.prepareStream(
                                        directUrl = media.qualities.firstOrNull { it.label == settings.defaultQuality }?.url ?: media.directUrl,
                                        isHls = isHls,
                                        referer = media.referer,
                                        userAgent = media.userAgent,
                                        resumeFraction = detailsState.selectedEpisode?.watchProgress
                                    )
                                    val encodedTitle = URLEncoder.encode(animeTitle, StandardCharsets.UTF_8.toString())
                                    navController.navigate("player/$encodedTitle/$episodeNumber")
                                }
                            )
                        }

                        composable(
                            route = "player/{title}/{episode}",
                            arguments = listOf(
                                navArgument("title") { type = NavType.StringType },
                                navArgument("episode") { type = NavType.IntType }
                            )
                        ) { backStackEntry ->
                            val rawTitle = backStackEntry.arguments?.getString("title") ?: ""
                            val decodedTitle = URLDecoder.decode(rawTitle, StandardCharsets.UTF_8.toString())
                            val episodeNum = backStackEntry.arguments?.getInt("episode") ?: 1

                            PlayerScreen(
                                title = decodedTitle,
                                episodeText = "Episodio " + (playbackSession?.episodeNumber ?: episodeNum),
                                controller = playerController,
                                onEnded = {
                                    val session = playbackSession
                                    if (settings.autoPlayNext && session != null && session.source != "local") lifecycleScope.launch {
                                        try {
                                            val (position, duration) = playerController.updatePosition()
                                            historyRepo.recordProgress(session.profileId, session.animeTitle, session.animeUrl, session.episodeNumber, session.episodeUrl,
                                                session.thumbnailUrl, session.source, position / 1000, duration / 1000)
                                            val details = catalogRepo.getDetails(session.animeUrl, session.source)
                                            val next = details.episodes.filter { it.number.toInt() > session.episodeNumber }.minByOrNull { it.number } ?: return@launch
                                            val servers = catalogRepo.getServers(next.url, session.source)
                                            val preferred = servers.filter { it.name.equals(settings.preferredServer, ignoreCase = true) }
                                            val candidates = if (settings.allowFallback || settings.preferredServer.isBlank()) preferred + servers.filter { it !in preferred } else preferred
                                            var resolved: NativeResolvedMedia? = null
                                            for (server in candidates) try { resolved = catalogRepo.resolveStream(server, session.source); break }
                                                catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { }
                                            val media = resolved ?: error("No hay un servidor disponible para el siguiente episodio")
                                            playerController.prepareStream(media.qualities.firstOrNull { it.label == settings.defaultQuality }?.url ?: media.directUrl,
                                                media.mediaType == com.anics.nativeapp.ffi.NativeMediaType.HLS, media.referer, media.userAgent)
                                            playbackSession = session.copy(episodeNumber = next.number.toInt(), episodeUrl = next.url)
                                        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
                                          catch (e: Exception) { playerController.reportError(e.localizedMessage ?: "No se pudo cargar el siguiente episodio") }
                                    }
                                },
                                onProgress = { position, duration ->
                                    playbackSession?.let { session -> lifecycleScope.launch {
                                        historyRepo.recordProgress(session.profileId, session.animeTitle, session.animeUrl, session.episodeNumber, session.episodeUrl,
                                            session.thumbnailUrl, session.source, position / 1000, duration / 1000)
                                    } }
                                },
                                onBack = {
                                    navController.popBackStack()
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        playerController.release()
        localMediaServer.close()
    }
}
