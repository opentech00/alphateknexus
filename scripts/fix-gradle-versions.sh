#!/bin/bash
# Re-applies stable version fixes after `npx cap sync` regenerates Gradle files.
# Capacitor 8.x ships with AGP 8.13.0 / Gradle 8.14.3 / SDK 36 / Java 21 which may
# not be available in all build environments. We downgrade to stable versions.

set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"

# capacitor-cordova-android-plugins/build.gradle
sed -i "s/com.android.tools.build:gradle:8.13.0/com.android.tools.build:gradle:8.7.3/g" "$DIR/android/capacitor-cordova-android-plugins/build.gradle"
sed -i "s/compileSdkVersion : 36/compileSdkVersion : 35/g" "$DIR/android/capacitor-cordova-android-plugins/build.gradle"
sed -i "s/targetSdkVersion : 36/targetSdkVersion : 35/g" "$DIR/android/capacitor-cordova-android-plugins/build.gradle"
sed -i "s/JavaVersion.VERSION_21/JavaVersion.VERSION_17/g" "$DIR/android/capacitor-cordova-android-plugins/build.gradle"

# app/capacitor.build.gradle
sed -i "s/JavaVersion.VERSION_21/JavaVersion.VERSION_17/g" "$DIR/android/app/capacitor.build.gradle"

echo "[fix-gradle-versions] Patched Capacitor-generated Gradle files for stable versions."
