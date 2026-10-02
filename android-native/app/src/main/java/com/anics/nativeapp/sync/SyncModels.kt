package com.anics.nativeapp.sync

import kotlinx.serialization.json.*
import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Locale

/** Wire format shared with Tauri. JsonObject preserves optional/unknown fields. */
object SyncContract {
    val json = Json { ignoreUnknownKeys = true }
    fun text(o: JsonObject, key: String, default: String = "") = (o[key] as? JsonPrimitive)?.contentOrNull ?: default
    fun pid(o: JsonObject) = text(o, "profileId").ifBlank { "default" }
    fun time(value: String): Long = try { Instant.parse(value).toEpochMilli() } catch (_: Exception) {
        LocalDate.parse(value).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
    }
    fun iso(value: Long) = Instant.ofEpochMilli(value).toString()
    fun titleKey(title: String): String = Normalizer.normalize(title.replace('�', 'e').lowercase(Locale.ROOT), Normalizer.Form.NFD)
        .replace(Regex("[\u0300-\u036f]"), "").replace(Regex("[^a-z0-9]"), "")
    fun animeKey(h: JsonObject) = (titleKey(text(h, "animeTitle")).ifEmpty { text(h, "animeUrl").lowercase(Locale.ROOT).trim() }) + "::" + pid(h)
    fun historyKey(h: JsonObject) = animeKey(h).substringBeforeLast("::") + "::ep" + text(h, "episodeNumber") + "::" + pid(h)
    fun favoriteKey(f: JsonObject) = text(f, "url").lowercase(Locale.ROOT).trim() + "::" + pid(f)
    fun array(o: JsonObject, key: String): List<JsonObject> = (o[key] as? JsonArray)?.map { it.jsonObject } ?: emptyList()
    fun settings(o: JsonObject, key: String): JsonObject = o[key] as? JsonObject ?: JsonObject(emptyMap())
    fun isLocal(h: JsonObject): Boolean = text(h, "source") == "local" || listOf("animeUrl", "episodeUrl", "id").any { key ->
        val value = text(h, key)
        listOf("local://", "content://", "file://", "/storage/", "/data/").any(value::startsWith) || Regex("""^[a-zA-Z]:[\\/]""").containsMatchIn(value)
    }
    fun validate(raw: String): JsonObject = validate(json.parseToJsonElement(raw).jsonObject)
    fun validate(data: JsonObject): JsonObject {
        val meta = data["syncMeta"] as? JsonObject ?: JsonObject(emptyMap())
        val version = (meta["schemaVersion"] as? JsonPrimitive)?.intOrNull ?: 1
        require(version in 1..2) { "El respaldo usa un esquema no compatible. Actualiza AniCS." }
        for (name in listOf("profiles", "history", "favorites")) require(data[name] is JsonArray) { "Falta la colección $name en el respaldo" }
        array(data, "profiles").forEach {
            require(text(it, "id").isNotBlank() && text(it, "name").isNotBlank()) { "Perfil no válido" }
            time(text(it, "createdAt"))
        }
        array(data, "favorites").forEach {
            require(text(it, "url").isNotBlank() && text(it, "title").isNotBlank()) { "Favorito no válido" }
            if (text(it, "addedAt").isNotEmpty()) time(text(it, "addedAt"))
        }
        array(data, "history").forEach {
            require(text(it, "animeUrl").isNotBlank() && text(it, "episodeUrl").isNotBlank()) { "Historial no válido" }
            require((it["episodeNumber"] as? JsonPrimitive)?.intOrNull?.let { n -> n >= 0 } == true) { "Episodio no válido" }
            val progress = (it["watchProgress"] as? JsonPrimitive)?.doubleOrNull
            require(progress != null && progress.isFinite() && progress in 0.0..1.0) { "Progreso no válido" }
            time(text(it, "watchedAt"))
        }
        for (name in listOf("settings", "settingsDesktop", "settingsMobile")) {
            val value = data[name]
            require(value == null || value is JsonObject) { "Ajustes no válidos" }
            value?.jsonObject?.values?.forEach { require(it is JsonPrimitive && it.isString) { "Los ajustes deben ser strings" } }
        }
        for (name in listOf("deletedProfiles", "deletedFavorites", "deletedHistory")) {
            if (meta[name] != null) require(meta[name] is JsonArray) { "Lápidas no válidas" }
            array(meta, name).forEach { t ->
                time(text(t, "deletedAt")); require(text(t, "profileId").isNotBlank())
                if (name == "deletedFavorites") require(text(t, "url").isNotBlank())
                if (name == "deletedHistory") require(text(t, "type") in listOf("episode", "anime", "clear"))
            }
        }
        if (version == 2) return data
        val history = linkedMapOf<String, JsonObject>()
        array(data, "history").forEach { h ->
            val clean = JsonObject(h + ("animeTitle" to JsonPrimitive(text(h, "animeTitle").replace('�', 'e').trim())))
            val key = historyKey(clean); val previous = history[key]
            if (previous == null || time(text(clean, "watchedAt")) > time(text(previous, "watchedAt")) ||
                (time(text(clean, "watchedAt")) == time(text(previous, "watchedAt")) && clean["watchProgress"]!!.jsonPrimitive.double > previous["watchProgress"]!!.jsonPrimitive.double)) history[key] = clean
        }
        return JsonObject(data + mapOf("history" to JsonArray(history.values.toList()), "syncMeta" to JsonObject(meta + mapOf("schemaVersion" to JsonPrimitive(2), "deletedHistory" to (meta["deletedHistory"] ?: JsonArray(emptyList()))))))
    }
    fun merge(local: JsonObject, remoteData: JsonObject, now: Long = System.currentTimeMillis()): JsonObject {
        val remote = validate(remoteData)
        val lm = settings(local, "syncMeta"); val rm = settings(remote, "syncMeta")
        fun tombstones(name: String, key: (JsonObject) -> String): List<JsonObject> {
            val result = linkedMapOf<String, JsonObject>()
            (array(lm, name) + array(rm, name)).forEach { t ->
                if (now - time(text(t, "deletedAt")) < 30L * 24 * 60 * 60 * 1000) result[key(t)] = t
            }; return result.values.toList()
        }
        val df = tombstones("deletedFavorites") { text(it, "url").lowercase(Locale.ROOT) + "::" + pid(it) }
        val dp = tombstones("deletedProfiles") { pid(it) }
        val dh = tombstones("deletedHistory") { text(it, "type") + "::" + text(it, "key") + "::" + pid(it) }
        val deletedProfiles = dp.map { pid(it) }.toSet()
        val profiles = linkedMapOf<String, JsonObject>()
        array(local, "profiles").filter { text(it, "id") !in deletedProfiles }.forEach { profiles[text(it, "id")] = it }
        array(remote, "profiles").filter { text(it, "id") !in deletedProfiles }.forEach { profiles.putIfAbsent(text(it, "id"), JsonObject(it + ("isActive" to JsonPrimitive(false)))) }
        val favorites = linkedMapOf<String, JsonObject>()
        (array(local, "favorites") + array(remote, "favorites")).forEach { f ->
            val deleted = df.filter { favoriteKey(it) == favoriteKey(f) }.maxOfOrNull { time(text(it, "deletedAt")) }
            if (deleted == null || (text(f, "addedAt").isNotBlank() && time(text(f, "addedAt")) > deleted)) favorites.putIfAbsent(favoriteKey(f), f)
        }
        fun suppressed(h: JsonObject) = dh.any { t ->
            val matches = when(text(t, "type")) {
                "clear" -> pid(t) == pid(h); "anime" -> text(t, "key") == animeKey(h)
                else -> text(t, "key") == historyKey(h)
            }
            matches && time(text(h, "watchedAt")) <= time(text(t, "deletedAt")) + 5000
        }
        val history = linkedMapOf<String, JsonObject>()
        array(local, "history").filterNot(::suppressed).forEach { history[historyKey(it)] = it }
        array(remote, "history").filterNot(::suppressed).forEach { h ->
            val key = historyKey(h); val previous = history[key]
            if (previous == null || time(text(h, "watchedAt")) > time(text(previous, "watchedAt")) ||
                (time(text(h, "watchedAt")) == time(text(previous, "watchedAt")) && h["watchProgress"]!!.jsonPrimitive.double >= previous["watchProgress"]!!.jsonPrimitive.double)) history[key] = h
        }
        val androidLocal = text(lm, "lastModifiedDevice") == "android"
        val mobile = settings(remote, "settingsMobile") + settings(local, "settingsMobile") + (if (androidLocal) settings(local, "settings") else emptyMap())
        val desktop = settings(remote, "settingsDesktop") + settings(local, "settingsDesktop") + (if (!androidLocal) settings(local, "settings") else emptyMap())
        return buildJsonObject {
            put("syncMeta", JsonObject(rm + lm + mapOf("schemaVersion" to JsonPrimitive(2), "lastModifiedAt" to JsonPrimitive(iso(now)), "lastModifiedDevice" to JsonPrimitive("android"),
                "deletedFavorites" to JsonArray(df), "deletedProfiles" to JsonArray(dp), "deletedHistory" to JsonArray(dh),
                "devices" to JsonObject(settings(rm, "devices") + settings(lm, "devices")))))
            put("profiles", JsonArray(profiles.values.toList())); put("favorites", JsonArray(favorites.values.toList()))
            put("history", JsonArray(history.values.sortedByDescending { time(text(it, "watchedAt")) }.take(1500)))
            put("settingsMobile", JsonObject(mobile)); put("settingsDesktop", JsonObject(desktop))
            put("settings", if (mobile.isNotEmpty()) JsonObject(mobile) else settings(local, "settings"))
        }
    }
}
