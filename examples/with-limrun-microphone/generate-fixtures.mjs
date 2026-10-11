import { mkdir, writeFile } from 'node:fs/promises';

// PCM avoids decoder differences; integer cycles make looping tones continuous.
await mkdir(new URL('fixtures/', import.meta.url), { recursive: true });
for (const frequency of [0, 440, 1000]) {
  const rate = 16000;
  const count = rate * 4;
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) wav.writeInt16LE(Math.round(12000 * Math.sin(2 * Math.PI * frequency * i / rate)), 44 + i * 2);
  await writeFile(new URL(`fixtures/${frequency === 0 ? 'silence' : frequency}.wav`, import.meta.url), wav);
}
