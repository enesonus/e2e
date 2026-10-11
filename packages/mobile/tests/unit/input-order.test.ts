import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LeaseCamera } from '../../src/camera.ts';
import { LeaseMicrophone } from '../../src/microphone.ts';
import { LeaseStoreKit } from '../../src/storekit.ts';
import type { DeviceProvider } from '../../src/provider.ts';
import { boot, harness } from '../helpers/harness.ts';
import { ignoreTrace, noSecrets } from '../helpers/secrets.ts';

let root: string;
const signal = () => new AbortController().signal;
const lease = { id: 'same-lease', client: { stateDir: '/daemon' } };
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'e2e-input-order-'));
  await writeFile(path.join(root, 'input'), '{}');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it.each(['camera', 'microphone', 'storekit'] as const)('queues %s file validation before clear and reset', async (kind) => {
  for (const cleanup of ['clear', 'reset']) {
    const events: string[] = [];
    const apply = async () => { events.push('apply'); };
    const clear = async () => { events.push('clear'); };
    const camera = new LeaseCamera();
    const microphone = new LeaseMicrophone();
    const storekit = new LeaseStoreKit();
    camera.init({ mockFeed: apply, clear }, lease, 'ios', root, {});
    microphone.init({ mockAudio: apply, clear }, lease, 'ios', root, {});
    storekit.init({ setConfig: apply, clearConfig: clear }, lease, 'ios', root, {});
    const upload = kind === 'camera' ? camera.mockFeed({ type: 'video', source: 'input' }, signal())
      : kind === 'microphone' ? microphone.mockAudio({ source: 'input' }, signal())
      : storekit.setConfig({ bundleId: 'com.example.app', source: 'input' }, signal());
    const reset = cleanup === 'reset' ? { camera, microphone, storekit }[kind].reset(signal())
      : kind === 'camera' ? camera.clear(signal())
      : kind === 'microphone' ? microphone.clear(signal())
      : storekit.clearConfig('com.example.app', signal());
    await Promise.all([upload, reset]);
    expect(events).toEqual(['apply', 'clear']);
  }
});

it('classifies cancellation while reading a catalog as CANCELLED', async () => {
  const storekit = new LeaseStoreKit();
  let applied = false;
  storekit.init({ setConfig: async () => { applied = true; }, clearConfig: async () => {} }, lease, 'ios', root, {});
  const controller = new AbortController();
  const upload = storekit.setConfig({ bundleId: 'com.example.app', source: 'input' }, controller.signal);
  controller.abort();
  await expect(upload).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(applied).toBe(false);
});

it.each(['camera', 'microphone', 'storekit'] as const)('preserves %s cleanup when another target clears an equal lease ID', async (kind) => {
  const clear = vi.fn(async () => {});
  const provider: DeviceProvider = {
    name: 'cloud', acquire: async () => ({ ...lease, deviceId: 'device' }), release: async () => {},
    camera: { mockFeed: async () => {}, clear },
    microphone: { mockAudio: async () => {}, clear },
    storekit: { setConfig: async () => {}, clearConfig: clear },
  };
  const environments = [];
  for (const targetName of ['first', 'second']) {
    const runner = harness({ device: provider });
    const prepared = await runner.prepare({ runId: 'run-1', targetName, projectRoot: root, slots: 1, env: {}, signal: signal(), headed: false, log() {} });
    environments.push(prepared?.env);
    const worker = harness({ device: provider });
    await boot(worker, targetName, 0, prepared?.env, root);
    const source = path.join(root, 'input');
    if (kind === 'camera') await worker.surface.camera.mockFeed({ type: 'video', source }, signal());
    if (kind === 'microphone') await worker.surface.microphone.mockAudio({ source }, signal());
    if (kind === 'storekit') await worker.surface.storekit.setConfig({ bundleId: 'com.example.app', source }, signal());
  }
  for (const [index, targetName] of ['first', 'second'].entries()) {
    const replacement = harness({ device: provider });
    await boot(replacement, targetName, 0, environments[index], root);
    await replacement.engine.startAttempt!({ attemptId: targetName, artifactsDir: root, signal: signal(), resolveSecret: noSecrets, ...ignoreTrace });
  }
  expect(clear).toHaveBeenCalledTimes(2);
});
