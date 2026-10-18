# GeoField Android

This Android app builds **artifacts/geofield**, the same web application used by
GeoField's website and Capacitor iPhone app. Do not use the separate
`artifacts/geofield-mobile` Expo/EAS project to build this version.

## Build and run

Requirements: Node/pnpm workspace dependencies, Java 21, Android Studio, Android
SDK 36 (Gradle can install it when SDK licenses have been accepted).

From the repository root:

```sh
pnpm --filter @workspace/geofield android:build
pnpm --filter @workspace/geofield android:open
```

In Android Studio open `artifacts/geofield/android`. Set the Gradle JDK to Java 21
if Studio defaults to its bundled Java 25. On this Mac Java 21 is installed at
`~/Library/Java/JavaVirtualMachines/geofield-jdk-21.jdk/Contents/Home`.

Every Gradle build runs `scripts/android-build-web.sh` to rebuild and copy the
current website assets. After changing Capacitor plugin dependencies run
`pnpm exec cap sync android` from `artifacts/geofield` before building.

Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
Install on a connected emulator/device with:

```sh
"$HOME/Library/Android/sdk/platform-tools/adb" install -r artifacts/geofield/android/app/build/outputs/apk/debug/app-debug.apk
```

Application ID: `com.ammonkennedy.geofield`. The old Expo preview uses
`com.geofield.mobile`; these are separate installations with separate local data.
Installing this app does not migrate the Expo app's unsynced local data.

## Platform support

- Shared MapLibre map and overlays; no Google Maps SDK key required.
- Same Amplify account/backend configuration and existing offline storage/sync.
- Native rotation-vector sensor supplies magnetic-north clinometer data. If true
  north is selected, the existing UI explicitly falls back to magnetic north.
  Phones without this sensor report it unavailable. Verify strike/dip and
  lineation against a known compass on a physical Android phone before release.
- GPS uses the Capacitor WebView permission bridge and high-accuracy browser API.
- Taking/selecting photos uses Android's camera/file picker. Imported JPEG camera
  direction is retained if supplied, but the iOS custom shutter-direction camera
  plugin has not been ported to Android.
- Photos save to Pictures/GeoField through MediaStore; other exports use Android's
  Save As picker. Older Android releases request storage permission as needed.
- Speech recognition uses the existing community Android plugin; availability
  depends on the device's speech service.

A successful emulator test does not validate physical compass/GPS accuracy or
cross-device account sync. Test those with real devices and a test account.

## Verification performed

- Debug APK builds and installs successfully; current shared screens launch.
- Street map renders in a native emulator screenshot and exits full screen.
- Rotation-vector events provide a unit plane normal and magnetic reference.
- Camera capture opens the external Android camera (capture-intent visibility
  is declared in the manifest); photo saving succeeds through MediaStore.
- File export completes through Android's Save As picker.
- Workspace TypeScript check and 57 math, GPS, photo-direction, and photo-history
  tests pass.

WebView debugging screenshots can omit the WebGL map even when it is visible
on the device; use a native device screenshot when checking map rendering.

## Emulator rendering workaround

The API 37 emulator on this Mac displayed repeated, overlapping WebView tiles.
Disabling Vulkan resolved the issue without changing application code or data.
Close the emulator, then launch it from the repository root with:

```sh
bash artifacts/geofield/scripts/android-emulator.sh
```

An alternative AVD name can be passed as the first argument. This launcher keeps
hardware graphics enabled for maps, disables Vulkan, and skips saved graphics
snapshots. It does not wipe the emulator's data. A normal Android Studio launch
does not automatically use these flags.

See [Android's emulator troubleshooting guide](https://developer.android.com/studio/run/emulator-troubleshooting).

## Distribution

The debug APK is for testing, not Google Play submission. Production requires a
private signing setup, a release AAB, and testing/Play Console configuration.
No signing keys or credentials belong in Git. Existing iOS files and the Expo
project are not replaced by this Android project.

### Signed Google Play bundle

Run `pnpm --filter @workspace/geofield android:release` from the repository root.
This checks TypeScript, syncs native plugins, builds current web assets, produces
the release bundle, and verifies its JAR signature.

Upload `android/app/build/outputs/bundle/release/app-release.aab` to the GeoField
app's internal testing track. Package: `com.ammonkennedy.geofield`; initial Android
version: 1.2, version code 1. Increase versionCode before subsequent Play uploads.
Enable Google-managed Play App Signing for a new app. This local key is the upload
key; no Play Console upload or publication is performed by the build command.

Private files (Git-ignored, owner-only permissions):

- `android/.signing/geofield-upload.p12`: upload key, alias `geofield-upload`.
- `android/keystore.properties`: signing paths and generated passwords.

Back up BOTH files to a secure password-manager attachment or encrypted backup
outside this computer. Do not send them in chat or commit them. New checkouts
require restoring these files before release builds. Never regenerate the upload
key for an existing Play app without following Google's upload-key reset process.
If a bundle was already uploaded under this package using another key, use that
registered upload key instead.
