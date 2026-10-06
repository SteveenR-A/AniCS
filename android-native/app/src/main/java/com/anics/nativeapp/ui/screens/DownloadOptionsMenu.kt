package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.anics.nativeapp.ui.components.*

@Composable
fun DownloadOptionsMenu(isScanning: Boolean, hasFolder: Boolean, onFolder: () -> Unit,
    onScan: () -> Unit, onStorage: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { expanded = true }) {
            Text("Opciones")
            Spacer(Modifier.width(4.dp))
            Icon(AniIcons.ChevronDown, null, Modifier.size(16.dp))
        }
        DropdownMenu(expanded, onDismissRequest = { expanded = false }, shape = RoundedCornerShape(16.dp),
            containerColor = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
            DropdownMenuItem(text = { Text("Carpeta") }, leadingIcon = { Icon(AniIcons.Folder, null) },
                enabled = !isScanning, onClick = { expanded = false; onFolder() })
            DropdownMenuItem(text = { Text("Buscar videos") }, leadingIcon = { Icon(AniIcons.Search, null) },
                enabled = !isScanning && hasFolder, onClick = { expanded = false; onScan() })
            DropdownMenuItem(text = { Text("Actualizar almacenamiento") }, leadingIcon = { Icon(AniIcons.RefreshCw, null) },
                onClick = { expanded = false; onStorage() })
        }
    }
}

@Composable
fun DownloadStorageSummary(total: Long, free: Long, libraryBytes: Long) {
    AniPanel {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(AniIcons.HardDrive, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Almacenamiento", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                Text("${formatBytes(free)} libres de ${formatBytes(total)}", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        LinearProgressIndicator(progress = { if (total > 0) ((total - free).toDouble() / total).toFloat().coerceIn(0f, 1f) else 0f },
            modifier = Modifier.fillMaxWidth().height(4.dp), drawStopIndicator = {})
        Text("Videos de AniCS: ${formatBytes(libraryBytes)}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall)
    }
}
