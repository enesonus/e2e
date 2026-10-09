import { expect } from 'e2e';
import { test } from '@e2e-dev/mobile';

test('shows the local product catalog', async ({ device, app, screen }) => {
  await device.storekit.setConfig({
    bundleId: 'dev.e2e.storekit',
    source: 'fixtures/Catalog.storekit',
  });
  await app.open();
  await expect(screen.getByRole('button', { name: 'Buy Premium' })).toBeVisible();
});
