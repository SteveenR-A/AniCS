package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.anics.nativeapp.ffi.NativeEpisode
import com.anics.nativeapp.ui.components.AniPill

@Composable
fun BatchDownloadDialog(episodes: List<NativeEpisode>, onDismiss: () -> Unit, onDownload: (List<NativeEpisode>) -> Unit) {
    val available = remember(episodes) { episodes.filter { it.url.isNotBlank() }.distinctBy { it.url }.sortedBy { it.number } }
    var selected by remember(available) { mutableStateOf(emptySet<String>()) }
    var range by remember { mutableStateOf(false) }
    var from by remember(available) { mutableStateOf(available.firstOrNull()?.number?.toString().orEmpty()) }
    var to by remember(available) { mutableStateOf(available.lastOrNull()?.number?.toString().orEmpty()) }
    val first = from.toUIntOrNull()
    val last = to.toUIntOrNull()
    val validRange = first != null && last != null && first <= last
    val chosen = if (range) available.filter { validRange && it.number >= first!! && it.number <= last!! }
        else available.filter { it.url in selected }

    AlertDialog(onDismissRequest = onDismiss, title = { Text("Descargar episodios") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Elige los capítulos que quieres añadir. Se usará tu servidor preferido y se omitirán los ya descargados.", style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AniPill("Individual", !range, { range = false })
                AniPill("Rango", range, { range = true })
            }
            if (range) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(from, { from = it.filter(Char::isDigit) }, label = { Text("Desde") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f).testTag("batch-from"))
                    OutlinedTextField(to, { to = it.filter(Char::isDigit) }, label = { Text("Hasta") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f).testTag("batch-to"))
                }
                if (!validRange) Text("Introduce un rango válido.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            } else {
                LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false).heightIn(max = 240.dp).testTag("batch-episodes")) {
                    items(available, key = { it.url }) { episode ->
                        val checked = episode.url in selected
                        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(checked, role = Role.Checkbox, onValueChange = { value ->
                            selected = if (value) selected + episode.url else selected - episode.url
                        }).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = checked, onCheckedChange = null)
                            Text("Episodio ${episode.number}", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("${chosen.size} seleccionados", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                TextButton(onClick = {
                    if (chosen.size == available.size && available.isNotEmpty()) { selected = emptySet(); range = false }
                    else { selected = available.map { it.url }.toSet(); range = false }
                }) { Text(if (chosen.size == available.size && available.isNotEmpty()) "Limpiar" else "Todos") }
            }
        }
    }, confirmButton = {
        TextButton(enabled = chosen.isNotEmpty(), onClick = { onDownload(chosen) }) { Text("Añadir lote") }
    }, dismissButton = { TextButton(onClick = onDismiss) { Text("Volver") } })
}
