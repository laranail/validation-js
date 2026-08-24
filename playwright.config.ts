import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'js/e2e',
    fullyParallel: true,
    // The bundle the specs inject is built by the webServer-less global
    // setup below; keep runs hermetic and offline.
    use: { browserName: 'chromium' },
    globalSetup: './js/e2e/global-setup.ts',
});
