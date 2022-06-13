import { PlaywrightTestConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

const config: PlaywrightTestConfig = {
  testDir: 'apps/calendar/playwright',
  testMatch: '*.e2e.ts',
  fullyParallel: !isCI,
  timeout: 30000,
  forbidOnly: isCI,
  workers: isCI ? 2 : undefined,
  use: {
    trace: isCI ? undefined : 'retain-on-failure',
    viewport: {
      width: 1600,
      height: 900,
    },
    launchOptions: {
      slowMo: 250,
    },
    timezoneId: 'Asia/Seoul',
  },
  webServer: {
    command: isCI ? 'npm run serve:storybook' : 'npm run storybook --workspace=@toast-ui/calendar',
    port: isCI ? 8080 : 6006,
    timeout: 120 * 1000,
    reuseExistingServer: !isCI,
  },
  projects: [
    {
      name: 'Chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ].concat(
    isCI
      ? [
          {
            name: 'Safari',
            use: { ...devices['Desktop Safari'] },
          },
          {
            name: 'Firefox',
            use: { ...devices['Desktop Firefox'] },
          },
        ]
      : ([] as any)
  ),
};

export default config;
