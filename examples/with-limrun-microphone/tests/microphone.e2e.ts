import { expect } from 'e2e';
import { test } from '@e2e-dev/mobile';

test('replaces a looping tone with different audio', async ({ device, app, screen }) => {
  await device.microphone.mockAudio({ source: 'fixtures/440.wav' });
  await app.open();
  await screen.getByRole('button', { name: /listen/i }).click();
  await expect(screen.getByText('440 Hz detected')).toBeVisible({ timeout: 15_000 });
  await device.microphone.mockAudio({ source: 'fixtures/1000.wav' });
  await expect(screen.getByText('1000 Hz detected')).toBeVisible({ timeout: 15_000 });
});

test('starts the next attempt without the previous tone', async ({ app, screen }) => {
  await app.open();
  await screen.getByRole('button', { name: /listen/i }).click();
  await expect(screen.getByText('Silence')).toBeVisible({ timeout: 15_000 });
});

test('captures a silent audio fixture', async ({ device, app, screen }) => {
  await device.microphone.mockAudio({ source: 'fixtures/silence.wav' });
  await app.open();
  await screen.getByRole('button', { name: /listen/i }).click();
  await expect(screen.getByText('Silence')).toBeVisible({ timeout: 15_000 });
});

test('clears a tone while the app is still listening', async ({ device, app, screen }) => {
  await app.open();
  await screen.getByRole('button', { name: /listen/i }).click();
  await device.microphone.mockAudio({ source: 'fixtures/440.wav' });
  await expect(screen.getByText('440 Hz detected')).toBeVisible({ timeout: 15_000 });
  await device.microphone.clear();
  await expect(screen.getByText('Silence')).toBeVisible({ timeout: 15_000 });
  await device.microphone.clear();
});

test('plays once and then returns to silence', async ({ device, app, screen }) => {
  await app.open();
  await screen.getByRole('button', { name: /listen/i }).click();
  await device.microphone.mockAudio({ source: 'fixtures/1000.wav', loop: false });
  await expect(screen.getByText('1000 Hz detected')).toBeVisible({ timeout: 15_000 });
  await expect(screen.getByText('Silence')).toBeVisible({ timeout: 15_000 });
});

test('rejects a missing fixture with a useful error', async ({ device }) => {
  let code: unknown;
  try { await device.microphone.mockAudio({ source: 'fixtures/missing.wav' }); }
  catch (error) { code = (error as { code?: string }).code; }
  if (code !== 'INVALID_ARGUMENT') throw new Error(`Expected INVALID_ARGUMENT, got ${code}`);
});
