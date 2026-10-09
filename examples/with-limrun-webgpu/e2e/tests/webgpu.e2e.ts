import { expect } from 'e2e';
import { test } from '@e2e-dev/mobile';

test('executes compute work and reads the rendered triangle pixels', async ({ app, screen }) => {
  await app.open();
  await expect(screen.getByText('WebGPU ready', { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(screen.getByText('Compute: 2, 4, 6, 8', { exact: true })).toBeVisible();
  await expect(screen.getByText('Center pixel: 0, 255, 0, 255', { exact: true })).toBeVisible();
  await expect(screen.getByText('Corner pixel: 0, 0, 0, 255', { exact: true })).toBeVisible();
  await app.screenshot('green-triangle');
});

test('changes the GPU input and recomputes both results', async ({ app, screen }) => {
  await app.open();
  await screen.getByRole('button', { name: 'Triple values', exact: true }).click();
  await expect(screen.getByText('Compute: 3, 6, 9, 12', { exact: true })).toBeVisible();
  await expect(screen.getByText('Center pixel: 0, 0, 255, 255', { exact: true })).toBeVisible();
  await app.screenshot('blue-triangle');
  await screen.getByRole('button', { name: 'Double values', exact: true }).click();
  await expect(screen.getByText('Compute: 2, 4, 6, 8', { exact: true })).toBeVisible();
  await expect(screen.getByText('Center pixel: 0, 255, 0, 255', { exact: true })).toBeVisible();
});

test('rejects invalid shader code and can still execute valid work', async ({ app, screen }) => {
  await app.open();
  await screen.getByRole('button', { name: 'Test invalid shader', exact: true }).click();
  await expect(screen.getByText('Invalid shader rejected', { exact: true })).toBeVisible();
  await screen.getByRole('button', { name: 'Triple values', exact: true }).click();
  await expect(screen.getByText('Compute: 3, 6, 9, 12', { exact: true })).toBeVisible();
});

test('starts a new GPU session after an app restart', async ({ app, screen }) => {
  await app.open();
  await screen.getByRole('button', { name: 'Triple values', exact: true }).click();
  await expect(screen.getByText('Compute: 3, 6, 9, 12', { exact: true })).toBeVisible();
  await app.restart();
  await expect(screen.getByText('Compute: 2, 4, 6, 8', { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(screen.getByText('Center pixel: 0, 255, 0, 255', { exact: true })).toBeVisible();
});
