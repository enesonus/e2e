import { readFile } from 'node:fs/promises';
import type { DeviceControlContext, DeviceLease, DeviceStoreKitProvider } from '@e2e-dev/mobile';
import type { InstanceClient as IosClient } from '@limrun/api/ios-client';
import type { InstanceClient as AndroidClient } from '@limrun/api/instance-client';
import { TestError } from 'e2e/engine';

type Connect = (lease: DeviceLease, context: DeviceControlContext) => Promise<IosClient | AndroidClient>;

export function storekitControl(connect: Connect): DeviceStoreKitProvider {
  async function ios(lease: DeviceLease, context: DeviceControlContext) {
    if (context.platform !== 'ios') throw new TestError('UNSUPPORTED_CAPABILITY', 'Limrun StoreKit configuration requires iOS');
    const client = await connect(lease, context);
    if ('setStoreKitConfig' in client) return client;
    client.disconnect();
    throw new Error('Limrun returned a non-iOS control client for StoreKit');
  }
  return {
    async setConfig(lease, config, context) {
      const client = await ios(lease, context);
      try {
        const contents = await readFile(config.source, { signal: context.signal });
        context.signal.throwIfAborted();
        await client.setStoreKitConfig(config.bundleId, contents);
      } finally { client.disconnect(); }
    },
    async clearConfig(lease, bundleId, context) {
      const client = await ios(lease, context);
      try {
        context.signal.throwIfAborted();
        await client.clearStoreKitConfig(bundleId);
      } finally { client.disconnect(); }
    },
  };
}
