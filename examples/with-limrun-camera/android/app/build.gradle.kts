plugins { id("com.android.application") }
android {
    namespace = "dev.e2e.camera"
    compileSdk = 35
    defaultConfig {
        applicationId = "dev.e2e.camera"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }
}
dependencies { implementation("com.google.zxing:core:3.5.3") }
