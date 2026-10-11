import type { E2EConfig } from 'e2e';
import { mobile } from '@e2e-dev/mobile';
import { limrun } from '@e2e-dev/limrun';

export default {
  projectId: 'dev.e2e.limrun-microphone',
  tests: 'tests/**/*.e2e.ts',
  workers: 1,
  targets: [{
    name: 'ios',
    engine: mobile({ platform: 'ios', device: limrun() }),
    app: {
      bundleId: 'dev.e2e.microphone',
      appPath: process.env.MICROPHONE_IOS_APP,
      permissions: { microphone: 'grant' },
    },
  }, {
    name: 'android',
    engine: mobile({ platform: 'android', device: limrun() }),
    app: {
      bundleId: 'dev.e2e.microphone',
      appPath: process.env.MICROPHONE_ANDROID_APP,
      permissions: { microphone: 'grant' },
    },
  }],
} satisfies E2EConfig;
