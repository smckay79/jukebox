package com.jukebox.player.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.json.JSONArray
import org.json.JSONObject

private val Context.codeDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "party_code",
)

data class RecentParty(
    val code: String,
    val name: String,
    val joinedAt: Long,
)

private const val MAX_HISTORY = 10

class PartyCodeStore(private val context: Context) {

    val codeFlow: Flow<String?> = context.codeDataStore.data.map { prefs ->
        prefs[CODE_KEY]
    }

    val historyFlow: Flow<List<RecentParty>> = context.codeDataStore.data.map { prefs ->
        parseHistory(prefs[HISTORY_KEY])
    }

    suspend fun setCode(code: String) {
        context.codeDataStore.edit { prefs ->
            prefs[CODE_KEY] = code.trim().uppercase()
        }
    }

    suspend fun clear() {
        context.codeDataStore.edit { prefs -> prefs.remove(CODE_KEY) }
    }

    suspend fun addToHistory(code: String, name: String) {
        val normalized = code.trim().uppercase()
        context.codeDataStore.edit { prefs ->
            val existing = parseHistory(prefs[HISTORY_KEY]).toMutableList()
            existing.removeAll { it.code == normalized }
            existing.add(0, RecentParty(normalized, name, System.currentTimeMillis()))
            if (existing.size > MAX_HISTORY) {
                existing.subList(MAX_HISTORY, existing.size).clear()
            }
            prefs[HISTORY_KEY] = serializeHistory(existing)
        }
    }

    private companion object {
        val CODE_KEY = stringPreferencesKey("code")
        val HISTORY_KEY = stringPreferencesKey("history")

        fun parseHistory(json: String?): List<RecentParty> {
            if (json.isNullOrBlank()) return emptyList()
            return try {
                val arr = JSONArray(json)
                (0 until arr.length()).map { i ->
                    val obj = arr.getJSONObject(i)
                    RecentParty(
                        code = obj.getString("code"),
                        name = obj.optString("name", "Party"),
                        joinedAt = obj.optLong("joinedAt", 0L),
                    )
                }
            } catch (_: Exception) {
                emptyList()
            }
        }

        fun serializeHistory(list: List<RecentParty>): String {
            val arr = JSONArray()
            for (p in list) {
                arr.put(JSONObject().apply {
                    put("code", p.code)
                    put("name", p.name)
                    put("joinedAt", p.joinedAt)
                })
            }
            return arr.toString()
        }
    }
}
