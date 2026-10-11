import { stat } from 'node:fs/promises';
import path from 'node:path';
import { TestError, raceAbort, rejectUnknownKeys } from 'e2e/engine';
import { runCommand } from './errors.ts';
import { LeaseInputState } from './input-state.ts';
import type { MobilePlatform } from './options.ts';
import type { CameraFeed, DeviceCameraProvider, DeviceControlContext, DeviceLease } from './provider.ts';
import { unsupported } from './support.ts';

/** Serializes uploads and resets so a timed-out upload cannot land in the next attempt. */
export class LeaseCamera {
  private binding: { provider: DeviceCameraProvider; lease: DeviceLease; context: Omit<DeviceControlContext, 'signal'>; root: string; state: LeaseInputState } | undefined;
  private pending: Promise<void> = Promise.resolve();

  init(provider: DeviceCameraProvider | undefined, lease: DeviceLease | undefined, platform: MobilePlatform, root: string, env: DeviceControlContext['env'], runId = '', targetName = ''): void {
    this.binding = provider === undefined || lease === undefined ? undefined : { provider, lease, context: { platform, env }, root, state: new LeaseInputState(root, runId, targetName, lease.id, 'camera') };
  }

  async mockFeed(feed: CameraFeed, signal: AbortSignal): Promise<void> {
    const binding = this.requireBinding();
    if (feed === null || typeof feed !== 'object') throw new TestError('INVALID_ARGUMENT', 'device.camera.mockFeed needs a video source');
    rejectUnknownKeys('device.camera.mockFeed()', feed, ['type', 'source', 'loop'], 'INVALID_ARGUMENT');
    if (feed.type !== 'video' || typeof feed.source !== 'string' || feed.source.trim() === '' || (feed.loop !== undefined && typeof feed.loop !== 'boolean')) {
      throw new TestError('INVALID_ARGUMENT', 'device.camera.mockFeed expects { type: "video", source: "path/to/video.mp4", loop?: boolean }');
    }
    const source = path.resolve(binding.root, feed.source);
    await this.enqueue('device.camera.mockFeed', signal, async () => {
      const file = await stat(source).catch(() => undefined);
      if (!file?.isFile()) throw new TestError('INVALID_ARGUMENT', `camera source is not a readable file: ${source}`);
      signal.throwIfAborted();
      // The provider may apply a source before reporting an error. Cleanup is owed from dispatch.
      await binding.state.mark('feed');
      await binding.provider.mockFeed(binding.lease, { ...feed, source }, { ...binding.context, signal });
    });
  }

  async clear(signal: AbortSignal): Promise<void> {
    const binding = this.requireBinding();
    await this.enqueue('device.camera.clear', signal, async () => {
      await binding.provider.clear(binding.lease, { ...binding.context, signal });
      await binding.state.clear('feed');
    });
  }

  async reset(signal: AbortSignal): Promise<void> {
    // Even a failed upload must settle before deciding whether the camera needs clearing.
    await raceAbort(this.pending, signal, 'settling camera operations');
    if (this.binding !== undefined && (await this.binding.state.pending()).length > 0) await this.clear(signal);
  }

  private requireBinding() {
    if (this.binding === undefined) throw unsupported('device.camera requires a device provider with camera injection, such as @e2e-dev/limrun');
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
