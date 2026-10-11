import { expect } from 'e2e';
import { test } from '@e2e-dev/mobile';

for (const [source, expected] of [
  ['valid.mp4', 'Code accepted'],
  ['invalid.mp4', 'Unsupported code'],
  ['blank.mp4', 'No code detected'],
] as const) {
  test(`camera reads ${source}`, async ({ device, app, screen }) => {
    await device.camera.mockFeed({ type: 'video', source: `fixtures/${source}` });
    await app.open();
    await expect(screen.getByText(expected)).toBeVisible({ timeout: 20_000 });
    // e2e clears the feed after this attempt, including failures and retries.
  });
}

test('clearing the feed removes the QR code', async ({ device, app, screen }) => {
  await app.open();
  await device.camera.mockFeed({ type: 'video', source: 'fixtures/valid.mp4', loop: false });
  await expect(screen.getByText('Code accepted')).toBeVisible({ timeout: 20_000 });
  await device.camera.clear();
  await app.restart();
  await expect(screen.getByText(/No code detected|No camera input/)).toBeVisible({ timeout: 20_000 });
});
