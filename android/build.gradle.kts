// Top-level build file. Plugin versions are applied here and pinned so
// the app module can reference them without repeating the versions.
// Kotlin 1.9 pairs with the Compose compiler extension declared in
// app/build.gradle.kts (composeOptions block) — no separate plugin.
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
