package com.jukebox.player

import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.lifecycleScope
import com.jukebox.player.data.PartyCodeStore
import com.jukebox.player.ui.CodeEntryScreen
import com.jukebox.player.ui.PlayerScreen
import com.jukebox.player.ui.theme.JukeboxPlayerTheme
import kotlinx.coroutines.launch

// Single-activity app. Renders either the code-entry form or the
// WebView player, depending on whether a code is saved. Keeping it in
// one Activity keeps WebView state coherent when the user hits Back —
// we just swap composables rather than tearing down a second Activity.
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Full-bleed display under the status bar + nav bar. Combined
        // with the landscape orientation lock in the manifest, this
        // gives us the fullscreen feel without asking for any special
        // permissions.
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

        setContent {
            JukeboxPlayerTheme {
                val scope = rememberCoroutineScope()
                val savedCode by store.codeFlow.collectAsState(initial = null)

                when (val code = savedCode) {
                    // null = DataStore hasn't emitted yet. Treat the
                    // empty-string case as "no code saved" explicitly
                    // so the splash flicker is minimal.
                    null, "" -> CodeEntryScreen(
                        onSubmit = { entered ->
                            scope.launch { store.setCode(entered) }
                        },
                    )
                    else -> PlayerScreen(
                        code = code,
                        baseUrl = BuildConfig.BASE_URL,
                        onExit = {
                            lifecycleScope.launch { store.clear() }
                        },
                    )
                }
            }
        }
    }
}
