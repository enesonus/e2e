---
"@e2e-dev/mobile": minor
"@e2e-dev/limrun": minor
---

Add `device.microphone.mockAudio()` and `device.microphone.clear()` for looped or one-shot audio on iOS and Android.
Serialize device controls and clear configured input after each attempt, including
failures and retries. Include a native example and device cleanup tests.
