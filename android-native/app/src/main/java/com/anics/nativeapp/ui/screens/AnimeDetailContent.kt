package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.anics.nativeapp.ui.components.AniIcons

/** Keep actions labelled and at least 48dp tall, including on small screens and large fonts. */
@Composable
fun AnimeDetailActions(playLabel: String, isFavorite: Boolean, onPlay: (() -> Unit)?,
    onFavorite: () -> Unit, onBatch: (() -> Unit)?, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(16.dp)
    val fontScale = LocalDensity.current.fontScale
    val play: @Composable (Modifier) -> Unit = { actionModifier ->
        Button(onClick = { onPlay?.invoke() }, enabled = onPlay != null,
            modifier = actionModifier.heightIn(min = 52.dp).clip(shape).background(
                if (onPlay != null) Brush.horizontalGradient(listOf(colors.primary, colors.secondary))
                else Brush.horizontalGradient(listOf(colors.surfaceVariant, colors.surfaceVariant))
            ), shape = shape, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = androidx.compose.ui.graphics.Color.Transparent,
                disabledContainerColor = androidx.compose.ui.graphics.Color.Transparent)) {
            Icon(AniIcons.Play, null, Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(playLabel, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
    val favorite: @Composable (Modifier) -> Unit = { actionModifier ->
        OutlinedButton(onClick = onFavorite, modifier = actionModifier.heightIn(min = 52.dp).semantics {
            contentDescription = if (isFavorite) "Quitar favorito" else "Guardar favorito"
            stateDescription = if (isFavorite) "Guardado" else "Sin guardar"
        }, shape = shape, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = if (isFavorite) colors.primary.copy(alpha = .12f) else colors.surface),
            border = BorderStroke(1.dp, if (isFavorite) colors.primary else colors.outlineVariant)) {
            Icon(if (isFavorite) AniIcons.Check else AniIcons.Heart, null, Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(if (isFavorite) "Guardado" else "Guardar")
        }
    }
    val batch: @Composable (Modifier) -> Unit = { actionModifier ->
        OutlinedButton(onClick = { onBatch?.invoke() }, enabled = onBatch != null,
            modifier = actionModifier.heightIn(min = 52.dp).semantics { contentDescription = "Descargar lote / temporada" },
            shape = shape, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = colors.secondary.copy(alpha = .08f)),
            border = BorderStroke(1.dp, colors.secondary.copy(alpha = .4f))) {
            Icon(AniIcons.Download, null, Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text("Lotes")
        }
    }
    BoxWithConstraints(modifier.fillMaxWidth()) {
        if (maxWidth >= 400.dp && fontScale <= 1.2f) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                play(Modifier.weight(1.3f))
                favorite(Modifier.weight(1f))
                batch(Modifier.weight(1f))
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                play(Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    favorite(Modifier.weight(1f))
                    batch(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
fun AnimeSynopsis(synopsis: String, modifier: Modifier = Modifier) {
    var expanded by rememberSaveable(synopsis) { mutableStateOf(false) }
    var overflows by remember(synopsis) { mutableStateOf(false) }
    Surface(modifier.fillMaxWidth().testTag("anime-synopsis"), shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("SINOPSIS", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(synopsis.ifBlank { "Sinopsis no disponible en esta fuente." },
                style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface,
                maxLines = if (expanded) Int.MAX_VALUE else 7, overflow = TextOverflow.Ellipsis,
                onTextLayout = { if (!expanded) overflows = it.hasVisualOverflow })
            if (expanded || overflows) TextButton(onClick = { expanded = !expanded }, contentPadding = PaddingValues(0.dp)) {
                Text(if (expanded) "Ver menos" else "Leer sinopsis completa")
                Spacer(Modifier.width(6.dp))
                Icon(AniIcons.ChevronDown, null, Modifier.size(16.dp))
            }
        }
    }
}
