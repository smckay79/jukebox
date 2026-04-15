package com.jukebox.player.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

// Stores the last-entered party code in DataStore so the app reopens
// straight into the player on next launch (and survives process death
// cleanly). The "exit" button in PlayerScreen clears it to bounce the
// user back to the code-entry form.
private val Context.codeDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "party_code",
)

class PartyCodeStore(private val context: Context) {

    val codeFlow: Flow<String?> = context.codeDataStore.data.map { prefs ->
        prefs[CODE_KEY]
    }

    suspend fun setCode(code: String) {
        context.codeDataStore.edit { prefs ->
            // Normalize to upper-case on write — party codes are always
            // uppercase server-side, so storing the canonical form
            // avoids a follow-up fetch returning 404 on a user typo.
            prefs[CODE_KEY] = code.trim().uppercase()
        }
    }

    suspend fun clear() {
        context.codeDataStore.edit { prefs -> prefs.remove(CODE_KEY) }
    }

    private companion object {
        val CODE_KEY = stringPreferencesKey("code")
    }
}
