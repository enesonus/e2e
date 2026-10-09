import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const root = new URL('./fixtures/', import.meta.url);
await mkdir(root, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'camera-qr-'));
try {
  for (const [name, payload] of [['valid', 'e2e://camera/accepted'], ['invalid', 'e2e://camera/unknown']]) {
    const png = path.join(temporary, `${name}.png`);
    await QRCode.toFile(png, payload, { width: 400, margin: 4, errorCorrectionLevel: 'M' });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', png, '-vf', 'pad=640:480:(ow-iw)/2:(oh-ih)/2:white', '-t', '3', '-r', '15', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fileURLToPath(new URL(`${name}.mp4`, root))]);
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=640x480:r=15', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fileURLToPath(new URL('blank.mp4', root))]);
} finally { await rm(temporary, { recursive: true, force: true }); }
