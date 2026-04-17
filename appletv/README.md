# Jukebox Player — Apple TV

tvOS companion app for the Jukebox party system. Displays the party's
now-playing video, up-next strip, marquee, and QR code on the big screen.

## Requirements

- Xcode 15.4+
- tvOS 17.0+ deployment target
- Swift 5.0

## Setup

1. Open `JukeboxPlayer.xcodeproj` in Xcode.
2. Set your team in **Signing & Capabilities**.
3. The backend URL defaults to `https://jukebox-delta-three.vercel.app`.
   To change it, edit the `JUKEBOX_BASE_URL` value in `Info.plist`.

## Architecture

Mirrors the Android app 1:1:

| Swift file | Android equivalent | Purpose |
|---|---|---|
| `JukeboxPlayerApp.swift` | `MainActivity.kt` | Entry point, routing |
| `CodeEntryScreen.swift` | `CodeEntryScreen.kt` | Party code + PIN entry |
| `PlayerScreen.swift` | `PlayerScreen.kt` | WKWebView + skip button |
| `PartyCodeStore.swift` | `PartyCodeStore.kt` | UserDefaults persistence |
| `APIClient.swift` | (inline in MainActivity/PlayerScreen) | HTTP helpers |
| `Configuration.swift` | `BuildConfig.BASE_URL` | Base URL config |

## Features

- **Code entry** — 6-character party code with optional 4-digit host PIN
- **Recent parties** — Up to 10 saved with one-tap rejoin
- **Admin badge** — Shows which saved parties have admin access
- **WebView display** — Full-bleed `/party/{code}/display` route
- **Skip button** — Floating admin control (only when PIN verified)
- **Auto-play** — YouTube plays without user gesture
- **Screen stays on** — Idle timer disabled during playback
- **Siri Remote** — Menu button exits, focus engine for D-pad navigation
- **Dark theme** — Matches the web app's purple aesthetic

## Siri Remote Controls

| Button | Action |
|---|---|
| Swipe / D-pad | Navigate between fields and buttons |
| Select (click) | Activate focused button |
| Menu | Exit player → code entry, or exit app |
