package com.anics.nativeapp.ui.screens

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
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

// The same bounded layout is used by the app and Compose regression tests.
data class SettingsActions(
    val theme: (String) -> Unit = {}, val source: (String) -> Unit = {},
    val autoNext: (Boolean) -> Unit = {}, val fallback: (Boolean) -> Unit = {},
    val quality: (String) -> Unit = {}, val server: (String) -> Unit = {},
    val switchProfile: (String) -> Unit = {}, val createProfile: (String) -> Unit = {},
    val sourceUrl: (String, String) -> Unit = { _, _ -> },
    val addSource: (String, String, String) -> Unit = { _, _, _ -> },
    val chooseFolder: () -> Unit = {}, val import: () -> Unit = {}, val export: () -> Unit = {},
    val checkUpdate: () -> Unit = {}, val downloadUpdate: () -> Unit = {}, val installUpdate: () -> Unit = {}
)

@Composable
fun SettingsScreen(viewModel: SettingsViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val updater = remember { com.anics.nativeapp.updates.UpdateRepository(context.applicationContext) }
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
        switchProfile = viewModel::switchProfile, createProfile = { viewModel.createProfile(it, "avatar-default") },
        sourceUrl = viewModel::setCatalogUrl, addSource = viewModel::addCatalog, chooseFolder = { folder.launch(null) },
        import = { import.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) },
        export = { export.launch("AniCS-respaldo.json") },
        checkUpdate = { viewModel.checkUpdates(updater) }, downloadUpdate = { viewModel.downloadUpdate(updater) },
        installUpdate = { try { state.updateApk?.let { context.startActivity(updater.installIntent(it)) } }
            catch (e: Exception) { viewModel.showMessage(e.localizedMessage ?: "No se pudo abrir el instalador") } }
    ), modifier) { OptionalCloudSettings(viewModel) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsContent(state: SettingsUiState, actions: SettingsActions, modifier: Modifier = Modifier, cloud: @Composable () -> Unit = {}) {
    var profilesOpen by remember { mutableStateOf(false) }
    var newProfile by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var editingSource by remember { mutableStateOf<com.anics.nativeapp.ffi.NativeSourceConfig?>(null) }
    var sourceUrl by remember { mutableStateOf("") }
    var newSource by remember { mutableStateOf(false) }
    var sourceName by remember { mutableStateOf("") }
    var sourceType by remember { mutableStateOf("Anime") }
    var server by remember(state.settings.preferredServer) { mutableStateOf(state.settings.preferredServer) }
    LazyColumn(modifier.fillMaxSize().testTag("settings-list"), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { SectionTitle("Ajustes", "Las preferencias se guardan automáticamente", AniIcons.Settings) }
        if (state.isExporting) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        state.message?.let { message -> item { AniPanel { Text(message, style = MaterialTheme.typography.bodyMedium) } } }
        item {
            AniPanel {
                SectionTitle("Perfiles y datos", icon = AniIcons.Cloud)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(46.dp).background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.secondary)), RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
                        Icon(AniIcons.Tv, null, tint = MaterialTheme.colorScheme.onPrimary)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(state.activeProfile?.name ?: "Principal", fontWeight = FontWeight.Bold)
                        Text("${state.profiles.size} perfiles locales", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                    OutlinedButton(onClick = { profilesOpen = true }) { Text("Cambiar") }
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
                                Column(Modifier.heightIn(min = 88.dp).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
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
                Text("Reanudación automática", fontWeight = FontWeight.SemiBold)
                Text("Los episodios pendientes continúan desde el último punto guardado.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("auto", "1080p", "720p", "480p").forEach { quality -> AniPill(if (quality == "auto") "Automática" else quality, state.settings.defaultQuality == quality, { actions.quality(quality) }) }
                }
                OutlinedTextField(server, { server = it }, label = { Text("Servidor preferido (opcional)") }, singleLine = true,
                    supportingText = { Text("Ejemplo: Magi, Desu o Mediafire") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                if (server != state.settings.preferredServer) OutlinedButton(onClick = { actions.server(server.trim()) }) { Icon(AniIcons.Check, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Guardar servidor") }
            }
        }
        item {
            AniPanel {
                SectionTitle("Carpeta de descargas", icon = AniIcons.Folder)
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
                            }
                            Text(source.baseUrl, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
        item {
            AniPanel {
                SectionTitle("Actualizar AniCS", icon = AniIcons.RefreshCw)
                Text("Versión ${state.appVersion}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = actions.checkUpdate, enabled = !state.isExporting) { Text("Comprobar actualizaciones") }
                state.update?.let { update ->
                    Text("Disponible: ${update.version}", fontWeight = FontWeight.SemiBold)
                    Text(update.notes.take(3000), style = MaterialTheme.typography.bodySmall)
                    if (update.apkUrl == null) Text("El APK nativo aún no está disponible.")
                    else Button(onClick = if (state.updateApk == null) actions.downloadUpdate else actions.installUpdate, enabled = !state.isExporting) {
                        Text(if (state.updateApk == null) "Descargar actualización" else "Instalar actualización")
                    }
                }
            }
        }
        item { Text("AniCS para Android · Kotlin + Rust", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 16.dp)) }
    }
    if (profilesOpen) AlertDialog(onDismissRequest = { profilesOpen = false }, title = { Text("Cambiar perfil") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            state.profiles.forEach { profile -> AniPill(profile.name, profile.id == state.activeProfile?.id, { actions.switchProfile(profile.id); profilesOpen = false }, Modifier.fillMaxWidth()) }
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
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
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
