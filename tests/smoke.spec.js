const { test, expect } = require('@playwright/test');
const path = require('path');

test('index.html loads with no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(500);

  await expect(page).toHaveTitle(/UIDAI Form 1/);
  expect(errors).toEqual([]);
});
