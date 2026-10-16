package com.anics.nativeapp.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.anics.nativeapp.ffi.NativeAnimeDetails
import com.anics.nativeapp.ui.components.AniIcons

private data class TechnicalFact(val label: String, val value: String, val icon: ImageVector, val tint: Color)

private fun String?.provided(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

internal fun technicalEpisodeCount(total: String?, available: Int, status: String?): String {
    val reported = total.provided()?.takeUnless { it.toIntOrNull() == 0 }
    if (reported != null) return when (reported.toIntOrNull()) {
        null -> reported
        1 -> "1 episodio"
        else -> "$reported episodios"
    }
    if (available > 0) return if (available == 1) "1 episodio" else "$available episodios"
    val normalized = status.orEmpty().trim().lowercase()
    return if (normalized == "notyet" || normalized.contains("por estrenar") ||
        normalized.contains("próxim") || normalized.contains("proxim") || normalized == "upcoming") {
        "Por estrenar"
    } else "Desconocido"
}

/** Catalogue metadata already supplied by FFI, independent of playback and downloads. */
@Composable
fun AnimeTechnicalDetails(details: NativeAnimeDetails, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val light = colors.surface.luminance() > .5f
    val blue = if (light) Color(0xFF2563EB) else Color(0xFF60A5FA)
    val pink = if (light) Color(0xFFBE185D) else Color(0xFFF472B6)
    val amber = if (light) Color(0xFF92400E) else Color(0xFFFBBF24)
    val green = if (light) Color(0xFF047857) else Color(0xFF34D399)
    val purple = if (light) Color(0xFF6D28D9) else Color(0xFFA78BFA)
    val season = details.season.provided()
    val facts = buildList {
        add(TechnicalFact("Total episodios", technicalEpisodeCount(details.totalEpisodes,
            details.episodes.distinctBy { it.url }.size, details.status), AniIcons.Layers, blue))
        details.studio.provided()?.let { add(TechnicalFact("Estudio", it, AniIcons.Tv, pink)) }
        details.duration.provided()?.let { add(TechnicalFact("Duración", it, AniIcons.Clock, amber)) }
        (season ?: details.broadcast.provided())?.let {
            add(TechnicalFact(if (season != null) "Temporada" else "Emisión", it, AniIcons.CalendarDays, green))
        }
        details.languages.provided()?.let { add(TechnicalFact("Audio", it, AniIcons.Globe, purple)) }
    }
    val minCardWidth = if (LocalDensity.current.fontScale > 1.3f) 220.dp else 150.dp
    BoxWithConstraints(modifier.fillMaxWidth().testTag("anime-technical-details")) {
        val columns = ((maxWidth + 10.dp) / (minCardWidth + 10.dp)).toInt().coerceIn(1, facts.size)
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            facts.chunked(columns).forEach { row ->
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { fact -> TechnicalDetailCard(fact, Modifier.weight(1f).fillMaxHeight()) }
                    repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun TechnicalDetailCard(fact: TechnicalFact, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    Surface(modifier.semantics(mergeDescendants = true) {}, shape = RoundedCornerShape(16.dp),
        color = colors.surface, border = BorderStroke(1.dp, colors.outlineVariant)) {
        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).background(fact.tint.copy(alpha = .14f), RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center) {
                Icon(fact.icon, null, Modifier.size(20.dp), tint = fact.tint)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(fact.label.uppercase(), style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold, color = colors.onSurfaceVariant)
                Text(fact.value, style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold, color = colors.onSurface)
            }
        }
    }
}
