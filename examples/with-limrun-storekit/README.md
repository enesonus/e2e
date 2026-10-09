# StoreKit tests on Limrun

This native SwiftUI app uses StoreKit 2 to load products, purchase coins,
unlock premium access, and read a monthly subscription entitlement. The
e2e tests supply local catalogs through Limrun and drive Apple's purchase
sheet with ordinary screen locators. The app contains no purchase mocks
or StoreKitTest transaction controls.

## Build and install

This integration is not published yet. In a disposable checkout, run
`pnpm install --frozen-lockfile` and `pnpm version-packages` at the repository
root to apply the pending releases. Then build and pack `e2e`,
`@e2e-dev/mobile`, and `@e2e-dev/limrun` from this repository, then install
those tarballs in `e2e/` in place of the registry versions. After
publication, run `npm install` from `e2e/`.

Build remotely using the Limrun CLI, authenticated with `lim login` or
`LIM_API_KEY`. The simulator build uses ad hoc signing, which local
StoreKit testing requires. No Apple developer account is needed.

```sh
lim xcode build . --scheme StoreKitDemo --upload e2e-storekit-demo.tar.gz --upload-ttl 24h
mkdir -p build
lim assets pull e2e-storekit-demo.tar.gz --output build
tar -xzf build/e2e-storekit-demo.tar.gz -C build
```

## Run

Set `LIMRUN_API_KEY` to a key with instance control permissions. From this
example's root:

```sh
export STOREKIT_IOS_APP="$PWD/build/StoreKitDemo.app"
cd e2e
npm test -- --video
```

The suite gets a fresh Limrun iPad simulator, released at exit. Traces and
videos appear under `e2e/.e2e/results/`. This example is iOS only; StoreKit
controls report `UNSUPPORTED_CAPABILITY` on Android.

## Catalogs and purchase history

`Catalog.storekit` defines coins (consumable), premium access
(nonconsumable), and a monthly subscription. `Empty.storekit` defines no
products. Paths resolve against the e2e project root. Use Xcode to edit a
catalog when you need additional products or StoreKit settings.

Set a catalog before opening the app, or restart the app after replacing
it. The tests check product loading, replacement, purchase confirmation,
cancellation, entitlement persistence, explicit clearing, and invalid
input. Each purchase uses the native StoreKit sheet in the Xcode test
environment; no real payment is made.

The engine removes every catalog it applied after each attempt, including
failures and retries. `device.storekit.clearConfig(bundleId)` does this
early. Neither operation clears transactions or entitlements. This suite
uses one worker and distinct products for entitlement tests. The premium
and subscription tests disable retries because a completed purchase would
leave the next attempt unlocked. Start a new run to retry those tests with
fresh purchase history.

Clearing returns StoreKit to normal sandbox behavior. Apply
`Empty.storekit` to test zero products without sandbox access. Local
transactions do not validate production receipts or server integrations.
Refund, expiry, transaction-reset, and payment-failure controls are not
exposed. This example does not test legacy StoreKit 1, restore purchases,
or third-party purchase libraries.

## Purchase sheet compatibility

The example selects iPad and allows two seconds for StoreKit sheet transitions.
On iPhone 16 Pro with iOS 26.4, the Purchase button intermittently disappears
from the accessibility tree while remaining visible. This also reproduced
through the Limrun SDK directly. Catalog injection still works, but iPhone
purchase-sheet automation is unresolved. The example uses normal locators,
without coordinate or private API fallbacks.

Last checked: 2026-10-09, e2e 0.18.0, mobile 0.11.0, Limrun provider 0.2.0,
agent-device 0.21.22, and Limrun SDK 0.59.0. All six tests passed on a Limrun
iPad with video recording, using locally packed releases.
