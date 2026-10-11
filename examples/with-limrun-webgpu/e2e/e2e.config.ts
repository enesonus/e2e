import type { E2EConfig } from 'e2e';
import { mobile } from '@e2e-dev/mobile';
import { limrun } from '@e2e-dev/limrun';

export default {
  projectId: 'dev.e2e.limrun-webgpu',
  tests: 'tests/**/*.e2e.ts',
  workers: 1,
  targets: [{
    name: 'ios',
    engine: mobile({ platform: 'ios', device: limrun() }),
    app: { bundleId: 'dev.e2e.webgpu', appPath: process.env.WEBGPU_IOS_APP },
  }],
} satisfies E2EConfig;
