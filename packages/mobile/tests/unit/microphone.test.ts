import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LeaseMicrophone } from '../../src/microphone.ts';
import type { DeviceMicrophoneProvider, DeviceProvider } from '../../src/provider.ts';
import { boot, harness, PROJECT_ROOT } from '../helpers/harness.ts';
import { ignoreTrace, noSecrets } from '../helpers/secrets.ts';

let root: string;
const signal = () => new AbortController().signal;
const lease = { id: 'device-1', client: { stateDir: '/daemon' } };
const feed = { source: 'tone.wav' };

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'e2e-microphone-'));
  await writeFile(path.join(root, feed.source), 'fixture audio');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

function configuredMicrophone(provider: DeviceMicrophoneProvider = { mockAudio: vi.fn(async () => {}), clear: vi.fn(async () => {}) }) {
  const microphone = new LeaseMicrophone();
  microphone.init(provider, lease, 'ios', root, { TOKEN: 'run-token' });
  return { microphone, provider };
}

it('resolves media relative to the project and passes the worker environment and lease', async () => {
  const c = configuredMicrophone();
  await c.microphone.mockAudio({ ...feed, loop: false }, signal());
  expect(c.provider.mockAudio).toHaveBeenCalledWith(lease, { ...feed, source: path.join(root, feed.source), loop: false }, { platform: 'ios', env: { TOKEN: 'run-token' }, signal: expect.any(AbortSignal) });
  await c.microphone.reset(signal());
  await c.microphone.reset(signal());
  expect(c.provider.clear).toHaveBeenCalledTimes(1);
});

it('reports unsupported providers and invalid media before changing the microphone', async () => {
  const unsupported = new LeaseMicrophone();
  await expect(unsupported.mockAudio(feed, signal())).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
  await expect(unsupported.clear(signal())).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
  const c = configuredMicrophone();
  await expect(c.microphone.mockAudio({ ...feed, source: 'missing.wav' }, signal())).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  await expect(c.microphone.mockAudio({ ...feed, volume: 1 } as typeof feed, signal())).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', message: expect.stringContaining('volume') });
  expect(c.provider.mockAudio).not.toHaveBeenCalled();
});

it('waits for a late upload before resetting it after cancellation', async () => {
  let finish!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const events: string[] = [];
  const c = configuredMicrophone({
    async mockAudio() { events.push('upload'); markStarted(); await new Promise<void>((resolve) => { finish = resolve; }); events.push('applied'); },
    async clear() { events.push('clear'); },
  });
  const controller = new AbortController();
  const upload = c.microphone.mockAudio(feed, controller.signal);
  await started;
  controller.abort();
  await expect(upload).rejects.toMatchObject({ code: 'CANCELLED' });
  const reset = c.microphone.reset(signal());
  await Promise.resolve();
  expect(events).toEqual(['upload']);
  finish();
  await reset;
  expect(events).toEqual(['upload', 'applied', 'clear']);
});

it('clears after a failed upload and retries a failed reset', async () => {
  const clear = vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue(undefined);
  const c = configuredMicrophone({ mockAudio: async () => { throw new Error('upload failed after applying'); }, clear });
  await expect(c.microphone.mockAudio(feed, signal())).rejects.toThrow(/upload failed/);
  await expect(c.microphone.reset(signal())).rejects.toThrow(/connection lost/);
  await c.microphone.reset(signal());
  expect(clear).toHaveBeenCalledTimes(2);
});

it('cleans the travelled worker lease on endAttempt and disposal, including the next attempt after cleanup failure', async () => {
  const clear = vi.fn(async () => {});
  const provider: DeviceProvider = { name: 'microphone-cloud', acquire: async () => ({ ...lease, privateField: 'runner-only' }), release: async () => {}, microphone: { mockAudio: vi.fn(async () => {}), clear } };
  const runner = harness({ device: provider });
  const prepared = await runner.prepare({ runId: 'run', targetName: 'ios', projectRoot: PROJECT_ROOT, slots: 1, env: {}, signal: signal(), headed: false, log() {} });
  const worker = harness({ device: provider });
  await boot(worker, 'ios', 0, prepared?.env, root);
  const start = () => worker.engine.startAttempt!({ attemptId: 'a1', artifactsDir: root, signal: signal(), resolveSecret: noSecrets, ...ignoreTrace });
  const cleanup = () => ({ signal: signal(), timeoutMs: 5000 });
  await start();
  await worker.surface.microphone.mockAudio({ ...feed, source: path.join(root, feed.source) }, signal());
  clear.mockRejectedValueOnce(new Error('reset failed'));
  await expect(worker.engine.endAttempt!(cleanup())).rejects.toThrow(/reset failed/);
  expect(clear).toHaveBeenCalledWith(lease, expect.objectContaining({ platform: 'ios' }));
  await start();
  await worker.surface.microphone.mockAudio({ ...feed, source: path.join(root, feed.source) }, signal());
  await worker.engine.dispose!(cleanup());
  expect(clear).toHaveBeenCalledTimes(3);
});

it('still clears microphone audio when camera cleanup fails', async () => {
  const clear = vi.fn(async () => {});
  const provider: DeviceProvider = {
    name: 'media-cloud', acquire: async () => lease, release: async () => {},
    camera: { mockFeed: async () => {}, clear: async () => { throw new Error('camera reset failed'); } },
    microphone: { mockAudio: async () => {}, clear },
  };
  const runner = harness({ device: provider });
  const prepared = await runner.prepare({ runId: 'run', targetName: 'ios', projectRoot: PROJECT_ROOT, slots: 1, env: {}, signal: signal(), headed: false, log() {} });
  const worker = harness({ device: provider });
  await boot(worker, 'ios', 0, prepared?.env, root);
  await worker.engine.startAttempt!({ attemptId: 'a1', artifactsDir: root, signal: signal(), resolveSecret: noSecrets, ...ignoreTrace });
  await worker.surface.microphone.mockAudio({ source: path.join(root, feed.source) }, signal());
  await worker.surface.camera.mockFeed({ type: 'video', source: path.join(root, feed.source) }, signal());
  await expect(worker.engine.endAttempt!({ signal: signal(), timeoutMs: 5000 })).rejects.toThrow(/camera reset failed/);
  expect(clear).toHaveBeenCalledTimes(1);
});


it('a replacement worker retries cleanup after endAttempt and dispose both fail', async () => {
  const reset = vi.fn().mockRejectedValueOnce(new Error('cleanup lost')).mockRejectedValueOnce(new Error('cleanup lost')).mockResolvedValue(undefined);
  const provider: DeviceProvider = {
    name: 'microphone-cloud', acquire: async () => lease, release: async () => {},
    microphone: { mockAudio: async () => {}, clear: reset },
  };
  const runner = harness({ device: provider });
  const prepared = await runner.prepare({ runId: 'run', targetName: 'ios', projectRoot: root, slots: 1, env: {}, signal: signal(), headed: false, log() {} });
  const worker = harness({ device: provider });
  await boot(worker, 'ios', 0, prepared?.env, root);
  const attempt = { attemptId: 'a1', artifactsDir: root, signal: signal(), resolveSecret: noSecrets, ...ignoreTrace };
  const cleanup = { signal: signal(), timeoutMs: 5000 };
  await worker.engine.startAttempt!(attempt);
  await worker.surface.microphone.mockAudio({ ...feed, source: path.join(root, feed.source) }, signal());
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
