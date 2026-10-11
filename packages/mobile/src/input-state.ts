import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Keeps cleanup obligations across worker replacement, before a provider can apply an input. */
export class LeaseInputState {
  private readonly directory: string;

  constructor(root: string, runId: string, targetName: string, leaseId: string, kind: 'camera' | 'microphone' | 'storekit') {
    const key = createHash('sha256').update(JSON.stringify([runId, targetName, leaseId])).digest('hex');
    this.directory = path.join(root, '.e2e', 'device-inputs', key, kind);
  }

  async mark(key: string): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(this.directory, key), '', { mode: 0o600 });
  }

  async clear(key: string): Promise<void> {
    await rm(path.join(this.directory, key), { force: true });
  }

  async pending(): Promise<string[]> {
    try { return await readdir(this.directory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
}
