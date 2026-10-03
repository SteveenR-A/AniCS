package com.anics.nativeapp.ui.components

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anics.nativeapp.ffi.NativeSourceConfig

@Composable
fun AniPanel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier, shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}

@Composable
fun SectionTitle(title: String, subtitle: String? = null, icon: ImageVector? = null, action: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        icon?.let { Icon(it, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        action()
    }
}

@Composable
fun AniPill(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null) {
    Surface(onClick = onClick, modifier = modifier, shape = RoundedCornerShape(50),
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        contentColor = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
        border = if (selected) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.heightIn(min = 36.dp).padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            icon?.let { Icon(it, null, Modifier.size(16.dp)) }
            Text(text, style = MaterialTheme.typography.labelLarge, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium, maxLines = 1)
        }
    }
}

@Composable
fun SourceTabs(sources: List<NativeSourceConfig>, selected: String?, onSelect: (String?) -> Unit, includeAll: Boolean = false) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.surface)
        .horizontalScroll(rememberScrollState()).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        if (includeAll) AniPill("Todas", selected == null, { onSelect(null) })
        sources.forEach { source -> AniPill(sourceLabel(source.id, source.name), source.id == selected, { onSelect(source.id) }) }
    }
}

fun sourceLabel(id: String, fallback: String = id): String = when (id) { "jkanime" -> "JKAnime"; "mundodonghua" -> "Donghua"; "otakustv" -> "OtakusTV"; else -> fallback }

@Composable
fun AniEmptyState(title: String, message: String, icon: ImageVector = AniIcons.SearchX, actionLabel: String? = null, onAction: () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(icon, null, Modifier.size(44.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .5f))
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        actionLabel?.let { OutlinedButton(onClick = onAction) { Text(it) } }
    }
}

@Composable
fun AniHeader(sources: List<NativeSourceConfig>, selectedSource: String, onSource: (String) -> Unit,
    onHome: () -> Unit, onFavorites: () -> Unit, onSettings: () -> Unit, favoritesActive: Boolean, settingsActive: Boolean, showSource: Boolean = true) {
    var menu by remember { mutableStateOf(false) }
    Surface(color = MaterialTheme.colorScheme.background) {
        Column {
            Row(Modifier.fillMaxWidth().statusBarsPadding().heightIn(min = 48.dp).padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(Modifier.weight(1f).clickable(onClick = onHome), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(26.dp).clip(RoundedCornerShape(8.dp)).background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.secondary))), contentAlignment = Alignment.Center) {
                        Icon(AniIcons.Monitor, "AniCS", Modifier.size(20.dp), tint = Color.White)
                    }
                    Text("AniCS", fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (showSource) Box {
                    Surface(onClick = { menu = true }, color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(50), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                        Row(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                            Box(Modifier.size(6.dp).clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary))
                            Text(sources.firstOrNull { it.id == selectedSource }?.name ?: "Anime", style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 70.dp))
                            Icon(AniIcons.ChevronDown, "Fuente activa", Modifier.size(14.dp))
                        }
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        sources.forEach { source -> DropdownMenuItem(text = { Text(source.name) }, onClick = { onSource(source.id); menu = false },
                            leadingIcon = { if (source.id == selectedSource) Icon(AniIcons.Check, null) }) }
                    }
                }
                IconButton(onClick = onFavorites, modifier = Modifier.size(38.dp)) { Icon(AniIcons.Heart, "Favoritos", tint = if (favoritesActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                IconButton(onClick = onSettings, modifier = Modifier.size(38.dp)) { Icon(AniIcons.Settings, "Ajustes", tint = if (settingsActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
    }
}

fun formatBytes(bytes: Long): String = when {
    bytes >= 1024L * 1024 * 1024 -> String.format(java.util.Locale.getDefault(), "%.1f GB", bytes / (1024.0 * 1024 * 1024))
    bytes >= 1024L * 1024 -> String.format(java.util.Locale.getDefault(), "%.1f MB", bytes / (1024.0 * 1024))
    else -> "${bytes / 1024} KB"
}
