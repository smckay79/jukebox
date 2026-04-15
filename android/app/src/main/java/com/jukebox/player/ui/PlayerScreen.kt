package com.jukebox.player.ui

import android.annotation.SuppressLint
import android.view.KeyEvent
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

// Hosts a full-bleed WebView pointed at /party/<code>/display. The
// display route on the web app is deliberately chrome-free, so we
// don't need to inject any CSS or JS — we just load it and get out of
// the way. The YouTube IFrame player inside that page handles all
// playback; we flip a few WebView flags so autoplay, fullscreen, and
// media access work without a user gesture (fine on a TV app).
@Composable
fun PlayerScreen(
    code: String,
    baseUrl: String,
    onExit: () -> Unit,
) {
    val context = LocalContext.current
    val url = "$baseUrl/party/$code/display"

    // Long-press BACK returns to the code-entry screen. A short tap
    // still lets the WebView navigate back through any in-page history
    // (rare on /display, but harmless).
    BackHandler { onExit() }

    // Build the WebView once, retain it across recompositions. The
    // AndroidView factory runs only when the composable first enters
    // the tree — subsequent recompositions just pass the same instance.
    val webView = remember {
        createWebView(context, url)
    }

    // Pause playback when the screen leaves composition (e.g. user
    // switches apps) to honor Android battery/autoplay policies, and
    // destroy the WebView cleanly to avoid leaks.
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
