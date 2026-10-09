# Microphone tests on Limrun

This example measures injected audio through AVAudioEngine on iOS and
AudioRecord on Android. Both apps use normal microphone capture. The tests
check 440 Hz and 1000 Hz tones, silence, replacement, one-shot playback,
explicit clearing, automatic cleanup between attempts, and missing files.

## Install and build

This integration is not published yet. In a disposable checkout, run
`pnpm install --frozen-lockfile` and `pnpm version-packages` at the repository
root to apply the pending releases. Then build and pack `e2e`,
`@e2e-dev/mobile`, and `@e2e-dev/limrun` from this repository, then install
those tarballs in this directory in place of the registry versions.
After publication, `npm install` installs the example's dependencies.

Set `LIMRUN_API_KEY` to a key with instance control permissions. Android
also needs `adb` from Android SDK Platform-Tools on `PATH`.

Build both apps remotely with the Limrun CLI, authenticated with `lim login`
or `LIM_API_KEY`. The uploads below expire after 24 hours.

```sh
lim xcode build ios --scheme MicrophoneDemo --upload e2e-microphone-demo.tar.gz --upload-ttl 24h
lim gradle build android --upload e2e-microphone-demo.apk --upload-ttl 24h
mkdir -p build
lim assets pull e2e-microphone-demo.tar.gz --output build
lim assets pull e2e-microphone-demo.apk --output build
tar -xzf build/e2e-microphone-demo.tar.gz -C build
```

## Run

```sh
export MICROPHONE_IOS_APP="$PWD/build/MicrophoneDemo.app"
export MICROPHONE_ANDROID_APP="$PWD/build/e2e-microphone-demo.apk"
npm test -- --video
```

Use `--target ios` or `--target android` to test one platform. Each target
gets one device for the suite, which the provider releases at exit.
Videos and traces appear under `.e2e/`.

`mockAudio()` starts looping playback by default. Start the app's capture
before injecting audio with `loop: false`, so it hears the beginning.
`clear()` returns to silence while capture continues. The engine also
clears after every attempt, including failures and retries.

The provider uses the iOS stop command. On Android, where the SDK has no
stop command, it replaces playback with a short silent WAV played once.
Uploads reuse one staging filename on each device. Device termination
removes that file.

## Fixtures and compatibility

The committed fixtures are four-second, mono, 16 kHz PCM WAV files.
Regenerate them with `npm run fixtures`; no media tools are needed.
The apps show RMS amplitude and frequency estimated from zero crossings.
They classify samples below an RMS of 0.01 as silence, and allow a small
frequency tolerance for capture buffers and resampling.

These tests verify audio reaching native capture APIs. They do not verify
speech recognition, Expo audio libraries, or a third-party recording SDK.
Use your app's own assertions for those flows. When combining camera and
microphone injection, set a silent camera video first, then inject audio.
Android camera videos with audio also feed the microphone.

Last checked: 2026-10-09, e2e 0.18.0, mobile 0.11.0, Limrun provider 0.2.0,
agent-device 0.21.22, and Limrun SDK 0.59.0. All twelve tests passed on hosted
iOS and Android devices with video recording, using locally packed releases.
