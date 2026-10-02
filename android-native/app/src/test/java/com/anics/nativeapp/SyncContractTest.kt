package com.anics.nativeapp

import com.anics.nativeapp.sync.SyncContract
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class SyncContractTest {
    private val fixture = Json.parseToJsonElement(javaClass.classLoader!!.getResource("sync-v1.json")!!.readText()).jsonObject
    private val now = SyncContract.time(fixture["clock"]!!.jsonPrimitive.content)
    private fun payload(collection: String, items: JsonArray, deletedName: String? = null, tombstones: JsonArray = JsonArray(emptyList())) = buildJsonObject {
        put("syncMeta", buildJsonObject { put("schemaVersion", 2); put("lastModifiedDevice", "android"); if (deletedName != null) put(deletedName, tombstones) })
        for (name in listOf("profiles", "history", "favorites")) put(name, if (name == collection) items else JsonArray(emptyList()))
        put("settings", JsonObject(emptyMap()))
    }
    @Test fun canonicalKeysMatchTauri() {
        fixture["keyCases"]!!.jsonArray.forEach { entry -> val c = entry.jsonObject; val h = c["entry"]!!.jsonObject
            assertEquals(c["normalizedTitle"]!!.jsonPrimitive.content, SyncContract.titleKey(SyncContract.text(h, "animeTitle")))
            assertEquals(c["episodeKey"]!!.jsonPrimitive.content, SyncContract.historyKey(h))
            assertEquals(c["animeKey"]!!.jsonPrimitive.content, SyncContract.animeKey(h))
        }
    }
    @Test fun migrationsAndFutureSchema() {
        fixture["migrations"]!!.jsonArray.forEach { entry -> val c = entry.jsonObject
            if (c["expected"] != null) assertEquals(c["expected"], SyncContract.validate(c["input"]!!.jsonObject))
            else assertThrows(IllegalArgumentException::class.java) { SyncContract.validate(c["input"]!!.jsonObject) }
        }
    }
    @Test fun historyMergeAndGraceBoundaryMatchTauri() { cases("historyCases", "entries", "history", "deletedHistory", "id") }
    @Test fun favoritesDoNotResurrectDeletedRows() { cases("favoriteCases", "favorites", "favorites", "deletedFavorites", "title") }
    private fun cases(caseName: String, dictionaryName: String, collection: String, deletedName: String, identity: String) {
        val dictionary = fixture[dictionaryName]!!.jsonObject
        fixture[caseName]!!.jsonArray.forEach { entry -> val c = entry.jsonObject
            fun items(key: String) = JsonArray(c[key]!!.jsonArray.map { dictionary[it.jsonPrimitive.content]!! })
            val result = SyncContract.merge(payload(collection, items("local")), payload(collection, items("remote"), deletedName, c["tombstones"]!!.jsonArray), now)
            val actual = SyncContract.array(result, collection).map { SyncContract.text(it, identity) }
            val expected = c["expected"]!!.jsonArray.map { SyncContract.text(dictionary[it.jsonPrimitive.content]!!.jsonObject, identity) }
            assertEquals(SyncContract.text(c, "name"), expected, actual)
        }
    }
    @Test fun profilesKeepIdsAndNewProfilesAreInactive() {
        val dictionary = fixture["profiles"]!!.jsonObject
        fixture["profileCases"]!!.jsonArray.forEach { entry -> val c = entry.jsonObject
            fun items(key: String) = JsonArray(c[key]!!.jsonArray.map { dictionary[it.jsonPrimitive.content]!! })
            val result = SyncContract.merge(payload("profiles", items("local")), payload("profiles", items("remote"), "deletedProfiles", c["deletedProfiles"]!!.jsonArray), now)
            assertEquals(c["expected"], result["profiles"])
        }
    }
    @Test fun androidSettingsStaySeparateFromDesktopSettings() {
        val c = fixture["mergeCases"]!!.jsonArray.map { it.jsonObject }.first { SyncContract.text(it, "platform") == "android" }
        val payloads = fixture["payloads"]!!.jsonObject
        val result = SyncContract.merge(payloads[SyncContract.text(c, "local")]!!.jsonObject, payloads[SyncContract.text(c, "remote")]!!.jsonObject, now)
        val expected = c["expected"]!!.jsonObject
        for (name in listOf("profiles", "favorites", "history", "settings", "settingsDesktop", "settingsMobile")) assertEquals(name, expected[name], result[name])
    }
    @Test fun malformedDataFailsBeforeAnImport() {
        val empty = payload("history", JsonArray(emptyList()))
        assertThrows(IllegalArgumentException::class.java) { SyncContract.validate(JsonObject(empty - "favorites")) }
        val invalid = JsonObject(empty + ("history" to JsonArray(listOf(buildJsonObject { put("animeUrl", "x"); put("episodeUrl", "x"); put("episodeNumber", 1); put("watchProgress", 1.2); put("watchedAt", "invalid") }))))
        assertThrows(IllegalArgumentException::class.java) { SyncContract.validate(invalid) }
    }
    @Test fun localFileHistoryStaysOffCloud() {
        fixture["localHistoryCases"]!!.jsonArray.forEach { entry -> val c = entry.jsonObject
            assertEquals(c["expected"]!!.jsonPrimitive.boolean, SyncContract.isLocal(c["entry"]!!.jsonObject))
        }
        assertTrue(SyncContract.isLocal(buildJsonObject { put("episodeUrl", "content://media/video/9") }))
    }
}
