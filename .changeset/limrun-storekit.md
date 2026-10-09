---
"@e2e-dev/mobile": minor
"@e2e-dev/limrun": minor
---

Add `device.storekit.setConfig()` and `device.storekit.clearConfig()` for local iOS product catalogs. Clearing catalogs preserves purchases and entitlements.
Serialize device controls and clear configured input after each attempt, including
failures and retries. Include a native example and device cleanup tests.
