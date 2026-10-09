import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DeviceControlContext, DeviceLease, DeviceMicrophoneProvider } from '@e2e-dev/mobile';
import type { InstanceClient as IosClient } from '@limrun/api/ios-client';
import type { InstanceClient as AndroidClient } from '@limrun/api/instance-client';

type Connect = (lease: DeviceLease, context: DeviceControlContext) => Promise<IosClient | AndroidClient>;

/** A short PCM WAV replaces Android playback because its SDK has no stop command. */
function silence(): Buffer {
  const samples = 1600;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  return wav;
}

/** Controls only the travelled lease; fixed staging names bound storage to one file per device. */
export function microphoneControl(connect: Connect): DeviceMicrophoneProvider {
  return {
    async mockAudio(lease, audio, context) {
      const client = await connect(lease, context);
      try {
        context.signal.throwIfAborted();
        const destination = context.platform === 'ios' ? 'e2e-microphone' : '/data/local/tmp/e2e-microphone';
        const remote = await client.pushFile(audio.source, destination);
        context.signal.throwIfAborted();
        await client.playOnMicrophone(context.platform === 'ios' ? destination : remote, { once: audio.loop === false });
      } finally { client.disconnect(); }
    },
    async clear(lease, context) {
      const client = await connect(lease, context);
      try {
        context.signal.throwIfAborted();
        if ('stopMicrophonePlayback' in client) {
          await client.stopMicrophonePlayback();
        } else {
          const directory = await mkdtemp(path.join(tmpdir(), 'e2e-microphone-'));
          try {
            const source = path.join(directory, 'silence.wav');
            await writeFile(source, silence());
            const remote = await client.pushFile(source, '/data/local/tmp/e2e-microphone');
            context.signal.throwIfAborted();
            await client.playOnMicrophone(remote, { once: true });
          } finally { await rm(directory, { recursive: true, force: true }); }
        }
      } finally { client.disconnect(); }
    },
  };
}
