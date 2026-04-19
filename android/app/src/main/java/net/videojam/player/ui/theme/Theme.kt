package net.videojam.player.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Minimal theme — we really only need the code-entry screen themed.
// The player screen is a WebView and inherits the web app's own
// styling. Dark defaults match the web app's aesthetic so the split-
// second before WebView first paint isn't jarring.
private val VideoJamDark = darkColorScheme(
    primary = Color(0xFFB084F7),
    background = Color(0xFF1A0B2E),
    surface = Color(0xFF1A0B2E),
    onBackground = Color(0xFFF5F3FF),
    onSurface = Color(0xFFF5F3FF),
)

private val VideoJamLight = lightColorScheme(
    primary = Color(0xFF7C3AED),
    background = Color(0xFFF5F3FF),
    onBackground = Color(0xFF1A0B2E),
)

@Composable
fun VideoJamPlayerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) VideoJamDark else VideoJamLight,
        content = content,
    )
}
