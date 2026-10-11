# WebGPU tests on Limrun

This iOS app loads a bundled page in WKWebView. A WebGPU compute shader
multiplies four integers, and a render pipeline draws a triangle. The app
reads the output buffer and two texture pixels back from the GPU before
reporting success. The tests change the multiplier, check the resulting
color, reject an invalid shader, and restart the app.

## Build and install

This integration is not published yet. In a disposable checkout, run
`pnpm install --frozen-lockfile` and `pnpm version-packages` at the repository
root to apply the pending releases. Then build and pack `e2e`,
`@e2e-dev/mobile`, and `@e2e-dev/limrun` from this repository, then install
those tarballs in `e2e/` in place of the registry versions. After
publication, run `npm install` from `e2e/`.

Build remotely using the Limrun CLI, authenticated with `lim login` or
`LIM_API_KEY`:

```sh
lim xcode build . --scheme WebGPUDemo --upload e2e-webgpu-demo.tar.gz --upload-ttl 24h
mkdir -p build
lim assets pull e2e-webgpu-demo.tar.gz --output build
tar -xzf build/e2e-webgpu-demo.tar.gz -C build
```

## Run

Set `LIMRUN_API_KEY` to a key with instance control permissions. From this
example's root:

```sh
export WEBGPU_IOS_APP="$PWD/build/WebGPUDemo.app"
cd e2e
npm test -- --video
```

The suite allocates a fresh Limrun iOS simulator and releases it at exit.
Traces, screenshots, and videos appear under `e2e/.e2e/results/`.

## What the results prove

The initial input is `1, 2, 3, 4`. **Double values** produces `2, 4, 6, 8`
and a green triangle. **Triple values** produces `3, 6, 9, 12` and a blue
triangle. Readback checks the triangle's center and a black corner outside
it. These assertions detect compute and rendering failures without relying
on a screenshot comparison alone.

WebGPU is a runtime capability. The test uses ordinary app and screen
operations; there is no `device.webgpu` control or CPU fallback. The app
requires `navigator.gpu`, an adapter, a device, a canvas context, and
successful shader execution. Missing support, device loss, invalid output,
or an operation taking more than 20 seconds produces a visible failure.
The invalid-shader case expects a validation error, then executes valid
work again.

This example targets iOS 26 or newer. Runtime availability alone does not
prove an app's shaders work. Test your own workloads and read their results.
This small suite does not measure GPU performance, validate every WebGPU
feature, or cover Android WebView.

Last checked: 2026-10-09, e2e 0.18.0, mobile 0.11.0, Limrun provider 0.2.0,
agent-device 0.21.22, and Limrun SDK 0.59.0. All four tests passed on a hosted
iOS simulator with video recording, using locally packed releases.
