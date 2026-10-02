package com.anics.nativeapp.sync

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
import com.anics.nativeapp.BuildConfig
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.security.MessageDigest
import com.anics.nativeapp.sync.SyncContract.array
import com.anics.nativeapp.sync.SyncContract.settings
import com.anics.nativeapp.sync.SyncContract.text

/** Optional Google/Firestore adapter. Never initialize or authenticate in local mode. */
class CloudSyncClient(private val activity: Activity, private val repository: SyncRepository) {
    private fun app(): FirebaseApp {
        check(BuildConfig.ENABLE_FIREBASE_AUTH) { "Las cuentas cloud están desactivadas en esta versión" }
        check(BuildConfig.FIREBASE_API_KEY.isNotBlank() && BuildConfig.FIREBASE_PROJECT_ID.isNotBlank() && BuildConfig.FIREBASE_APP_ID.isNotBlank()) { "Falta configurar Firebase" }
        return FirebaseApp.getApps(activity).firstOrNull { it.name == "anics-native" } ?: FirebaseApp.initializeApp(activity,
            FirebaseOptions.Builder().setApiKey(BuildConfig.FIREBASE_API_KEY).setProjectId(BuildConfig.FIREBASE_PROJECT_ID).setApplicationId(BuildConfig.FIREBASE_APP_ID).build(), "anics-native")
    }
    suspend fun signInWithGoogle() {
        val firebase = app()
        check(BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()) { "Configura el cliente OAuth web de Google antes de activar cuentas" }
        val google = GetGoogleIdOption.Builder().setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID).setFilterByAuthorizedAccounts(false).build()
        val result = CredentialManager.create(activity).getCredential(activity, GetCredentialRequest.Builder().addCredentialOption(google).build())
        val credential = result.credential
        check(credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) { "Google no devolvió una credencial válida" }
        val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
        FirebaseAuth.getInstance(firebase).signInWithCredential(GoogleAuthProvider.getCredential(token, null)).await()
    }
    fun signOut() { if (BuildConfig.ENABLE_FIREBASE_AUTH) FirebaseAuth.getInstance(app()).signOut() }
    private fun wire(value: Any?): JsonElement = when (value) {
        null -> JsonNull; is String -> JsonPrimitive(value); is Boolean -> JsonPrimitive(value); is Number -> JsonPrimitive(value)
        is Map<*, *> -> JsonObject(value.entries.associate { (key, item) -> key.toString() to wire(item) })
        is List<*> -> JsonArray(value.map(::wire))
        else -> error("Tipo de datos cloud no compatible")
    }
    suspend fun synchronize(pin: String? = null) = withContext(Dispatchers.IO) {
        val firebase = app()
        val uid = FirebaseAuth.getInstance(firebase).currentUser?.uid ?: error("Inicia sesión antes de sincronizar")
        val ref = FirebaseFirestore.getInstance(firebase).document("users/$uid/sync/data")
        // A cached/malformed read must never be treated as an empty cloud document.
        val snap = ref.get(Source.SERVER).await()
        val fields = listOf("profiles", "history", "favorites", "settings", "settingsDesktop", "settingsMobile")
        var key: ByteArray? = null
        val remote = if (snap.exists()) {
            val raw = snap.data ?: error("Documento cloud no válido")
            val rawMeta = raw["syncMeta"] ?: error("Metadatos cloud no válidos")
            val meta = (if (rawMeta is String) Json.parseToJsonElement(rawMeta) else wire(rawMeta)).jsonObject
            val salt = text(meta, "pbkdf2Salt")
            if (salt.isNotEmpty()) key = CryptoService.deriveKey(pin ?: error("Los datos están cifrados; introduce el PIN para sincronizar"), salt)
            val decoded = buildJsonObject {
                put("syncMeta", meta)
                fields.forEach { field ->
                    val fieldValue = raw[field]
                    val content = if (fieldValue is String) fieldValue else fieldValue?.let { wire(it).toString() }
                    if (content == null) {
                        require(field.startsWith("settings")) { "Falta una colección cloud: $field" }
                        put(field, JsonObject(emptyMap()))
                    } else {
                        val plain = try { Json.parseToJsonElement(content) } catch (e: Exception) {
                            Json.parseToJsonElement(CryptoService.decrypt(content, key ?: throw e))
                        }
                        put(field, plain)
                    }
                }
            }
            SyncContract.validate(decoded)
        } else null
        val payload = if (remote == null) repository.exportCurrentLocalData() else repository.mergeSyncData(remote)
        val meta = settings(payload, "syncMeta").toMutableMap()
        val now = SyncContract.iso(System.currentTimeMillis())
        val hashes = buildJsonObject { listOf("profiles", "history", "favorites", "settings").forEach { field ->
            val bytes = (payload[field] ?: JsonObject(emptyMap())).toString().toByteArray(Charsets.UTF_8)
            put(field, MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) })
        } }
        meta["fileHashes"] = hashes; meta["lastModifiedAt"] = JsonPrimitive(now); meta["lastModifiedDevice"] = JsonPrimitive("android")
        meta["devices"] = JsonObject(settings(JsonObject(meta), "devices") + ("android" to buildJsonObject { put("lastSyncAt", now); put("appVersion", BuildConfig.VERSION_NAME) }))
        val document = mutableMapOf<String, Any>("syncMeta" to JsonObject(meta).toString(), "updatedAt" to now)
        fields.forEach { field ->
            val plain = (payload[field] ?: JsonObject(emptyMap())).toString()
            document[field] = key?.let { CryptoService.encrypt(plain, it) } ?: plain
        }
        ref.set(document).await()
        key?.fill(0)
    }
}
