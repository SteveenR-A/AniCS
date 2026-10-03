plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

val releaseVersion = (groovy.json.JsonSlurper().parse(rootProject.file("../package.json")) as Map<*, *>)["version"] as String
val versionParts = releaseVersion.split('.').map { it.toInt() }
val firebaseEnv = rootProject.file("../.env.local").takeIf { it.exists() }?.readLines()
    ?.filter { it.startsWith("VITE_") && it.contains('=') }
    ?.associate { it.substringBefore('=') to it.substringAfter('=').trim().trim('"', '\'') } ?: emptyMap()
fun firebaseValue(key: String) = "\"" + (System.getenv(key) ?: firebaseEnv[key] ?: "").replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "com.anics.nativeapp"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.anics.app.preview"
        minSdk = 26
        targetSdk = 34
        versionCode = versionParts[0] * 1_000_000 + versionParts[1] * 1_000 + versionParts[2]
        versionName = "$releaseVersion-preview"
        buildConfigField("boolean", "ENABLE_FIREBASE_AUTH", "false")
        buildConfigField("String", "FIREBASE_API_KEY", firebaseValue("VITE_FIREBASE_API_KEY"))
        buildConfigField("String", "FIREBASE_PROJECT_ID", firebaseValue("VITE_FIREBASE_PROJECT_ID"))
        buildConfigField("String", "FIREBASE_APP_ID", firebaseValue("VITE_FIREBASE_APP_ID"))
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", firebaseValue("VITE_GOOGLE_WEB_CLIENT_ID"))

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }

        ndk {
            abiFilters.addAll(listOf("arm64-v8a", "x86_64"))
        }
    }

    signingConfigs {
        val nativeKeystore = System.getenv("ANICS_NATIVE_KEYSTORE")
        if (!nativeKeystore.isNullOrBlank()) {
            create("nativeRelease") {
                storeFile = file(nativeKeystore)
                storePassword = System.getenv("ANICS_NATIVE_STORE_PASSWORD")
                keyAlias = System.getenv("ANICS_NATIVE_KEY_ALIAS")
                keyPassword = System.getenv("ANICS_NATIVE_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("nativeRelease")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    kotlinOptions {
        jvmTarget = "21"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions { unitTests.isIncludeAndroidResources = true }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
        jniLibs {
            useLegacyPackaging = true
        }
    }

    sourceSets {
        getByName("test") {
            resources.srcDir(rootProject.file("../docs/android-native/fixtures"))
        }
        getByName("main") {
            jniLibs.srcDirs("src/main/jniLibs")
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    // Jetpack Compose
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.navigation.compose)

    // Media3 (ExoPlayer)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.exoplayer.hls)
    implementation(libs.media3.ui)
    implementation(libs.media3.session)

    // Room Database
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    // DataStore, Coroutines & Serialization
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    // Image Loading
    implementation(libs.coil.compose)

    // UniFFI / JNA runtime (aar includes libjnidispatch.so for Android)
    implementation("net.java.dev.jna:jna:${libs.versions.jna.get()}@aar")

    // Testing
    testImplementation(libs.junit)
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("org.robolectric:robolectric:4.17")
    testImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
