# Proguard rules for AniCS Native (Preview)

# Keep UniFFI bindings and native interfaces
-keep class com.anics.nativeapp.ffi.** { *; }
-keep interface com.anics.nativeapp.ffi.** { *; }

# JNA preservation
-keep class com.sun.jna.** { *; }
-dontwarn java.awt.**

# Media3
-keep class androidx.media3.** { *; }

# Room
-keep class * extends androidx.room.RoomDatabase
