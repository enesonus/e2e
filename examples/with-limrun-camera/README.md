# Camera tests on Limrun

This example scans the same QR videos on an iOS simulator and an Android
emulator. The tests cover a valid code, an unknown code, blank frames, and
clearing an injected feed. Each attempt records a video with `--video`.

The iOS app uses AVFoundation and Core Image's QR detector. The Android app
uses Camera2 and ZXing 3.5.3. Neither app contains test-only camera input.

## Install

Install the example's dependencies after `@e2e-dev/limrun` is published:

```sh
npm install
```

For an unpublished checkout, run `pnpm install --frozen-lockfile` and
`pnpm version-packages` at the root of a disposable checkout to apply the
pending releases. Then build and pack `e2e`, `@e2e-dev/mobile`, and
`@e2e-dev/limrun`, and install those tarballs here in place of their registry
versions.

Set `LIMRUN_API_KEY` to a Limrun key with instance control permissions.
Android tests also need `adb` from Android SDK Platform-Tools on `PATH`.

## Build the apps

Build remotely with the Limrun CLI. These commands upload temporary app
artifacts to your Limrun account; they do not publish the apps to a store.
The CLI uses `lim login` or `LIM_API_KEY` for authentication.

```sh
lim xcode build ios --scheme CameraDemo --upload e2e-camera-demo.tar.gz --upload-ttl 24h
lim gradle build android --upload e2e-camera-demo.apk --upload-ttl 24h
mkdir -p build
lim assets pull e2e-camera-demo.tar.gz --output build
lim assets pull e2e-camera-demo.apk --output build
tar -xzf build/e2e-camera-demo.tar.gz -C build
```

A simulator `.app` and an APK built elsewhere work too. Point the environment
variables below at the resulting files.

## Run

```sh
export CAMERA_IOS_APP="$PWD/build/CameraDemo.app"
export CAMERA_ANDROID_APP="$PWD/build/e2e-camera-demo.apk"
npm test -- --video
```

To test one platform:

```sh
npm test -- --target ios --video
npm test -- --target android --video
```

The provider installs the app on a fresh device before the suite starts.
Tests grant camera permission, set a feed, and open the app. The engine
clears the feed after each attempt, including failed attempts and retries.
The final test opens the scanner before starting a one-shot feed, clears
explicitly, restarts the scanner, and verifies that
the previous QR code no longer arrives.

Videos, screenshots, and traces are under `.e2e/`. The run releases
its devices at exit. A default one-hour hard timeout bounds device lifetime
if the runner disappears.

## Media fixtures

`fixtures/valid.mp4` encodes `e2e://camera/accepted`.
`fixtures/invalid.mp4` encodes `e2e://camera/unknown`.
`fixtures/blank.mp4` contains white frames. All three videos are silent.

The MP4s are committed so tests need no media tools. To regenerate them,
install FFmpeg and run:

```sh
npm run fixtures
```

A blank video produces frames with no QR code. Clearing the feed restores
the default camera input, which may produce no frames when no live source
is attached. The apps report those cases separately.

## Compatibility

Android camera injection requires Android 15 or newer. The provider asks
for Android 15 by default. App libraries that compile out simulator capture
need an app-side change before camera injection can work. In particular,
`expo-camera` 17.0.10 disables its iOS simulator capture path. This example
uses native capture to verify injection independently of that restriction.

Last checked: 2026-10-09, e2e 0.18.0, mobile 0.11.0, Limrun provider 0.2.0,
agent-device 0.21.22, and Limrun SDK 0.59.0. All eight tests passed on hosted
iOS and Android devices with video recording, using locally packed releases.
