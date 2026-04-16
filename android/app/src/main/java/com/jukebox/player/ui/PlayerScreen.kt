package com.jukebox.player.ui

import android.annotation.SuppressLint
import android.view.KeyEvent
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

@Composable
fun PlayerScreen(
    code: String,
    baseUrl: String,
    adminKey: String? = null,
    onExit: () -> Unit,
) {
    val context = LocalContext.current
    val url = "$baseUrl/party/$code/display"
    val scope = rememberCoroutineScope()

    BackHandler { onExit() }

    val webView = remember {
        createWebView(context, url)
    }

    DisposableEffect(Unit) {
        webView.onResume()
        onDispose {
            webView.onPause()
            webView.stopLoading()
            webView.destroy()
        }
    }

    Box(
        modifier = Modifier.fillMaxSize(),
    ) {
        AndroidView(
            factory = { webView },
            modifier = Modifier.fillMaxSize(),
        )

        if (adminKey != null) {
            val focusRequester = remember { FocusRequester() }
            LaunchedEffect(Unit) { focusRequester.requestFocus() }

            Button(
                onClick = {
                    scope.launch {
                        skipSong(baseUrl, code, adminKey)
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 24.dp)
                    .focusRequester(focusRequester)
                    .focusable(),
                shape = RoundedCornerShape(8.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White.copy(alpha = 0.12f),
                    contentColor = Color.White.copy(alpha = 0.7f),
                ),
            ) {
                Text("Skip", fontSize = 12.sp)
            }
        }
    }
}

private suspend fun skipSong(baseUrl: String, code: String, adminKey: String) {
    withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/api/party/${code.trim().uppercase()}/admin")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = 5_000
            conn.readTimeout = 5_000
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("x-admin-key", adminKey)
            conn.doOutput = true
            conn.outputStream.bufferedWriter().use {
                it.write("""{"action":"skip"}""")
            }
            try { conn.responseCode } finally { conn.disconnect() }
        } catch (_: Exception) { }
    }
}

@SuppressLint("SetJavaScriptEnabled")
private fun createWebView(
    context: android.content.Context,
    url: String,
): WebView {
    return WebView(context).apply {
        layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        setBackgroundColor(android.graphics.Color.BLACK)

        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // Autoplay the YouTube player without requiring a click.
            // Android TVs / Fire TVs don't have a touch "user gesture"
            // to satisfy the default policy, and the display route is
            // read-only so there's no risk of rogue audio.
            mediaPlaybackRequiresUserGesture = false
            // Let YouTube's iframe go fullscreen inside the WebView.
            useWideViewPort = true
            loadWithOverviewMode = true
            // Respect the site's own viewport; DisplayView is already
            // built to fill the viewport exactly.
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        // Match the web app's dark background in the WebView chrome
        // (e.g. the brief flash between load and first paint).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, true)
        }

        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                // Allow navigation inside our own origin (the /display
                // route might redirect to /party/<code>/not-found if
                // the room doesn't exist — we still want to see that
                // page rather than bouncing to an external browser).
                // Everything else (external links the user clicks on
                // an error page, say) we just swallow — this is a
                // display, not a browser.
                val host = request.url.host ?: return false
                val baseHost = android.net.Uri.parse(url).host
                return host != baseHost
            }
        }

        // HTML5 fullscreen requests from the YouTube iframe land here;
        // accepting them lets the video fill the WebView as well.
        webChromeClient = object : WebChromeClient() {}

        // D-pad BACK on Fire TV remotes delivers KEYCODE_BACK to the
        // WebView first. Intercept to pop navigation history if we
        // have any, otherwise let BackHandler above take over.
        setOnKeyListener { _, keyCode, event ->
            if (
                event.action == KeyEvent.ACTION_DOWN &&
                keyCode == KeyEvent.KEYCODE_BACK &&
                canGoBack()
            ) {
                goBack()
                true
            } else {
                false
            }
        }

        loadUrl(url)
    }
}
