import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LeaseCamera } from '../../src/camera.ts';
import type { DeviceCameraProvider, DeviceProvider } from '../../src/provider.ts';
import { boot, harness, PROJECT_ROOT } from '../helpers/harness.ts';
import { ignoreTrace, noSecrets } from '../helpers/secrets.ts';

let root: string;
const signal = () => new AbortController().signal;
const lease = { id: 'device-1', client: { stateDir: '/daemon' } };
const feed = { type: 'video' as const, source: 'qr.mp4' };

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'e2e-camera-'));
  await writeFile(path.join(root, feed.source), 'fixture video');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

function configuredCamera(provider: DeviceCameraProvider = { mockFeed: vi.fn(async () => {}), clear: vi.fn(async () => {}) }) {
  const camera = new LeaseCamera();
  camera.init(provider, lease, 'ios', root, { TOKEN: 'run-token' });
  return { camera, provider };
}

it('resolves media relative to the project and passes the worker environment and lease', async () => {
  const c = configuredCamera();
  await c.camera.mockFeed({ ...feed, loop: false }, signal());
  expect(c.provider.mockFeed).toHaveBeenCalledWith(lease, { ...feed, source: path.join(root, feed.source), loop: false }, { platform: 'ios', env: { TOKEN: 'run-token' }, signal: expect.any(AbortSignal) });
  await c.camera.reset(signal());
  await c.camera.reset(signal());
  expect(c.provider.clear).toHaveBeenCalledTimes(1);
});

it('reports unsupported providers and invalid media before changing the camera', async () => {
  const unsupported = new LeaseCamera();
  await expect(unsupported.mockFeed(feed, signal())).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
  await expect(unsupported.clear(signal())).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
  const c = configuredCamera();
  await expect(c.camera.mockFeed({ ...feed, source: 'missing.mp4' }, signal())).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  await expect(c.camera.mockFeed({ ...feed, facing: 'front' } as typeof feed, signal())).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', message: expect.stringContaining('facing') });
  expect(c.provider.mockFeed).not.toHaveBeenCalled();
});

it('waits for a late upload before resetting it after cancellation', async () => {
  let finish!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const events: string[] = [];
  const c = configuredCamera({
    async mockFeed() { events.push('upload'); markStarted(); await new Promise<void>((resolve) => { finish = resolve; }); events.push('applied'); },
    async clear() { events.push('clear'); },
  });
  const controller = new AbortController();
  const upload = c.camera.mockFeed(feed, controller.signal);
  await started;
  controller.abort();
  await expect(upload).rejects.toMatchObject({ code: 'CANCELLED' });
  const reset = c.camera.reset(signal());
  await Promise.resolve();
  expect(events).toEqual(['upload']);
  finish();
  await reset;
  expect(events).toEqual(['upload', 'applied', 'clear']);
});

it('clears after a failed upload and retries a failed reset', async () => {
  const clear = vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue(undefined);
  const c = configuredCamera({ mockFeed: async () => { throw new Error('upload failed after applying'); }, clear });
  await expect(c.camera.mockFeed(feed, signal())).rejects.toThrow(/upload failed/);
  await expect(c.camera.reset(signal())).rejects.toThrow(/connection lost/);
  await c.camera.reset(signal());
  expect(clear).toHaveBeenCalledTimes(2);
});

it('cleans the travelled worker lease on endAttempt and disposal, including the next attempt after cleanup failure', async () => {
  const clear = vi.fn(async () => {});
  const provider: DeviceProvider = { name: 'camera-cloud', acquire: async () => ({ ...lease, privateField: 'runner-only' }), release: async () => {}, camera: { mockFeed: vi.fn(async () => {}), clear } };
  const runner = harness({ device: provider });
  const prepared = await runner.prepare({ runId: 'run', targetName: 'ios', projectRoot: PROJECT_ROOT, slots: 1, env: {}, signal: signal(), headed: false, log() {} });
  const worker = harness({ device: provider });
  await boot(worker, 'ios', 0, prepared?.env, root);
  const start = () => worker.engine.startAttempt!({ attemptId: 'a1', artifactsDir: root, signal: signal(), resolveSecret: noSecrets, ...ignoreTrace });
  const cleanup = () => ({ signal: signal(), timeoutMs: 5000 });
  await start();
  await worker.surface.camera.mockFeed({ ...feed, source: path.join(root, feed.source) }, signal());
  clear.mockRejectedValueOnce(new Error('reset failed'));
  await expect(worker.engine.endAttempt!(cleanup())).rejects.toThrow(/reset failed/);
  expect(clear).toHaveBeenCalledWith(lease, expect.objectContaining({ platform: 'ios' }));
  await start();
  await worker.surface.camera.mockFeed({ ...feed, source: path.join(root, feed.source) }, signal());
  await worker.engine.dispose!(cleanup());
  expect(clear).toHaveBeenCalledTimes(3);
});


it('a replacement worker retries cleanup after endAttempt and dispose both fail', async () => {
  const reset = vi.fn().mockRejectedValueOnce(new Error('cleanup lost')).mockRejectedValueOnce(new Error('cleanup lost')).mockResolvedValue(undefined);
  const provider: DeviceProvider = {
    name: 'camera-cloud', acquire: async () => lease, release: async () => {},
    camera: { mockFeed: async () => {}, clear: reset },
  };
  const runner = harness({ device: provider });
  const prepared = await runner.prepare({ runId: 'run', targetName: 'ios', projectRoot: root, slots: 1, env: {}, signal: signal(), headed: false, log() {} });
  const worker = harness({ device: provider });
  await boot(worker, 'ios', 0, prepared?.env, root);
  const attempt = { attemptId: 'a1', artifactsDir: root, signal: signal(), resolveSecret: noSecrets, ...ignoreTrace };
  const cleanup = { signal: signal(), timeoutMs: 5000 };
  await worker.engine.startAttempt!(attempt);
  await worker.surface.camera.mockFeed({ ...feed, source: path.join(root, feed.source) }, signal());
  await expect(worker.engine.endAttempt!(cleanup)).rejects.toThrow(/cleanup lost/);
  await worker.engine.dispose!(cleanup);
  expect(reset).toHaveBeenCalledTimes(2);

  const replacement = harness({ device: provider });
  await boot(replacement, 'ios', 0, prepared?.env, root);
  await replacement.engine.startAttempt!({ ...attempt, attemptId: 'a2' });
  expect(reset).toHaveBeenCalledTimes(3);
  await replacement.engine.endAttempt!(cleanup);
  expect(reset).toHaveBeenCalledTimes(3);
});
