package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anics.nativeapp.ui.viewmodels.SettingsViewModel

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    var showNewProfileDialog by remember { mutableStateOf(false) }
    var newProfileName by remember { mutableStateOf("") }
    val context = LocalContext.current
    val cloudScope = rememberCoroutineScope()
    var cloudPin by remember { mutableStateOf("") }
    var cloudBusy by remember { mutableStateOf(false) }
    val cloudClient = remember {
        if (com.anics.nativeapp.BuildConfig.ENABLE_FIREBASE_AUTH)
            com.anics.nativeapp.sync.CloudSyncClient(context as android.app.Activity,
                com.anics.nativeapp.sync.SyncRepository(com.anics.nativeapp.data.local.AppDatabase.getInstance(context), com.anics.nativeapp.data.repository.SettingsRepository(context.applicationContext)))
        else null
    }
    val updater = remember { com.anics.nativeapp.updates.UpdateRepository(context.applicationContext) }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { viewModel.importBackup(context, it) } }
    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> uri?.let { viewModel.exportBackup(context, it) } }
    val folderPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) try {
            try { context.contentResolver.takePersistableUriPermission(uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION) } catch (_: SecurityException) { context.contentResolver.takePersistableUriPermission(uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            viewModel.selectDownloadFolder(uri.toString())
        } catch (e: Exception) { viewModel.showMessage(e.localizedMessage ?: "No se pudo abrir la carpeta") }
    }
    var editingSource by remember { mutableStateOf<String?>(null) }
    var sourceUrl by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Ajustes",
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
        modifier = modifier
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                if (uiState.isExporting) LinearProgressIndicator(Modifier.fillMaxWidth())
                uiState.message?.let { Text(it, modifier = Modifier.padding(vertical = 8.dp)) }
            }
            item {
                Text("Apariencia", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    com.anics.nativeapp.ui.theme.nativeThemes.forEach { theme ->
                        FilterChip(selected = uiState.settings.themeMode == theme.id, onClick = { viewModel.selectTheme(theme.id) }, label = { Text(theme.name) })
                    }
                }
            }
            item {
                Text("Datos y sincronización", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                Text(if (cloudClient == null) "Las cuentas cloud están desactivadas. Puedes transferir perfiles, favoritos, historial y ajustes con un respaldo JSON de Tauri." else "Google y Firestore opcionales. Los datos locales funcionan sin cuenta.", style = MaterialTheme.typography.bodySmall)
                if (cloudClient != null) {
                    OutlinedTextField(value = cloudPin, onValueChange = { cloudPin = it }, label = { Text("PIN del respaldo cifrado (opcional)") },
                        visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(), singleLine = true)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(enabled = !cloudBusy, onClick = { cloudScope.launch {
                            cloudBusy = true
                            try { cloudClient.signInWithGoogle(); viewModel.showMessage("Sesión de Google iniciada") }
                            catch (e: kotlinx.coroutines.CancellationException) { throw e }
                            catch (e: Exception) { viewModel.showMessage(e.localizedMessage ?: "No se pudo iniciar sesión") }
                            finally { cloudBusy = false }
                        } }) { Text("Google") }
                        OutlinedButton(enabled = !cloudBusy, onClick = { cloudScope.launch {
                            cloudBusy = true
                            try { cloudClient.synchronize(cloudPin.takeIf { it.isNotBlank() }); viewModel.showMessage("Datos sincronizados") }
                            catch (e: kotlinx.coroutines.CancellationException) { throw e }
                            catch (e: Exception) { viewModel.showMessage(e.localizedMessage ?: "No se pudo sincronizar") }
                            finally { cloudBusy = false; cloudPin = "" }
                        } }) { Text("Sincronizar") }
                        TextButton(enabled = !cloudBusy, onClick = { cloudClient.signOut(); cloudPin = ""; viewModel.showMessage("Sesión cerrada") }) { Text("Salir") }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { importLauncher.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) }, enabled = !uiState.isExporting) { Text("Importar") }
                    OutlinedButton(onClick = { exportLauncher.launch("AniCS-respaldo.json") }, enabled = !uiState.isExporting) { Text("Exportar") }
                }
            }
            item {
                Text("Actualizaciones", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                OutlinedButton(onClick = { viewModel.checkUpdates(updater) }, enabled = !uiState.isExporting) { Text("Buscar actualizaciones en GitHub") }
                uiState.update?.let { update ->
                    Text(update.version, fontWeight = FontWeight.Bold)
                    Text(update.notes, style = MaterialTheme.typography.bodySmall)
                    if (update.apkUrl == null) Text("El APK nativo aún no está disponible. Vuelve a comprobar más tarde.")
                    else if (uiState.updateApk == null) Button(onClick = { viewModel.downloadUpdate(updater) }, enabled = !uiState.isExporting) { Text("Descargar APK nativo") }
                    else Button(onClick = {
                        try { context.startActivity(updater.installIntent(uiState.updateApk!!)) }
                        catch (e: Exception) { viewModel.showMessage(e.localizedMessage ?: "No se pudo abrir el instalador") }
                    }) { Text("Instalar actualización") }
                }
            }
            // Profile Section
            item {
                Text(
                    text = "Perfiles Locales",
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Perfil activo: ${uiState.activeProfile?.name ?: "Principal"}",
                                color = MaterialTheme.colorScheme.onSurface,
                                fontWeight = FontWeight.Medium,
                                fontSize = 14.sp
                            )
                            TextButton(onClick = { showNewProfileDialog = true }) {
                                Text("+ Crear", color = MaterialTheme.colorScheme.primary)
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                        ) {
                            uiState.profiles.forEach { profile ->
                                val isSelected = profile.id == uiState.activeProfile?.id
                                FilterChip(
                                    selected = isSelected,
                                    onClick = { viewModel.switchProfile(profile.id) },
                                    label = { Text(profile.name) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = MaterialTheme.colorScheme.primary,
                                        selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                                        labelColor = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                )
                            }
                        }
                    }
                }
            }

            // Catalog / Source Defaults
            item {
                Text(
                    text = "Catálogo y Fuentes",
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Fuente predeterminada",
                            color = MaterialTheme.colorScheme.onSurface,
                            fontWeight = FontWeight.Medium,
                            fontSize = 14.sp
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                        ) {
                            uiState.availableSources.forEach { source ->
                                val isSelected = source.id == uiState.settings.defaultSource
                                FilterChip(
                                    selected = isSelected,
                                    onClick = { viewModel.selectDefaultSource(source.id) },
                                    label = { Text(source.name) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = MaterialTheme.colorScheme.primary,
                                        selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                                        labelColor = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                )
                            }
                        }
                    }
                }
            }

            item {
                uiState.availableSources.forEach { source ->
                    TextButton(onClick = { editingSource = source.id + "_base_url"; sourceUrl = source.baseUrl }) { Text("Editar URL de " + source.name) }
                }
            }
            // Playback Options
            item {
                Text(
                    text = "Reproducción de Vídeo",
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Auto-reproducir siguiente episodio",
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Medium
                                )
                                Text(
                                    text = "Iniciar el próximo capítulo al terminar",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 12.sp
                                )
                            }
                            Switch(
                                checked = uiState.settings.autoPlayNext,
                                onCheckedChange = { viewModel.toggleAutoPlayNext(it) },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = MaterialTheme.colorScheme.onSurface,
                                    checkedTrackColor = MaterialTheme.colorScheme.primary,
                                    uncheckedThumbColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                    uncheckedTrackColor = MaterialTheme.colorScheme.surfaceVariant
                                )
                            )
                        }
                    }
                }
            }

            item {
                FilterMenu("Calidad preferida", uiState.settings.defaultQuality, listOf("auto" to "Automática", "1080p" to "1080p", "720p" to "720p", "480p" to "480p")) { viewModel.selectDefaultQuality(it ?: "auto") }
                OutlinedTextField(value = uiState.settings.preferredServer, onValueChange = viewModel::selectPreferredServer,
                    label = { Text("Servidor preferido (opcional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Usar otro servidor si falla", modifier = Modifier.weight(1f))
                    Switch(checked = uiState.settings.allowFallback, onCheckedChange = viewModel::toggleFallback)
                }
            }
            item {
                Text("Almacenamiento", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                Text("Selecciona Anime para compartir la carpeta de videos con Tauri. Después usa Buscar videos en Descargas.", style = MaterialTheme.typography.bodySmall)
                OutlinedButton(onClick = { folderPicker.launch(null) }) { Text("Elegir carpeta de descargas") }
            }
            // About / Info
            item {
                Text(
                    text = "Información",
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Versión", color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
                            Text(uiState.appVersion, color = MaterialTheme.colorScheme.secondary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Variante", color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
                            Text("Android Nativo (Kotlin + Rust)", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Package ID", color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
                            Text(com.anics.nativeapp.BuildConfig.APPLICATION_ID, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                        }
                    }
                }
            }

            item {
                Spacer(modifier = Modifier.height(24.dp))
            }
        }

        if (editingSource != null) AlertDialog(onDismissRequest = { editingSource = null }, title = { Text("URL de la fuente") },
            text = { OutlinedTextField(value = sourceUrl, onValueChange = { sourceUrl = it }, label = { Text("https://…") }, singleLine = true) },
            confirmButton = { TextButton(onClick = { viewModel.setCatalogUrl(editingSource!!, sourceUrl); editingSource = null }) { Text("Guardar") } },
            dismissButton = { TextButton(onClick = { editingSource = null }) { Text("Cancelar") } })
        // New profile dialog
        if (showNewProfileDialog) {
            AlertDialog(
                onDismissRequest = { showNewProfileDialog = false },
                title = { Text("Nuevo Perfil", color = MaterialTheme.colorScheme.onSurface) },
                text = {
                    OutlinedTextField(
                        value = newProfileName,
                        onValueChange = { newProfileName = it },
                        label = { Text("Nombre del perfil") },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = MaterialTheme.colorScheme.onSurface,
                            unfocusedTextColor = MaterialTheme.colorScheme.onSurface
                        )
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (newProfileName.isNotBlank()) {
                                viewModel.createProfile(newProfileName.trim(), "avatar-default")
                                newProfileName = ""
                                showNewProfileDialog = false
                            }
                        }
                    ) {
                        Text("Guardar")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showNewProfileDialog = false }) {
                        Text("Cancelar", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                containerColor = MaterialTheme.colorScheme.surface
            )
        }
    }
}
