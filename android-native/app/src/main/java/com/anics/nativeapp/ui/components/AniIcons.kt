// Generated from Lucide SVGs by scripts/android-native/generate-icons.cjs.
// Lucide ISC license: docs/android-native/lucide-LICENSE.
package com.anics.nativeapp.ui.components

import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.vector.*
import androidx.compose.ui.unit.dp

object AniIcons {
    private fun icon(name: String, vararg paths: String) = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
        paths.forEach { addPath(PathParser().parsePathString(it).toNodes(), fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) }
    }.build()
    private fun filledIcon(name: String, path: String) = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
        addPath(PathParser().parsePathString(path).toNodes(), fill = SolidColor(Color.Black), stroke = SolidColor(Color.Black), strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round)
    }.build()
    val House by lazy { icon("House", "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8", "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z") }
    val Search by lazy { icon("Search", "m21 21-4.34-4.34", "M19 11a8 8 0 1 0 -16 0a8 8 0 1 0 16 0") }
    val CalendarDays by lazy { icon("CalendarDays", "M8 2v3", "M16 2v3", "M5 3H19Q21 3 21 5V19Q21 21 19 21H5Q3 21 3 19V5Q3 3 5 3Z", "M3 9h18", "M8 13h.01", "M12 13h.01", "M16 13h.01", "M8 17h.01", "M12 17h.01", "M16 17h.01") }
    val Flame by lazy { icon("Flame", "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4") }
    val Download by lazy { icon("Download", "M12 15V3", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5") }
    val History by lazy { icon("History", "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2") }
    val Heart by lazy { icon("Heart", "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5") }
    val Settings by lazy { icon("Settings", "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915", "M15 12a3 3 0 1 0 -6 0a3 3 0 1 0 6 0") }
    val Tv by lazy { icon("Tv", "m17 2-5 5-5-5", "M4 7H20Q22 7 22 9V20Q22 22 20 22H4Q2 22 2 20V9Q2 7 4 7Z") }
    val ChevronDown by lazy { icon("ChevronDown", "m6 9 6 6 6-6") }
    val ChevronLeft by lazy { icon("ChevronLeft", "m15 18-6-6 6-6") }
    val ChevronRight by lazy { icon("ChevronRight", "m9 18 6-6-6-6") }
    val ArrowLeft by lazy { icon("ArrowLeft", "m12 19-7-7 7-7", "M19 12H5") }
    val RefreshCw by lazy { icon("RefreshCw", "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5") }
    val SlidersHorizontal by lazy { icon("SlidersHorizontal", "M10 5H3", "M12 19H3", "M14 3v4", "M16 17v4", "M21 12h-9", "M21 19h-5", "M21 5h-7", "M8 10v4", "M8 12H3") }
    val X by lazy { icon("X", "M18 6 6 18", "m6 6 12 12") }
    val Check by lazy { icon("Check", "M20 6 9 17l-5-5") }
    val Play by lazy { icon("Play", "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z") }
    val Pause by lazy { icon("Pause", "M15 3H18Q19 3 19 4V20Q19 21 18 21H15Q14 21 14 20V4Q14 3 15 3Z", "M6 3H9Q10 3 10 4V20Q10 21 9 21H6Q5 21 5 20V4Q5 3 6 3Z") }
    val SkipBack by lazy { icon("SkipBack", "M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z", "M3 20V4") }
    val SkipForward by lazy { icon("SkipForward", "M21 4v16", "M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z") }
    val RotateCcw by lazy { icon("RotateCcw", "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5") }
    val RotateCw by lazy { icon("RotateCw", "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8", "M21 3v5h-5") }
    val ListVideo by lazy { icon("ListVideo", "M21 5H3", "M10 12H3", "M10 19H3", "M15 12.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86z") }
    val Server by lazy { icon("Server", "M4 2H20Q22 2 22 4V8Q22 10 20 10H4Q2 10 2 8V4Q2 2 4 2Z", "M4 14H20Q22 14 22 16V20Q22 22 20 22H4Q2 22 2 20V16Q2 14 4 14Z", "M6 6L6.01 6", "M6 18L6.01 18") }
    val Maximize by lazy { icon("Maximize", "M8 3H5a2 2 0 0 0-2 2v3", "M21 8V5a2 2 0 0 0-2-2h-3", "M3 16v3a2 2 0 0 0 2 2h3", "M16 21h3a2 2 0 0 0 2-2v-3") }
    val Minimize by lazy { icon("Minimize", "M8 3v3a2 2 0 0 1-2 2H3", "M21 8h-3a2 2 0 0 1-2-2V3", "M3 16h3a2 2 0 0 1 2 2v3", "M16 21v-3a2 2 0 0 1 2-2h3") }
    val Smartphone by lazy { icon("Smartphone", "M7 2H17Q19 2 19 4V20Q19 22 17 22H7Q5 22 5 20V4Q5 2 7 2Z", "M12 18h.01") }
    val Monitor by lazy { icon("Monitor", "M4 3H20Q22 3 22 5V15Q22 17 20 17H4Q2 17 2 15V5Q2 3 4 3Z", "M8 21L16 21", "M12 17L12 21") }
    val Volume2 by lazy { icon("Volume2", "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z", "M16 9a5 5 0 0 1 0 6", "M19.364 18.364a9 9 0 0 0 0-12.728") }
    val VolumeX by lazy { icon("VolumeX", "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z", "M22 9L16 15", "M16 9L22 15") }
    val Lock by lazy { icon("Lock", "M5 11H19Q21 11 21 13V20Q21 22 19 22H5Q3 22 3 20V13Q3 11 5 11Z", "M7 11V7a5 5 0 0 1 10 0v4") }
    val Unlock by lazy { icon("Unlock", "M5 11H19Q21 11 21 13V20Q21 22 19 22H5Q3 22 3 20V13Q3 11 5 11Z", "M7 11V7a5 5 0 0 1 9.9-1") }
    val Folder by lazy { icon("Folder", "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z") }
    val HardDrive by lazy { icon("HardDrive", "M10 16h.01", "M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z", "M21.946 12.013H2.054", "M6 16h.01") }
    val Trash2 by lazy { icon("Trash2", "M10 11v6", "M14 11v6", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2") }
    val Palette by lazy { icon("Palette", "M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z", "M14 6.5a.5 .5 0 1 0 -1 0a.5 .5 0 1 0 1 0", "M18 10.5a.5 .5 0 1 0 -1 0a.5 .5 0 1 0 1 0", "M7 12.5a.5 .5 0 1 0 -1 0a.5 .5 0 1 0 1 0", "M9 7.5a.5 .5 0 1 0 -1 0a.5 .5 0 1 0 1 0") }
    val Cloud by lazy { icon("Cloud", "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z") }
    val Globe by lazy { icon("Globe", "M22 12a10 10 0 1 0 -20 0a10 10 0 1 0 20 0", "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", "M2 12h20") }
    val Plus by lazy { icon("Plus", "M5 12h14", "M12 5v14") }
    val Trophy by lazy { icon("Trophy", "M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2", "M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2", "M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3", "M4 22h16", "M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z", "M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3") }
    val Star by lazy { icon("Star", "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z") }
    val Clock by lazy { icon("Clock", "M22 12a10 10 0 1 0 -20 0a10 10 0 1 0 20 0", "M12 6v6l4 2") }
    val CircleAlert by lazy { icon("CircleAlert", "M22 12a10 10 0 1 0 -20 0a10 10 0 1 0 20 0", "M12 8L12 12", "M12 16L12.01 16") }
    val SearchX by lazy { icon("SearchX", "m13.5 8.5-5 5", "m8.5 8.5 5 5", "M19 11a8 8 0 1 0 -16 0a8 8 0 1 0 16 0", "m21 21-4.3-4.3") }
    val Database by lazy { icon("Database", "M21 5a9 3 0 1 0 -18 0a9 3 0 1 0 18 0", "M3 5V19A9 3 0 0 0 21 19V5", "M3 12A9 3 0 0 0 21 12") }
    val CheckCheck by lazy { icon("CheckCheck", "M18 6 7 17l-5-5", "m22 10-7.5 7.5L13 16") }
    val Film by lazy { icon("Film", "M5 3H19Q21 3 21 5V19Q21 21 19 21H5Q3 21 3 19V5Q3 3 5 3Z", "M7 3v18", "M3 7.5h4", "M3 12h18", "M3 16.5h4", "M17 3v18", "M17 7.5h4", "M17 16.5h4") }
    val Sparkles by lazy { icon("Sparkles", "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z", "M20 2v4", "M22 4h-4", "M6 20a2 2 0 1 0 -4 0a2 2 0 1 0 4 0") }
    val HeartFilled by lazy { filledIcon("HeartFilled", "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5Z") }
}
