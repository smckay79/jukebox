# Jukebox Player (Android + Fire TV)

A thin, TV-first Android app that points a WebView at a deployed
Jukebox party's `/display` route. The web app handles rendering
(player, up-next strip, marquee, join QR); this app handles screen-on,
fullscreen, and remembering the party code across reboots.

Targets:
- Phones / tablets (Android 8.0+, API 26)
- Android TV (all generations that run API 26+)
- Fire TV (gen 2 and newer — all run Fire OS based on Android 7+)

## Layout

```
android/
├── app/
│   ├── build.gradle.kts              — app module config (baseUrl is plumbed here)
│   └── src/main/
│       ├── AndroidManifest.xml       — phone + leanback launchers, keep-screen-on
│       ├── java/com/jukebox/player/
│       │   ├── MainActivity.kt       — Compose host, routes by saved code
│       │   ├── data/PartyCodeStore.kt — DataStore-backed code persistence
│       │   └── ui/
│       │       ├── CodeEntryScreen.kt — 6-char room-code entry
│       │       ├── PlayerScreen.kt    — full-bleed WebView
│       │       └── theme/Theme.kt
│       └── res/                      — icons, strings, TV banner
├── build.gradle.kts                  — plugin versions
├── settings.gradle.kts
└── gradle.properties                 — JUKEBOX_BASE_URL lives here
```

## Build

### Prerequisites
- **JDK 17** (the Android Gradle Plugin 8.5+ requires it).
- **Android Studio Koala (2024.1) or newer**, or just the command-line
  tools with Gradle 8.9.

### First-time setup

```bash
cd android/
# Generate the gradle wrapper (not committed — creates gradlew + .jar).
gradle wrapper --gradle-version 8.9
# Sync + assemble a debug APK.
./gradlew :app:assembleDebug
```

The APK lands at `app/build/outputs/apk/debug/app-debug.apk`.

### Pointing at a different backend

By default the app builds against `https://jukebox-delta-three.vercel.app`.
Override for a local dev server or staging:

```bash
./gradlew :app:assembleDebug -PJUKEBOX_BASE_URL=https://staging.example.com
```

or create `gradle.properties.local` next to the root `gradle.properties`
(it's gitignored) and set `JUKEBOX_BASE_URL=...` there.

> The WebView refuses cleartext HTTP (`android:usesCleartextTraffic="false"`).
> If you need to point at a plain-HTTP local dev server for testing,
> temporarily flip that flag and use `http://10.0.2.2:3000` (emulator)
> or your LAN IP (device). Don't ship a release build with cleartext on.

## Install + run

### Phone / tablet

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.jukebox.player/.MainActivity
```

### Fire TV

```bash
# Enable ADB debugging on the Fire TV:
# Settings → My Fire TV → Developer options → ADB debugging: On
adb connect <fire-tv-ip>:5555
adb -s <fire-tv-ip>:5555 install -r app/build/outputs/apk/debug/app-debug.apk
```

The app will appear in the "Your Apps & Channels" row. On some Fire TV
generations you need to scroll all the way right and hit "See All" —
sideloaded apps don't always surface on the front page.

### Android TV

Same as phone, but installed apps end up in the "Apps" row on the home
screen via the `LEANBACK_LAUNCHER` intent filter. The TV banner shown
there lives at `app/src/main/res/drawable/tv_banner.xml` — replace it
with a 320×180 PNG if you want something prettier than the default.

## How the display contract works

The app loads `${BASE_URL}/party/${CODE}/display` (no query params, no
headers). That route on the web app renders `DisplayView.tsx`, which:

1. Subscribes to `GET /api/party/<code>/stream` (SSE) for real-time updates.
2. Renders the YouTube IFrame player full-bleed.
3. Reports "video ended" via `POST /api/party/<code>/ended` so the
   server advances the queue.
4. Shows a `Party ended` card when `party.endedAt` is set.

There is no auth and no admin key. Any device with the party code can
display the party. Every piece of host / guest chrome (add-song,
import, history, end-party, settings) is intentionally absent from the
`/display` route so the Android app doesn't need to hide anything.

## Changing the party code

Long-press BACK from the player screen clears the stored code and
bounces the user to the code-entry form. On Fire TV remotes, that's
the physical back button on the remote body.
