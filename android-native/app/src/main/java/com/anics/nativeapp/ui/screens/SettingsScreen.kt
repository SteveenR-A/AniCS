package com.anics.nativeapp.ui.screens

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anics.nativeapp.ui.components.*
import com.anics.nativeapp.ui.theme.nativeThemes
import com.anics.nativeapp.ui.viewmodels.SettingsUiState
import com.anics.nativeapp.ui.viewmodels.SettingsViewModel
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
import com.anics.nativeapp.updates.NativeUpdate
import com.anics.nativeapp.updates.UpdateVersions
import java.io.File

// The same bounded layout is used by the app and Compose regression tests.
data class SettingsActions(
    val theme: (String) -> Unit = {}, val source: (String) -> Unit = {},
    val autoNext: (Boolean) -> Unit = {}, val fallback: (Boolean) -> Unit = {},
    val quality: (String) -> Unit = {}, val server: (String) -> Unit = {},
    val downloadServer: (String) -> Unit = {}, val downloadLimit: (Int) -> Unit = {}, val imageCache: (Int) -> Unit = {},
    val switchProfile: (String) -> Unit = {}, val createProfile: (String) -> Unit = {},
    val sourceUrl: (String, String) -> Unit = { _, _ -> },
    val addSource: (String, String, String) -> Unit = { _, _, _ -> },
    val deleteSource: (String) -> Unit = {},
    val optimizeDb: () -> Unit = {},
    val clearHistory: () -> Unit = {},
    val resetDb: () -> Unit = {},
    val chooseFolder: () -> Unit = {}, val import: () -> Unit = {}, val export: () -> Unit = {},
    val checkUpdate: () -> Unit = {}, val downloadUpdate: () -> Unit = {}, val installUpdate: () -> Unit = {}
)

@Composable
fun SettingsScreen(viewModel: SettingsViewModel, modifier: Modifier = Modifier, initialUpdate: NativeUpdate? = null,
    focusUpdates: Boolean = false, onUpdateFocused: () -> Unit = {}) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val updater = remember { com.anics.nativeapp.updates.UpdateRepository(context.applicationContext) }
    var pendingInstall by rememberSaveable { mutableStateOf<String?>(null) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        val path = pendingInstall
        pendingInstall = null
        if (path != null) try {
            if (updater.canInstall()) context.startActivity(updater.installIntent(File(path)))
            else viewModel.reportUpdateError("Activa el permiso para instalar desde AniCS y pulsa Instalar de nuevo.")
        } catch (e: Exception) { viewModel.reportUpdateError(e.localizedMessage ?: "No se pudo abrir el instalador") }
    }
    val install: (File) -> Unit = { apk ->
        try {
            val intent = updater.installIntent(apk)
            if (intent.action == android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES) {
                pendingInstall = apk.absolutePath
                permission.launch(intent)
            } else context.startActivity(intent)
        } catch (e: Exception) { viewModel.reportUpdateError(e.localizedMessage ?: "No se pudo abrir el instalador") }
    }
    LaunchedEffect(initialUpdate) { initialUpdate?.let(viewModel::receiveUpdate) }
    LaunchedEffect(state.installRequested, state.updateApk) {
        if (state.installRequested) { viewModel.consumeInstallRequest(); state.updateApk?.let(install) }
    }
    val import = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let { uri -> viewModel.importBackup(context, uri) } }
    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { it?.let { uri -> viewModel.exportBackup(context, uri) } }
    val folder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) try {
            try { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
            catch (_: SecurityException) { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            viewModel.selectDownloadFolder(uri.toString())
        } catch (e: Exception) { viewModel.showMessage(e.localizedMessage ?: "No se pudo abrir la carpeta") }
    }
    SettingsContent(state, SettingsActions(
        theme = viewModel::selectTheme, source = viewModel::selectDefaultSource,
        autoNext = viewModel::toggleAutoPlayNext, fallback = viewModel::toggleFallback,
        quality = viewModel::selectDefaultQuality, server = viewModel::selectPreferredServer,
        downloadServer = viewModel::selectDownloadServer, downloadLimit = viewModel::selectDownloadLimit, imageCache = viewModel::selectImageCache,
        switchProfile = viewModel::switchProfile, createProfile = { viewModel.createProfile(it, "avatar-default") },
        sourceUrl = viewModel::setCatalogUrl, addSource = viewModel::addCatalog,
        deleteSource = viewModel::deleteCatalog,
        optimizeDb = viewModel::optimizeDatabase,
        clearHistory = viewModel::clearHistory,
        resetDb = viewModel::resetDatabase,
        chooseFolder = { folder.launch(null) },
        import = { import.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) },
        export = { export.launch("AniCS-respaldo.json") },
        checkUpdate = { viewModel.checkUpdates(updater) }, downloadUpdate = { viewModel.downloadUpdate(updater) },
        installUpdate = { state.updateApk?.let(install) }
    ), modifier, focusUpdates, onUpdateFocused) { OptionalCloudSettings(viewModel) }
}

@Composable
fun UpdatePanel(state: SettingsUiState, actions: SettingsActions) {
    AniPanel {
        SectionTitle("Actualizar AniCS", icon = AniIcons.RefreshCw)
        Text("Versión ${state.appVersion}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        val busy = state.isCheckingUpdate || state.isDownloadingUpdate
        OutlinedButton(onClick = actions.checkUpdate, enabled = !busy) { Text("Comprobar actualizaciones") }
        if (state.isCheckingUpdate) LinearProgressIndicator(Modifier.fillMaxWidth())
        state.update?.let { update ->
            val reinstall = UpdateVersions.compare(update.version, state.appVersion) == 0
            Text("${if (reinstall) "Versión publicada" else "Disponible"}: ${update.version}", fontWeight = FontWeight.SemiBold)
            Text(update.notes.ifBlank { "Esta publicación no incluye notas." }, style = MaterialTheme.typography.bodySmall)
            if (reinstall) Text("Puedes reinstalar esta versión para recibir un parche publicado con la misma numeración.", style = MaterialTheme.typography.bodySmall)
            if (update.apkUrl == null) Text("El APK nativo aún no está disponible.")
            else Button(onClick = if (state.updateApk == null) actions.downloadUpdate else actions.installUpdate, enabled = !busy) {
                Text(when { state.isDownloadingUpdate -> "Descargando…"; state.updateApk != null -> "Instalar actualización"; reinstall -> "Descargar y reinstalar"; else -> "Descargar actualización" })
            }
        }
        if (state.isDownloadingUpdate) {
            val progress = state.updateProgress
            if (progress == null) LinearProgressIndicator(Modifier.fillMaxWidth())
            else {
                LinearProgressIndicator(progress = { progress.fraction }, modifier = Modifier.fillMaxWidth().testTag("update-progress"))
                Text(if (progress.verifying) "Verificando APK…" else "Descargando: ${(progress.fraction * 100).toInt()}% · ${formatBytes(progress.bytes)} / ${formatBytes(progress.total)}", style = MaterialTheme.typography.bodySmall)
            }
        }
        state.updateError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsContent(state: SettingsUiState, actions: SettingsActions, modifier: Modifier = Modifier,
    focusUpdates: Boolean = false, onUpdateFocused: () -> Unit = {}, cloud: @Composable () -> Unit = {}) {
    var profilesOpen by remember { mutableStateOf(false) }
    var newProfile by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var editingSource by remember { mutableStateOf<com.anics.nativeapp.ffi.NativeSourceConfig?>(null) }
    var sourceUrl by remember { mutableStateOf("") }
    var newSource by remember { mutableStateOf(false) }
    var sourceName by remember { mutableStateOf("") }
    var sourceType by remember { mutableStateOf("Anime") }
    var server by remember(state.settings.preferredServer) { mutableStateOf(state.settings.preferredServer) }
    var showClearHistoryConfirm by remember { mutableStateOf(false) }
    var showResetDbConfirm by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    LaunchedEffect(focusUpdates) {
        if (focusUpdates) {
            snapshotFlow { listState.layoutInfo.totalItemsCount }.first { it > 0 }
            listState.scrollToItem(6 + (if (state.isExporting) 1 else 0) + (if (state.message != null) 1 else 0))
            onUpdateFocused()
        }
    }
    LazyColumn(modifier.fillMaxSize().testTag("settings-list"), state = listState, contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { SectionTitle("Ajustes", "Las preferencias se guardan automáticamente", AniIcons.Settings) }
        if (state.isExporting) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        state.message?.let { message -> item { AniPanel { Text(message, style = MaterialTheme.typography.bodyMedium) } } }
        item {
            AniPanel {
                SectionTitle("Perfiles y datos", icon = AniIcons.Cloud)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(46.dp).background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.secondary)), RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
                        Icon(AniIcons.Tv, null, tint = MaterialTheme.colorScheme.onPrimary)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(state.activeProfile?.name ?: "Principal", fontWeight = FontWeight.Bold)
                        Text("${state.profiles.size} perfiles locales", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                    OutlinedButton(onClick = { profilesOpen = true }) { Text("Cambiar") }
                }
                val activeStats = state.profileStats[state.activeProfile?.id ?: "default"]
                if (activeStats != null) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(AniIcons.Tv, null, Modifier.size(13.dp), tint = MaterialTheme.colorScheme.primary)
                                Text("${activeStats.animesCount} ${if (activeStats.animesCount == 1) "anime" else "animes"}", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(AniIcons.Film, null, Modifier.size(13.dp), tint = MaterialTheme.colorScheme.secondary)
                                Text("${activeStats.episodesCount} eps", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(AniIcons.Clock, null, Modifier.size(13.dp), tint = MaterialTheme.colorScheme.tertiary)
                                Text("${activeStats.hoursWatched}h vistas", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
                Text("Transfiere tus favoritos, perfiles y progreso con un respaldo de AniCS.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = actions.import, enabled = !state.isExporting, modifier = Modifier.weight(1f)) { Text("Importar") }
                    OutlinedButton(onClick = actions.export, enabled = !state.isExporting, modifier = Modifier.weight(1f)) { Text("Exportar") }
                }
                cloud()
            }
        }
        item {
            AniPanel {
                SectionTitle("Tema visual", icon = AniIcons.Palette)
                nativeThemes.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        pair.forEach { theme ->
                            val selected = theme.id == state.settings.themeMode
                            Surface(onClick = { actions.theme(theme.id) }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp), color = theme.surface,
                                border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) theme.primary else MaterialTheme.colorScheme.outlineVariant)) {
                                Column(Modifier.heightIn(min = 68.dp).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(verticalAlignment = Alignment.Top) {
                                        Text(theme.name, color = if (theme.dark) Color(0xFFe0def4) else Color(0xFF242336), fontWeight = FontWeight.SemiBold,
                                            style = MaterialTheme.typography.labelLarge, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                        if (selected) Icon(AniIcons.Check, "Tema seleccionado", Modifier.size(16.dp), tint = theme.primary)
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                        listOf(theme.background, theme.surface, theme.primary, theme.secondary).forEach { color ->
                                            Box(Modifier.size(15.dp).background(color, RoundedCornerShape(50)).border(1.dp, Color.Gray.copy(alpha = .25f), RoundedCornerShape(50)))
                                        }
                                    }
                                }
                            }
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
        item {
            AniPanel {
                SectionTitle("Reproducción", icon = AniIcons.Play)
                SettingSwitch("Siguiente episodio automático", "Continúa cuando termina el capítulo", state.settings.autoPlayNext, actions.autoNext)
                SettingSwitch("Cambiar servidor si falla", "Prueba otra fuente al cargar un episodio", state.settings.allowFallback, actions.fallback)
                ServerPreference("Servidor de reproducción", state.settings.preferredServer, actions.server)
            }
        }
        item {
            AniPanel {
                SectionTitle("Carpeta de descargas", icon = AniIcons.Folder)
                Text("Descargas simultáneas", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { (1..4).forEach { limit -> AniPill("$limit", state.settings.maxConcurrentDownloads == limit, { actions.downloadLimit(limit) }) } }
                ServerPreference("Servidor de descarga", state.settings.preferredDownloadServer, actions.downloadServer)
                Text("Elige la carpeta Anime para guardar y detectar tus videos, incluidos los descargados con Tauri.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(if (state.settings.downloadFolderUri.isBlank()) "Carpeta de la aplicación" else android.net.Uri.parse(state.settings.downloadFolderUri).lastPathSegment?.substringAfter(':') ?: "Carpeta compartida",
                    style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                OutlinedButton(onClick = actions.chooseFolder, modifier = Modifier.fillMaxWidth()) { Icon(AniIcons.Folder, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Elegir carpeta") }
            }
        }
        item {
            AniPanel {
                SectionTitle("Fuentes y catálogos", icon = AniIcons.Globe, action = { IconButton(onClick = { sourceUrl = ""; sourceName = ""; newSource = true }) { Icon(AniIcons.Plus, "Agregar fuente") } })
                Text("Fuente predeterminada", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    state.availableSources.forEach { source -> AniPill(sourceLabel(source.id, source.name), state.settings.defaultSource == source.id, { actions.source(source.id) }) }
                }
                state.availableSources.forEach { source ->
                    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                        Column(Modifier.fillMaxWidth().padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(source.name, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                TextButton(onClick = { editingSource = source; sourceUrl = source.baseUrl }) { Text("Editar") }
                                if (source.id.startsWith("custom_")) {
                                    IconButton(onClick = { actions.deleteSource(source.id) }) {
                                        Icon(AniIcons.Trash2, "Eliminar fuente", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.error)
                                    }
                                }
                            }
                            Text(source.baseUrl, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
        item {
            AniPanel {
                SectionTitle("Base de datos SQLite", icon = AniIcons.Database)
                Text("Almacenamiento local indexado por perfil para historial y favoritos.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("Tamaño", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(state.databaseStats.sizeFormatted, fontWeight = FontWeight.SemiBold)
                    }
                    Column {
                        Text("Historial", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("${state.databaseStats.historyCount} registros", fontWeight = FontWeight.SemiBold)
                    }
                    Column {
                        Text("Favoritos", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("${state.databaseStats.favoritesCount} animes", fontWeight = FontWeight.SemiBold)
                    }
                }
                OutlinedButton(onClick = actions.optimizeDb, modifier = Modifier.fillMaxWidth()) {
                    Icon(AniIcons.RefreshCw, null, Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Optimizar y compactar (VACUUM)")
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(onClick = { showClearHistoryConfirm = true }, modifier = Modifier.weight(1f)) {
                        Icon(AniIcons.Trash2, null, Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Limpiar historial")
                    }
                    OutlinedButton(
                        onClick = { showResetDbConfirm = true },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
                    ) {
                        Icon(AniIcons.Trash2, null, Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Restablecer DB")
                    }
                }
            }
        }
        item(key = "updates") { UpdatePanel(state, actions) }
        item { AniPanel {
            SectionTitle("Caché de portadas", icon = AniIcons.HardDrive)
            Text("Solo se guardan las imágenes que abres. La caché elimina las antiguas al alcanzar su límite.", style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(100, 300, 500, 1024).forEach { mb -> AniPill(if (mb == 1024) "1 GB" else "$mb MB", state.settings.imageCacheMb == mb, { actions.imageCache(mb) }) }
            }
        } }
        item { Text("AniCS para Android · Kotlin + Rust", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 16.dp)) }
    }
    if (profilesOpen) AlertDialog(onDismissRequest = { profilesOpen = false }, title = { Text("Cambiar perfil") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            state.profiles.forEach { profile ->
                val pStats = state.profileStats[profile.id]
                val statsLabel = if (pStats != null) " · ${pStats.episodesCount} eps · ${pStats.hoursWatched}h" else ""
                AniPill("${profile.name}$statsLabel", profile.id == state.activeProfile?.id, { actions.switchProfile(profile.id); profilesOpen = false }, Modifier.fillMaxWidth())
            }
            TextButton(onClick = { profilesOpen = false; newProfile = true }) { Icon(AniIcons.Plus, null, Modifier.size(18.dp)); Text(" Crear perfil") }
        } }, confirmButton = { TextButton(onClick = { profilesOpen = false }) { Text("Cerrar") } })
    if (newProfile) AlertDialog(onDismissRequest = { newProfile = false }, title = { Text("Nuevo perfil") },
        text = { OutlinedTextField(name, { name = it }, label = { Text("Nombre") }, singleLine = true) },
        confirmButton = { TextButton(enabled = name.isNotBlank(), onClick = { actions.createProfile(name.trim()); name = ""; newProfile = false }) { Text("Crear") } },
        dismissButton = { TextButton(onClick = { newProfile = false }) { Text("Cancelar") } })
    editingSource?.let { source -> AlertDialog(onDismissRequest = { editingSource = null }, title = { Text("URL de ${source.name}") },
        text = { OutlinedTextField(sourceUrl, { sourceUrl = it }, label = { Text("https://…") }, singleLine = true) },
        confirmButton = { TextButton(onClick = { actions.sourceUrl(source.id + "_base_url", sourceUrl); editingSource = null }) { Text("Guardar") } },
        dismissButton = { TextButton(onClick = { editingSource = null }) { Text("Cancelar") } }) }
    if (showClearHistoryConfirm) AlertDialog(onDismissRequest = { showClearHistoryConfirm = false },
        title = { Text("¿Limpiar historial?") },
        text = { Text("Se eliminarán los episodios reproducidos para el perfil activo.") },
        confirmButton = { Button(onClick = { actions.clearHistory(); showClearHistoryConfirm = false }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) { Text("Limpiar") } },
        dismissButton = { TextButton(onClick = { showClearHistoryConfirm = false }) { Text("Cancelar") } })
    if (showResetDbConfirm) AlertDialog(onDismissRequest = { showResetDbConfirm = false },
        title = { Text("¿Restablecer base de datos?") },
        text = { Text("Se eliminará todo el historial y favoritos locales de todos los perfiles.") },
        confirmButton = { Button(onClick = { actions.resetDb(); showResetDbConfirm = false }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) { Text("Restablecer") } },
        dismissButton = { TextButton(onClick = { showResetDbConfirm = false }) { Text("Cancelar") } })
    if (newSource) AlertDialog(onDismissRequest = { newSource = false }, title = { Text("Agregar fuente") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(sourceName, { sourceName = it }, label = { Text("Nombre") }, singleLine = true)
            OutlinedTextField(sourceUrl, { sourceUrl = it }, label = { Text("URL HTTPS") }, singleLine = true)
            Text("Elige el formato que usa esta fuente", style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                listOf("Anime", "Donghua", "OtakusTV").forEach { type -> AniPill(type, sourceType == type, { sourceType = type }) }
            }
        }
    }, confirmButton = { TextButton(enabled = sourceName.isNotBlank() && sourceUrl.isNotBlank(), onClick = { actions.addSource(sourceName, sourceUrl, sourceType); newSource = false }) { Text("Agregar") } },
        dismissButton = { TextButton(onClick = { newSource = false }) { Text("Cancelar") } })
}

@Composable
fun SettingSwitch(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium); Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Switch(checked, onChange)
    }
}

@Composable
private fun OptionalCloudSettings(viewModel: SettingsViewModel) {
    if (!com.anics.nativeapp.BuildConfig.ENABLE_FIREBASE_AUTH) return
    val context = LocalContext.current
    val activity = remember(context) { generateSequence(context) { (it as? android.content.ContextWrapper)?.baseContext }.filterIsInstance<android.app.Activity>().firstOrNull() } ?: return
    val client = remember { com.anics.nativeapp.sync.CloudSyncClient(activity, com.anics.nativeapp.sync.SyncRepository(com.anics.nativeapp.data.local.AppDatabase.getInstance(context), com.anics.nativeapp.data.repository.SettingsRepository(context.applicationContext))) }
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }; var pin by remember { mutableStateOf("") }
    OutlinedTextField(pin, { pin = it }, label = { Text("PIN del respaldo cifrado (opcional)") }, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        OutlinedButton(enabled = !busy, onClick = { scope.launch { busy = true; try { client.signInWithGoogle(); viewModel.showMessage("Sesión iniciada") } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch(e: Exception) { viewModel.showMessage(e.localizedMessage ?: "No se pudo iniciar sesión") } finally { busy = false } } }) { Text("Google") }
        OutlinedButton(enabled = !busy, onClick = { scope.launch { busy = true; try { client.synchronize(pin.takeIf { it.isNotBlank() }); viewModel.showMessage("Datos sincronizados") } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch(e: Exception) { viewModel.showMessage(e.localizedMessage ?: "No se pudo sincronizar") } finally { busy = false; pin = "" } } }) { Text("Sincronizar") }
        TextButton(enabled = !busy, onClick = { client.signOut(); pin = "" }) { Text("Salir") }
    }
}

@Composable
fun ServerPreference(label: String, selected: String, onSelect: (String) -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Box {
            OutlinedButton(onClick = { menu = true }, modifier = Modifier.fillMaxWidth()) {
                Text(selected.ifBlank { "Automático" }, modifier = Modifier.weight(1f)); Icon(AniIcons.ChevronDown, null, Modifier.size(16.dp))
            }
            DropdownMenu(
                expanded = menu,
                onDismissRequest = { menu = false },
                shape = RoundedCornerShape(16.dp),
                containerColor = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                (listOf("", "Magi", "Desu", "Mediafire", "Vidhide", "Asura", "Uqload", "Lulustream") + listOf(selected)).distinct().forEach { name ->
                    val isSelected = selected == name
                    DropdownMenuItem(
                        text = { Text(name.ifBlank { "Automático" }, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal) },
                        trailingIcon = if (isSelected) { { Icon(AniIcons.Check, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary) } } else null,
                        onClick = { onSelect(name); menu = false }
                    )
                }
            }
        }
    }
}
