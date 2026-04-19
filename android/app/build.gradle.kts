plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Read the VideoJam web base URL from gradle properties so the same
// apk can point at staging vs production just by swapping the prop.
val videojamBaseUrl: String = (findProperty("VIDEOJAM_BASE_URL") as String?)
    ?: "https://videojam.net"

android {
    namespace = "net.videojam.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "net.videojam.player"
        // minSdk 26 lets us ship adaptive launcher icons only (no PNG
        // mipmaps needed). Covers all Fire TVs and ~98% of Android
        // devices in the field. Drop to 24 + add PNG mipmaps if an
        // older Fire tablet turns out to be a target.
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        // Exposed to Kotlin via BuildConfig.BASE_URL. Wrapped in quotes
        // because buildConfigField literally concatenates into source.
        buildConfigField("String", "BASE_URL", "\"$videojamBaseUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
    composeOptions {
        // Matches Kotlin 1.9.24 — see
        // https://developer.android.com/jetpack/androidx/releases/compose-kotlin
        kotlinCompilerExtensionVersion = "1.5.14"
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    // Compose BOM pins all androidx.compose.* versions coherently.
    val composeBom = platform("androidx.compose:compose-bom:2024.09.02")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    // Leanback support so the app appears in the Android TV / Fire TV
    // launcher row. We don't use leanback UI components — Compose
    // handles the TV D-pad via focus traversal — but the library is
    // required for the LEANBACK_LAUNCHER intent filter to resolve.
    implementation("androidx.leanback:leanback:1.0.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
