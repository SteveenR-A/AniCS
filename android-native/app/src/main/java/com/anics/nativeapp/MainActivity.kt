package com.anics.nativeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import com.anics.nativeapp.ui.theme.DarkSurface
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val database = AppDatabase.getInstance(applicationContext)
        val catalogRepo = CatalogRepository()
        val historyRepo = HistoryRepository(database.historyDao())
        val favoriteRepo = FavoriteRepository(database.favoriteDao())
        val profileRepo = ProfileRepository(database.profileDao())
        val settingsRepo = SettingsRepository(applicationContext)

        playerController = PlayerController(applicationContext)

        setContent {
            AniCSTheme {
                val navController = rememberNavController()
                val currentBackStackEntry by navController.currentBackStackEntryAsState()
                val currentRoute = currentBackStackEntry?.destination?.route

                val isPlayerRoute = currentRoute?.startsWith("player") == true

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
                                containerColor = DarkSurface,
                                contentColor = Color.White
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
                                            unselectedIconColor = Color.LightGray,
                                            unselectedTextColor = Color.LightGray,
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
                        modifier = Modifier.padding(if (isPlayerRoute) androidx.compose.foundation.layout.PaddingValues() else innerPadding)
                    ) {
                        composable(Screen.Home.route) {
                            val homeVm = remember { HomeViewModel(catalogRepo, settingsRepo) }
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
                            val searchVm = remember { SearchViewModel(catalogRepo) }
                            SearchScreen(
                                viewModel = searchVm,
                                onAnimeClick = { url, source ->
                                    val encodedUrl = URLEncoder.encode(url, StandardCharsets.UTF_8.toString())
                                    navController.navigate("details/$encodedUrl/$source")
                                }
                            )
                        }

                        composable(Screen.Favorites.route) {
                            val favVm = remember { FavoritesViewModel(favoriteRepo, profileRepo) }
                            FavoritesScreen(
                                viewModel = favVm,
                                onAnimeClick = { url, source ->
                                    val encodedUrl = URLEncoder.encode(url, StandardCharsets.UTF_8.toString())
                                    navController.navigate("details/$encodedUrl/$source")
                                }
                            )
                        }

                        composable(Screen.Downloads.route) {
                            val downVm = remember { DownloadsViewModel(database.downloadDao()) }
                            DownloadsScreen(
                                viewModel = downVm,
                                onPlayOffline = { filePath, title, ep ->
                                    playerController.prepareStream(
                                        directUrl = filePath,
                                        isHls = false
                                    )
                                    val encodedTitle = URLEncoder.encode(title, StandardCharsets.UTF_8.toString())
                                    navController.navigate("player/$encodedTitle/$ep")
                                }
                            )
                        }

                        composable(Screen.Settings.route) {
                            val setVm = remember { SettingsViewModel(settingsRepo, profileRepo, catalogRepo) }
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

                            val detailsVm = remember {
                                DetailsViewModel(catalogRepo, favoriteRepo, historyRepo, profileRepo)
                            }

                            DetailsScreen(
                                url = decodedUrl,
                                source = source,
                                viewModel = detailsVm,
                                onBack = { navController.popBackStack() },
                                onPlayEpisode = { media, animeTitle, episodeNumber ->
                                    val isHls = media.media_type == com.anics.nativeapp.ffi.NativeMediaType.Hls
                                    playerController.prepareStream(
                                        directUrl = media.direct_url,
                                        isHls = isHls,
                                        referer = media.referer,
                                        userAgent = media.user_agent
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
                                episodeText = "Episodio $episodeNum",
                                controller = playerController,
                                onBack = {
                                    playerController.resetPlayback()
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
    }
}
