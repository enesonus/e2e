---
"@e2e-dev/mobile": minor
"@e2e-dev/limrun": minor
---

Add `device.camera.mockFeed()` and `device.camera.clear()` for repeatable video input on iOS and Android.
Serialize device controls and clear configured input after each attempt, including
failures and retries. Include a native example and device cleanup tests.
