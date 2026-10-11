import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { LeaseInputState } from '../../src/input-state.ts';

let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'e2e-input-state-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it.each(['camera', 'microphone', 'storekit'] as const)('keeps %s cleanup separate for equal lease IDs on different targets', async (kind) => {
  const first = new LeaseInputState(root, 'run', 'first-target', 'lease-1', kind);
  const second = new LeaseInputState(root, 'run', 'second-target', 'lease-1', kind);
  await first.mark('input');
  await second.mark('input');
  await first.clear('input');
  const replacement = new LeaseInputState(root, 'run', 'second-target', 'lease-1', kind);
  expect(await first.pending()).toEqual([]);
  expect(await replacement.pending()).toEqual(['input']);
  await replacement.clear('input');
  expect(await second.pending()).toEqual([]);
});
