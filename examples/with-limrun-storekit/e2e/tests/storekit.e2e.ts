import { expect } from 'e2e';
import { test } from '@e2e-dev/mobile';

const bundleId = 'dev.e2e.storekit';
const source = 'fixtures/Catalog.storekit';

test('loads products from a local catalog and replaces it with an empty catalog', async ({ device, app, screen }) => {
  await device.storekit.setConfig({ bundleId, source });
  await app.open();
  await expect(screen.getByText('Products loaded: 3')).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Buy Coins', exact: true })).toBeVisible();
  await device.storekit.setConfig({ bundleId, source: 'fixtures/Empty.storekit' });
  await app.restart();
  await expect(screen.getByText('Products loaded: 0')).toBeVisible();
});

test('purchases a consumable through the StoreKit sheet', async ({ device, app, screen }) => {
  await device.storekit.setConfig({ bundleId, source });
  await app.open();
  await screen.getByRole('button', { name: 'Buy Coins', exact: true }).click();
  await screen.getByRole('button', { name: 'Purchase', exact: true }).click();
  await screen.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(screen.getByText('Purchased Coins')).toBeVisible();
});

test('cancels a consumable purchase', async ({ device, app, screen }) => {
  await device.storekit.setConfig({ bundleId, source });
  await app.open();
  await screen.getByRole('button', { name: 'Buy Coins', exact: true }).click();
  await screen.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(screen.getByText('Purchase cancelled')).toBeVisible();
});

test('keeps the premium entitlement after clearing the catalog and restarting', { retries: 0 }, async ({ device, app, screen }) => {
  await device.storekit.setConfig({ bundleId, source });
  await app.open();
  await expect(screen.getByText('Premium locked')).toBeVisible();
  await screen.getByRole('button', { name: 'Buy Premium', exact: true }).click();
  await screen.getByRole('button', { name: 'Purchase', exact: true }).click();
  await screen.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(screen.getByText('Premium unlocked')).toBeVisible();
  await device.storekit.clearConfig(bundleId);
  await device.storekit.clearConfig(bundleId);
  await device.storekit.setConfig({ bundleId, source });
  await app.restart();
  await expect(screen.getByText('Premium unlocked')).toBeVisible();
  await app.screenshot('premium-entitlement');
});

test('purchases a subscription and reads its entitlement after restart', { retries: 0 }, async ({ device, app, screen }) => {
  await device.storekit.setConfig({ bundleId, source });
  await app.open();
  await expect(screen.getByText('Subscription inactive')).toBeVisible();
  await screen.getByRole('button', { name: 'Buy Monthly', exact: true }).click();
  // StoreKit can expose duplicate Subscribe labels during the sheet animation.
  await screen.getByTestId('footer').click();
  await screen.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(screen.getByText('Subscription active')).toBeVisible();
  await app.restart();
  await expect(screen.getByText('Subscription active')).toBeVisible();
});

test('rejects invalid input before touching StoreKit', async ({ device }) => {
  for (const config of [{ bundleId, source: 'fixtures/missing.storekit' }, { bundleId: '../app', source }]) {
    let code: unknown;
    try { await device.storekit.setConfig(config); }
    catch (error) { code = (error as { code?: string }).code; }
    if (code !== 'INVALID_ARGUMENT') throw new Error(`Expected INVALID_ARGUMENT, got ${code}`);
  }
});
