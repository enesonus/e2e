import { expect } from 'e2e';
import { test } from '@e2e-dev/mobile';

const scanner = test.extend<{ cameraReady: void }>({
  cameraReady: async ({ device }, use) => {
    await device.camera.mockFeed({
      type: 'video',
      source: 'fixtures/valid-qr.mp4',
    });
    await use();
  },
});

scanner('accepts a known QR code', async ({ app, screen }) => {
  await app.open();
  await expect(screen.getByText('Code accepted')).toBeVisible();
});
