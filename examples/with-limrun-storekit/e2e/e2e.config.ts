import type { E2EConfig } from 'e2e';
import { mobile } from '@e2e-dev/mobile';
import { limrun } from '@e2e-dev/limrun';

export default {
  projectId: 'dev.e2e.limrun-storekit',
  tests: 'tests/**/*.e2e.ts',
  workers: 1,
  targets: [{
    name: 'ios',
    engine: mobile({ platform: 'ios', device: limrun({ ios: { model: 'ipad' } }), transition: 2000 }),
    app: { bundleId: 'dev.e2e.storekit', appPath: process.env.STOREKIT_IOS_APP },
  }],
} satisfies E2EConfig;
