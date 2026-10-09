import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LeaseStoreKit } from '../../src/storekit.ts';
import { asDeviceProvider, type DeviceStoreKitProvider, type DeviceProvider } from '../../src/provider.ts';
import { boot, harness, PROJECT_ROOT } from '../helpers/harness.ts';
import { ignoreTrace, noSecrets } from '../helpers/secrets.ts';

let root: string;
const signal = () => new AbortController().signal;
const lease = { id: 'device-1', client: { stateDir: '/daemon' } };
const config = { bundleId: 'com.example.app', source: 'Catalog.storekit' };
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'e2e-storekit-'));
  await writeFile(path.join(root, config.source), '{"products":[],"version":{"major":3,"minor":0}}');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
function configured(provider: DeviceStoreKitProvider = { setConfig: vi.fn(async () => {}), clearConfig: vi.fn(async () => {}) }) {
  const storekit = new LeaseStoreKit();
  storekit.init(provider, lease, 'ios', root, { TOKEN: 'run-token' });
  return { storekit, provider };
}
it('passes the resolved catalog, worker environment and travelled lease, and resets each app once', async () => {
  const c = configured();
  await c.storekit.setConfig(config, signal());
  await c.storekit.setConfig({ ...config, bundleId: 'com.example.second' }, signal());
  expect(c.provider.setConfig).toHaveBeenCalledWith(lease, { ...config, source: path.join(root, config.source) }, { platform: 'ios', env: { TOKEN: 'run-token' }, signal: expect.any(AbortSignal) });
  await c.storekit.reset(signal());
  await c.storekit.reset(signal());
  expect(c.provider.clearConfig).toHaveBeenCalledTimes(2);
});
it('rejects Android, unsupported providers and malformed provider contracts', async () => {
  const c = configured();
  c.storekit.init(c.provider, lease, 'android', root, {});
  await expect(c.storekit.setConfig(config, signal())).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
  await expect(new LeaseStoreKit().clearConfig(config.bundleId, signal())).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
  expect(c.provider.setConfig).not.toHaveBeenCalled();
  expect(() => asDeviceProvider({ name: 'bad', acquire() {}, release() {}, storekit: { setConfig() {} } })).toThrow(/clearConfig/);
});
it('rejects invalid bundle IDs, unknown options, missing files and non-object JSON before dispatch', async () => {
  const c = configured();
  for (const bundleId of ['', '../app', 'com..app', '.app', 'com/example']) {
    await expect(c.storekit.setConfig({ ...config, bundleId }, signal())).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(c.storekit.clearConfig(bundleId, signal())).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  }
  await expect(c.storekit.setConfig({ ...config, resetTransactions: true } as typeof config, signal())).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', message: expect.stringContaining('resetTransactions') });
  await expect(c.storekit.setConfig({ ...config, source: 'missing.storekit' }, signal())).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  for (const content of ['{', 'null', '[]', 'true']) {
    await writeFile(path.join(root, config.source), content);
    await expect(c.storekit.setConfig(config, signal())).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  }
  expect(c.provider.setConfig).not.toHaveBeenCalled();
});
it('waits for a late catalog upload before cleanup after cancellation', async () => {
  let finish!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const events: string[] = [];
  const c = configured({
    async setConfig() { events.push('upload'); markStarted(); await new Promise<void>((resolve) => { finish = resolve; }); events.push('applied'); },
    async clearConfig() { events.push('clear'); },
  });
  const controller = new AbortController();
  const upload = c.storekit.setConfig(config, controller.signal);
  await started;
  controller.abort();
  await expect(upload).rejects.toMatchObject({ code: 'CANCELLED' });
  const reset = c.storekit.reset(signal());
  await Promise.resolve();
  expect(events).toEqual(['upload']);
  finish();
  await reset;
  expect(events).toEqual(['upload', 'applied', 'clear']);
});
it('clears every app after a partial upload failure and retries only failed cleanup', async () => {
  const clearConfig = vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue(undefined);
  const c = configured({ setConfig: vi.fn().mockRejectedValueOnce(new Error('applied before error')).mockResolvedValue(undefined), clearConfig });
  await expect(c.storekit.setConfig(config, signal())).rejects.toThrow(/applied before error/);
  await c.storekit.setConfig({ ...config, bundleId: 'com.example.second' }, signal());
  await expect(c.storekit.reset(signal())).rejects.toThrow(/connection lost/);
  expect(clearConfig).toHaveBeenCalledTimes(2);
  await c.storekit.reset(signal());
  expect(clearConfig).toHaveBeenCalledTimes(3);
  expect(clearConfig.mock.calls[2]![1]).toBe(clearConfig.mock.calls[0]![1]);
});
it('does not reset an explicitly cleared catalog again', async () => {
  const c = configured();
  await c.storekit.setConfig(config, signal());
  await c.storekit.clearConfig(config.bundleId, signal());
  await c.storekit.reset(signal());
  expect(c.provider.clearConfig).toHaveBeenCalledTimes(1);
});
it('cleans catalogs even when camera cleanup fails, then retries on the next attempt and disposal', async () => {
  const clearConfig = vi.fn(async () => {});
  const provider: DeviceProvider = {
    name: 'storekit-cloud', acquire: async () => ({ ...lease, privateField: 'runner-only' }), release: async () => {},
    camera: { mockFeed: async () => {}, clear: async () => { throw new Error('camera reset failed'); } },
    storekit: { setConfig: async () => {}, clearConfig },
  };
  const runner = harness({ device: provider });
  const prepared = await runner.prepare({ runId: 'run', targetName: 'ios', projectRoot: PROJECT_ROOT, slots: 1, env: {}, signal: signal(), headed: false, log() {} });
  const worker = harness({ device: provider });
  await boot(worker, 'ios', 0, prepared?.env, root);
  const start = () => worker.engine.startAttempt!({ attemptId: 'a1', artifactsDir: root, signal: signal(), resolveSecret: noSecrets, ...ignoreTrace });
  const cleanup = () => ({ signal: signal(), timeoutMs: 5000 });
  await start();
  await worker.surface.storekit.setConfig({ ...config, source: path.join(root, config.source) }, signal());
  await worker.surface.camera.mockFeed({ type: 'video', source: path.join(root, config.source) }, signal());
  clearConfig.mockRejectedValueOnce(new Error('catalog reset failed'));
  await expect(worker.engine.endAttempt!(cleanup())).rejects.toThrow(/camera reset failed/);
  expect(clearConfig).toHaveBeenCalledWith(lease, config.bundleId, expect.objectContaining({ platform: 'ios' }));
  await expect(start()).rejects.toThrow(/camera reset failed/);
  expect(clearConfig).toHaveBeenCalledTimes(2);
  await worker.surface.storekit.setConfig({ ...config, source: path.join(root, config.source) }, signal());
  await worker.engine.dispose!(cleanup());
  expect(clearConfig).toHaveBeenCalledTimes(3);
});


it('a replacement worker retries cleanup after endAttempt and dispose both fail', async () => {
  const reset = vi.fn().mockRejectedValueOnce(new Error('cleanup lost')).mockRejectedValueOnce(new Error('cleanup lost')).mockResolvedValue(undefined);
  const provider: DeviceProvider = {
    name: 'storekit-cloud', acquire: async () => lease, release: async () => {},
    storekit: { setConfig: async () => {}, clearConfig: reset },
  };
  const runner = harness({ device: provider });
  const prepared = await runner.prepare({ runId: 'run', targetName: 'ios', projectRoot: root, slots: 1, env: {}, signal: signal(), headed: false, log() {} });
  const worker = harness({ device: provider });
  await boot(worker, 'ios', 0, prepared?.env, root);
  const attempt = { attemptId: 'a1', artifactsDir: root, signal: signal(), resolveSecret: noSecrets, ...ignoreTrace };
  const cleanup = { signal: signal(), timeoutMs: 5000 };
  await worker.engine.startAttempt!(attempt);
  await worker.surface.storekit.setConfig({ ...config, source: path.join(root, config.source) }, signal());
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
