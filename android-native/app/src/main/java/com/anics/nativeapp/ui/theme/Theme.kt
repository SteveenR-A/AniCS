package com.anics.nativeapp.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

data class NativeTheme(val id: String, val name: String, val primary: Color, val secondary: Color, val surface: Color, val background: Color, val dark: Boolean)
val nativeThemes = listOf(
    NativeTheme("dark", "Dark (Por Defecto)", Color(0xFF6366f1), Color(0xFFec4899), Color(0xFF111318), Color(0xFF0a0b0f), true),
    NativeTheme("gruvbox", "Gruvbox Dark", Color(0xFFd79921), Color(0xFFcc241d), Color(0xFF282828), Color(0xFF1d2021), true),
    NativeTheme("rosepine", "Rosé Pine", Color(0xFFebbcba), Color(0xFFc4a7e7), Color(0xFF1f1d2e), Color(0xFF191724), true),
    NativeTheme("everforest", "Everforest", Color(0xFFa7c080), Color(0xFFe69875), Color(0xFF2d353b), Color(0xFF232a2e), true),
    NativeTheme("oxocarbon", "Oxocarbon", Color(0xFF78a9ff), Color(0xFFee5396), Color(0xFF262626), Color(0xFF161616), true),
    NativeTheme("kanagawa", "Kanagawa", Color(0xFF7e9cd8), Color(0xFFe46876), Color(0xFF2a2a37), Color(0xFF1f1f28), true),
    NativeTheme("mellow", "Mellow", Color(0xFFcaa6df), Color(0xFFa9b665), Color(0xFF1b1b23), Color(0xFF16161d), true),
    NativeTheme("catppuccin", "Catppuccin Mocha", Color(0xFFcba6f7), Color(0xFFf5c2e7), Color(0xFF1e1e2e), Color(0xFF181825), true),
    NativeTheme("dracula", "Dracula", Color(0xFFbd93f9), Color(0xFFff79c6), Color(0xFF282a36), Color(0xFF21222c), true),
    NativeTheme("tokyonight", "Tokyo Night", Color(0xFF7aa2f7), Color(0xFFbb9af7), Color(0xFF1a1b26), Color(0xFF16161e), true),
    NativeTheme("cyberpunk", "Cyberpunk 2077", Color(0xFFfee715), Color(0xFF00f0ff), Color(0xFF0f1017), Color(0xFF08080c), true),
    NativeTheme("nord", "Nord (Ártico)", Color(0xFF88c0d0), Color(0xFF81a1c1), Color(0xFF2e3440), Color(0xFF242933), true),
    NativeTheme("light", "Claro (Light Modern)", Color(0xFF4f46e5), Color(0xFFdb2777), Color(0xFFffffff), Color(0xFFf1f5f9), false)
)

@Composable
fun AniCSTheme(themeId: String = "dark", content: @Composable () -> Unit) {
    val systemDark = isSystemInDarkTheme()
    val theme = nativeThemes.firstOrNull { it.id == themeId } ?: nativeThemes.first()
    val dark = if (themeId == "system") systemDark else theme.dark
    val scheme = if (dark) darkColorScheme(primary = theme.primary, secondary = theme.secondary,
        background = theme.background, surface = theme.surface, surfaceVariant = theme.surface)
    else lightColorScheme(primary = theme.primary, secondary = theme.secondary,
        background = theme.background, surface = theme.surface, surfaceVariant = theme.surface)
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !dark
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = !dark
        }
    }
    MaterialTheme(colorScheme = scheme, content = content)
}
