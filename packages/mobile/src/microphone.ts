import { stat } from 'node:fs/promises';
import path from 'node:path';
import { TestError, raceAbort, rejectUnknownKeys } from 'e2e/engine';
import { runCommand } from './errors.ts';
import { LeaseInputState } from './input-state.ts';
import type { MobilePlatform } from './options.ts';
import type { MicrophoneAudio, DeviceMicrophoneProvider, DeviceControlContext, DeviceLease } from './provider.ts';
import { unsupported } from './support.ts';

/** Serializes uploads and resets so a timed-out upload cannot land in the next attempt. */
export class LeaseMicrophone {
  private binding: { provider: DeviceMicrophoneProvider; lease: DeviceLease; context: Omit<DeviceControlContext, 'signal'>; root: string; state: LeaseInputState } | undefined;
  private pending: Promise<void> = Promise.resolve();

  init(provider: DeviceMicrophoneProvider | undefined, lease: DeviceLease | undefined, platform: MobilePlatform, root: string, env: DeviceControlContext['env'], runId = '', targetName = ''): void {
    this.binding = provider === undefined || lease === undefined ? undefined : { provider, lease, context: { platform, env }, root, state: new LeaseInputState(root, runId, targetName, lease.id, 'microphone') };
  }

  async mockAudio(audio: MicrophoneAudio, signal: AbortSignal): Promise<void> {
    const binding = this.requireBinding();
    if (audio === null || typeof audio !== 'object') throw new TestError('INVALID_ARGUMENT', 'device.microphone.mockAudio needs an audio source');
    rejectUnknownKeys('device.microphone.mockAudio()', audio, ['source', 'loop'], 'INVALID_ARGUMENT');
    if (typeof audio.source !== 'string' || audio.source.trim() === '' || (audio.loop !== undefined && typeof audio.loop !== 'boolean')) {
      throw new TestError('INVALID_ARGUMENT', 'device.microphone.mockAudio expects { source: "path/to/audio.wav", loop?: boolean }');
    }
    const source = path.resolve(binding.root, audio.source);
    await this.enqueue('device.microphone.mockAudio', signal, async () => {
      const file = await stat(source).catch(() => undefined);
      if (!file?.isFile()) throw new TestError('INVALID_ARGUMENT', `microphone source is not a readable file: ${source}`);
      signal.throwIfAborted();
      // The provider may apply a source before reporting an error. Cleanup is owed from dispatch.
      await binding.state.mark('audio');
      await binding.provider.mockAudio(binding.lease, { ...audio, source }, { ...binding.context, signal });
    });
  }

  async clear(signal: AbortSignal): Promise<void> {
    const binding = this.requireBinding();
    await this.enqueue('device.microphone.clear', signal, async () => {
      await binding.provider.clear(binding.lease, { ...binding.context, signal });
      await binding.state.clear('audio');
    });
  }

  async reset(signal: AbortSignal): Promise<void> {
    // Even a failed upload must settle before deciding whether the microphone needs clearing.
    await raceAbort(this.pending, signal, 'settling microphone operations');
    if (this.binding !== undefined && (await this.binding.state.pending()).length > 0) await this.clear(signal);
  }

  private requireBinding() {
    if (this.binding === undefined) throw unsupported('device.microphone requires a device provider with microphone injection, such as @e2e-dev/limrun');
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
