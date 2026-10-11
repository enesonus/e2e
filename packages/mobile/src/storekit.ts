import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TestError, raceAbort, rejectUnknownKeys } from 'e2e/engine';
import { runCommand } from './errors.ts';
import { LeaseInputState } from './input-state.ts';
import type { MobilePlatform } from './options.ts';
import type { StoreKitConfig, DeviceStoreKitProvider, DeviceControlContext, DeviceLease } from './provider.ts';
import { unsupported } from './support.ts';

function validateBundleId(bundleId: string): void {
  if (typeof bundleId !== 'string' || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleId)) {
    throw new TestError('INVALID_ARGUMENT', 'device.storekit needs a bundle ID such as "com.example.app"');
  }
}

/** Tracks every affected app so a partial failure cannot leave a catalog in the next attempt. */
export class LeaseStoreKit {
  private binding: { provider: DeviceStoreKitProvider; lease: DeviceLease; context: Omit<DeviceControlContext, 'signal'>; root: string; state: LeaseInputState } | undefined;
  private pending: Promise<void> = Promise.resolve();

  init(provider: DeviceStoreKitProvider | undefined, lease: DeviceLease | undefined, platform: MobilePlatform, root: string, env: DeviceControlContext['env'], runId = '', targetName = ''): void {
    this.binding = platform !== 'ios' || provider === undefined || lease === undefined ? undefined : { provider, lease, context: { platform, env }, root, state: new LeaseInputState(root, runId, targetName, lease.id, 'storekit') };
  }

  async setConfig(config: StoreKitConfig, signal: AbortSignal): Promise<void> {
    const binding = this.requireBinding();
    if (config === null || typeof config !== 'object') throw new TestError('INVALID_ARGUMENT', 'device.storekit.setConfig needs a bundle ID and a catalog source');
    rejectUnknownKeys('device.storekit.setConfig()', config, ['bundleId', 'source'], 'INVALID_ARGUMENT');
    validateBundleId(config.bundleId);
    if (typeof config.source !== 'string' || config.source.trim() === '') throw new TestError('INVALID_ARGUMENT', 'device.storekit.setConfig needs a local .storekit source path');
    const source = path.resolve(binding.root, config.source);
    await this.enqueue('device.storekit.setConfig', signal, async () => {
      const contents = await readFile(source, { encoding: 'utf8', signal }).catch((cause: unknown) => {
        signal.throwIfAborted();
        throw new TestError('INVALID_ARGUMENT', `StoreKit source is not a readable file: ${source}`, { cause });
      });
      let catalog: unknown;
      try { catalog = JSON.parse(contents); }
      catch { throw new TestError('INVALID_ARGUMENT', `StoreKit source must contain a JSON object: ${source}`); }
      if (catalog === null || typeof catalog !== 'object' || Array.isArray(catalog)) throw new TestError('INVALID_ARGUMENT', `StoreKit source must contain a JSON object: ${source}`);
      signal.throwIfAborted();
      // A provider can apply the catalog before reporting an error. Cleanup is owed from dispatch.
      await binding.state.mark(config.bundleId);
      await binding.provider.setConfig(binding.lease, { ...config, source }, { ...binding.context, signal });
    });
  }

  async clearConfig(bundleId: string, signal: AbortSignal): Promise<void> {
    const binding = this.requireBinding();
    validateBundleId(bundleId);
    await this.enqueue('device.storekit.clearConfig', signal, async () => {
      await binding.provider.clearConfig(binding.lease, bundleId, { ...binding.context, signal });
      await binding.state.clear(bundleId);
    });
  }

  async reset(signal: AbortSignal): Promise<void> {
    await raceAbort(this.pending, signal, 'settling StoreKit operations');
    const dirty = await this.binding?.state.pending() ?? [];
    const results = await Promise.allSettled(dirty.map((bundleId) => this.clearConfig(bundleId, signal)));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed !== undefined) throw failed.reason;
  }

  private requireBinding() {
    if (this.binding === undefined) throw unsupported('device.storekit requires iOS and a device provider with StoreKit configuration, such as @e2e-dev/limrun');
    return this.binding;
  }

  private async enqueue(label: string, signal: AbortSignal, run: () => Promise<void>): Promise<void> {
    const pending = this.pending.then(async () => {
      signal.throwIfAborted();
      await run();
    });
    this.pending = pending.catch(() => undefined);
    await runCommand(label, () => pending, signal);
  }
}
