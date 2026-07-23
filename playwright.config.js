// Dev-only test config for the regression suite in tests/. Not part of the
// shipped app (which has no build step and no dependencies of its own).
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        launchOptions: {
          executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium',
          args: ['--headless=new', '--no-sandbox'],
          ignoreDefaultArgs: ['--headless=old'],
        },
      },
    },
  ],
});
