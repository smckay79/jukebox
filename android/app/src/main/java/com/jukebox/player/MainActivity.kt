package com.jukebox.player

import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.lifecycleScope
import com.jukebox.player.data.PartyCodeStore
import com.jukebox.player.ui.CodeEntryScreen
import com.jukebox.player.ui.PlayerScreen
import com.jukebox.player.ui.theme.JukeboxPlayerTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        enableEdgeToEdge()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )

        val store = PartyCodeStore(applicationContext)
        val baseUrl = BuildConfig.BASE_URL

        setContent {
            JukeboxPlayerTheme {
                val scope = rememberCoroutineScope()
                val savedCode by store.codeFlow.collectAsState(initial = null)
                val history by store.historyFlow.collectAsState(initial = emptyList())

                when (val code = savedCode) {
                    null, "" -> CodeEntryScreen(
                        onSubmit = { entered ->
                            scope.launch {
                                store.setCode(entered)
                                val name = fetchPartyName(baseUrl, entered)
                                store.addToHistory(entered, name)
                            }
                        },
                        recentParties = history,
                    )
                    else -> PlayerScreen(
                        code = code,
                        baseUrl = baseUrl,
                        onExit = {
                            lifecycleScope.launch { store.clear() }
                        },
                    )
                }
            }
        }
    }
}

private suspend fun fetchPartyName(baseUrl: String, code: String): String =
    withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/api/party/${code.trim().uppercase()}")
            val conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 5_000
            conn.readTimeout = 5_000
            try {
                if (conn.responseCode == 200) {
                    val body = conn.inputStream.bufferedReader().readText()
                    JSONObject(body).optString("name", "Party")
                } else {
                    "Party"
                }
            } finally {
                conn.disconnect()
            }
        } catch (_: Exception) {
            "Party"
        }
    }
