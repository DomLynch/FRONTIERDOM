import { defineConfig, devices } from '@playwright/test';
if (!process.env.FRONTIERDOM_TEST_URL) throw new Error('Set FRONTIERDOM_TEST_URL to an isolated real-API preview; this suite creates guest accounts and executes trades.');
export default defineConfig({
  testDir: '.', testMatch: '*.spec.js', fullyParallel: false, workers: 1,
  timeout: 60000, retries: 0,
  outputDir: '../../artifacts/e2e',
  reporter: [['list'], ['json', { outputFile: 'artifacts/e2e/results.json' }]],
  use: { baseURL: process.env.FRONTIERDOM_TEST_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', testIgnore: 'trade-api.spec.js', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }
  ]
});
