import { expect } from 'e2e';
import { test } from '@e2e-dev/mobile';

test('captures known microphone audio', async ({ device, app, screen }) => {
  await app.open();
  await screen.getByRole('button', { name: /listen/i }).click();
  await device.microphone.mockAudio({ source: 'fixtures/440.wav' });
  await expect(screen.getByText('440 Hz detected')).toBeVisible();
  await device.microphone.clear();
  await expect(screen.getByText('Silence')).toBeVisible();
});
