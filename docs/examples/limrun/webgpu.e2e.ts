import { expect } from 'e2e';
import { test } from '@e2e-dev/mobile';

test('executes WebGPU work with a different input', async ({ app, screen }) => {
  await app.open();
  await expect(screen.getByText('WebGPU ready', { exact: true })).toBeVisible({ timeout: 25_000 });
  await screen.getByRole('button', { name: 'Triple values', exact: true }).click();
  await expect(screen.getByText('Compute: 3, 6, 9, 12', { exact: true })).toBeVisible();
  await expect(screen.getByText('Center pixel: 0, 0, 255, 255', { exact: true })).toBeVisible();
  await app.screenshot('blue-triangle');
});
