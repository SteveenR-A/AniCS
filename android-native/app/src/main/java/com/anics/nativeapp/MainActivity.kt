package com.anics.nativeapp

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.anics.nativeapp.data.local.*
import com.anics.nativeapp.data.repository.*
import com.anics.nativeapp.ffi.*
import com.anics.nativeapp.player.*
import com.anics.nativeapp.ui.components.*
import com.anics.nativeapp.ui.screens.*
import com.anics.nativeapp.ui.theme.AniCSTheme
import com.anics.nativeapp.ui.viewmodels.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first

private data class NativeTab(val route: String, val title: String, val icon: ImageVector)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val database = AppDatabase.getInstance(applicationContext)
        val catalog = CatalogRepository()
        val history = HistoryRepository(database)
        val favorites = FavoriteRepository(database)
        val profiles = ProfileRepository(database)
        val preferences = SettingsRepository(applicationContext)
        val playback = ViewModelProvider(this, object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val engine = PlayerController(applicationContext)
                val server = com.anics.nativeapp.downloads.LocalMediaServer(applicationContext)
                return PlaybackSessionViewModel(catalog, history, engine, { path ->
                    val length = if (path.startsWith("content://")) androidx.documentfile.provider.DocumentFile.fromSingleUri(applicationContext, Uri.parse(path))?.length() ?: 0
                        else java.io.File(path).length()
                    server.videoUrl(path, length)
                }, { engine.release(); server.close() }) as T
            }
        })[PlaybackSessionViewModel::class.java]
        var sources by mutableStateOf<List<NativeSourceConfig>>(emptyList())
        lifecycleScope.launch { preferences.syncSettings.collect { values ->
            catalog.updateSettings(kotlinx.serialization.json.JsonObject(values.mapValues { kotlinx.serialization.json.JsonPrimitive(it.value) }).toString())
            sources = catalog.getAvailableSources()
        } }
        setContent {
            val settings by preferences.settings.collectAsState(initial = AppSettings())
            val session by playback.state.collectAsState()
            LaunchedEffect(settings) { playback.updateSettings(settings) }
            AniCSTheme(settings.themeMode) {
                val nav = rememberNavController()
                val backStack by nav.currentBackStackEntryAsState()
                val route = backStack?.destination?.route
                val player = route == "player"
                val snackbar = remember { SnackbarHostState() }
                val scope = rememberCoroutineScope()
                val go: (String) -> Unit = { destination ->
                    if (route != destination) nav.navigate(destination) { popUpTo("home") { saveState = true }; launchSingleTop = true; restoreState = true }
                }
                val anime: (String, String) -> Unit = { url, source -> nav.navigate("details?url=${Uri.encode(url)}&source=${Uri.encode(source)}") }
                val playRoute: () -> Unit = { if (route != "player") nav.navigate("player") { launchSingleTop = true } }
                val offline: (String, String, Int) -> Unit = { path, title, episode ->
                    lifecycleScope.launch {
                        try {
                            val profile = profiles.getActiveProfile()
                            val key = com.anics.nativeapp.sync.SyncContract.titleKey(title)
                            val rows = database.downloadDao().getAllDownloads().first().filter { it.status == "completed" && com.anics.nativeapp.sync.SyncContract.titleKey(it.animeTitle) == key }
                            val episodes = rows.distinctBy { it.episodeNumber }.sortedBy { it.episodeNumber }.map { NativeEpisode(it.episodeNumber.toUInt(), null, it.outputPath, null, false, null) }
                            playback.open(HistoryEntity(profileId = profile.id, animeTitle = title, animeUrl = "local://$title", episodeNumber = episode, episodeUrl = path, source = "local"),
                                if (episodes.isEmpty()) listOf(NativeEpisode(episode.toUInt(), null, path, null, false, null)) else episodes)
                            playRoute()
                        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
                        catch (e: Exception) { scope.launch { snackbar.showSnackbar(e.localizedMessage ?: "No se pudo abrir el video") } }
                    }
                }
                val resume: (HistoryEntity) -> Unit = { entry ->
                    if (entry.source == "local" || entry.episodeUrl.startsWith("content://") || entry.episodeUrl.startsWith('/')) offline(entry.episodeUrl, entry.animeTitle, entry.episodeNumber)
                    else { playback.open(entry, emptyList()); playRoute() }
                }
                var update by remember { mutableStateOf<com.anics.nativeapp.updates.NativeUpdate?>(null) }
                LaunchedEffect(Unit) { try { update = com.anics.nativeapp.updates.UpdateRepository(applicationContext).check() }
                    catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) {} }
                update?.let { release -> AlertDialog(onDismissRequest = { update = null }, title = { Text("Actualización disponible") }, text = { Text("AniCS ${release.version} está disponible en GitHub.") },
                    confirmButton = { TextButton(onClick = { update = null; go("settings") }) { Text("Ver en Ajustes") } }, dismissButton = { TextButton(onClick = { update = null }) { Text("Más tarde") } }) }
                Scaffold(
                    topBar = { if (!player) AniHeader(sources, settings.defaultSource,
                        onSource = { source -> scope.launch { preferences.updateDefaultSource(source) } }, onHome = { go("home") },
                        onFavorites = { go("favorites") }, onSettings = { go("settings") }, favoritesActive = route == "favorites", settingsActive = route == "settings") },
                    bottomBar = { if (!player) AniBottomBar(route, go) },
                    snackbarHost = { SnackbarHost(snackbar) }, containerColor = MaterialTheme.colorScheme.background
                ) { padding ->
                    NavHost(nav, startDestination = "home", modifier = if (player) Modifier.fillMaxSize() else Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding)) {
                        composable("home") {
                            val vm = viewModel { HomeViewModel(catalog, preferences, history, profiles) }
                            LaunchedEffect(settings.defaultSource) { vm.selectSource(settings.defaultSource) }
                            HomeScreen(vm, anime, { go("search") }, resume)
                        }
                        composable("search") {
                            val vm = viewModel { SearchViewModel(catalog, preferences) }
                            LaunchedEffect(settings.defaultSource) { vm.selectSource(settings.defaultSource) }
                            SearchScreen(vm, anime, { source -> scope.launch { preferences.updateDefaultSource(source) } })
                        }
                        composable("schedule") { val vm = viewModel { BrowseViewModel(catalog, preferences, false) }; BrowseScreen(vm, anime) }
                        composable("top") { val vm = viewModel { BrowseViewModel(catalog, preferences, true) }; BrowseScreen(vm, anime) }
                        composable("history") { val vm = viewModel { HistoryViewModel(history, profiles) }; HistoryScreen(vm, resume) }
                        composable("favorites") { val vm = viewModel { FavoritesViewModel(favorites, profiles) }; FavoritesScreen(vm, anime) }
                        composable("settings") { val vm = viewModel { SettingsViewModel(preferences, profiles, catalog, com.anics.nativeapp.sync.BackupManager(database, preferences)) }; SettingsScreen(vm) }
                        composable("downloads") {
                            val vm = viewModel { DownloadsViewModel(database.downloadDao(), com.anics.nativeapp.downloads.LocalLibrary(applicationContext, database.downloadDao()), preferences, applicationContext) }
                            DownloadsScreen(vm, offline)
                        }
                        composable("details?url={url}&source={source}", arguments = listOf(navArgument("url") { type = NavType.StringType }, navArgument("source") { type = NavType.StringType })) { entry ->
                            val url = entry.arguments?.getString("url") ?: ""
                            val source = entry.arguments?.getString("source") ?: settings.defaultSource
                            val vm: DetailsViewModel = viewModel(key = url + source) { DetailsViewModel(catalog, favorites, history, profiles) }
                            DetailsScreen(url, source, vm, onBack = { nav.popBackStack() },
                                onPlayEpisode = { media, title, episode ->
                                    lifecycleScope.launch {
                                        try {
                                            val profile = profiles.getActiveProfile()
                                            val details = vm.uiState.value
                                            playback.open(HistoryEntity(profileId = profile.id, animeTitle = title, animeUrl = url, episodeNumber = episode,
                                                episodeUrl = details.selectedEpisode?.url ?: "", thumbnailUrl = details.details?.thumbnailUrl ?: "", source = source),
                                                details.details?.episodes ?: emptyList(), details.servers, details.selectedServer, media)
                                            playRoute()
                                        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { vm.reportError(e.localizedMessage ?: "No se pudo abrir el video") }
                                    }
                                }, onDownloadEpisode = { media, title, episode ->
                                    try {
                                        val service = com.anics.nativeapp.downloads.DownloadService
                                        val intent = android.content.Intent(this@MainActivity, com.anics.nativeapp.downloads.DownloadService::class.java)
                                            .setAction(service.ACTION_START).putExtra(service.EXTRA_ID, java.util.UUID.randomUUID().toString())
                                            .putExtra(service.EXTRA_TITLE, title).putExtra(service.EXTRA_EPISODE, episode).putExtra(service.EXTRA_URL, media.directUrl).putExtra(service.EXTRA_REFERER, media.referer)
                                        androidx.core.content.ContextCompat.startForegroundService(this@MainActivity, intent)
                                        go("downloads")
                                    } catch (e: Exception) { vm.reportError(e.localizedMessage ?: "No se pudo iniciar la descarga") }
                                })
                        }
                        composable("player") {
                            if (session.entry == null) LaunchedEffect(Unit) { nav.popBackStack() }
                            else PlayerScreen(playback.engine as PlayerController, playback, onBack = { playback.close(); nav.popBackStack() }, onAutoNext = { scope.launch { preferences.updateAutoPlayNext(it) } })
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AniBottomBar(current: String?, onNavigate: (String) -> Unit) {
    val tabs = listOf(NativeTab("home", "Inicio", AniIcons.House), NativeTab("search", "Buscar", AniIcons.Search),
        NativeTab("schedule", "Horarios", AniIcons.CalendarDays), NativeTab("top", "Top", AniIcons.Flame),
        NativeTab("downloads", "Descargas", AniIcons.Download), NativeTab("history", "Historial", AniIcons.History))
    Surface(color = MaterialTheme.colorScheme.surface) {
        Column { HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(Modifier.fillMaxWidth().navigationBarsPadding().heightIn(min = 68.dp)) {
                tabs.forEach { tab -> val active = current == tab.route
                    Column(Modifier.weight(1f).semantics { selected = active }.clickable { onNavigate(tab.route) }.padding(vertical = 9.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Box(Modifier.size(32.dp).background(if (active) MaterialTheme.colorScheme.primary.copy(alpha = .15f) else androidx.compose.ui.graphics.Color.Transparent, RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
                            Icon(tab.icon, tab.title, Modifier.size(22.dp), tint = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(tab.title, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
