const { test, expect } = require('@playwright/test');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const INDEX_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

async function gotoApp(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(INDEX_URL);
  await page.waitForTimeout(600);
  return errors;
}

async function switchTo(page, formId) {
  await page.click(`.form-tab[data-form-id="${formId}"]`);
  await page.waitForTimeout(150);
}

async function pdfBytesFromPreview(page) {
  const b64 = await page.evaluate(async () => {
    const src = document.getElementById('pdf-preview-frame').src;
    const res = await fetch(src);
    const buf = await res.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  });
  return Buffer.from(b64, 'base64');
}

test.describe('form switcher', () => {
  test('switching tabs shows the right panel and resizes the canvas per template', async ({ page }) => {
    const errors = await gotoApp(page);

    let dims = await page.evaluate(() => {
      const c = document.getElementById('preview-canvas');
      return { w: c.width, h: c.height };
    });
    expect(dims).toEqual({ w: 864, h: 1118 }); // Form 1, Letter

    await switchTo(page, 'form3-en');
    await expect(page.locator('#entry-form-form3-en')).toBeVisible();
    await expect(page.locator('#entry-form-form1-en')).toBeHidden();
    dims = await page.evaluate(() => {
      const c = document.getElementById('preview-canvas');
      return { w: c.width, h: c.height };
    });
    expect(dims).toEqual({ w: 864, h: 1118 }); // Form 3, also Letter

    await switchTo(page, 'form5-en');
    await expect(page.locator('#entry-form-form5-en')).toBeVisible();
    dims = await page.evaluate(() => {
      const c = document.getElementById('preview-canvas');
      return { w: c.width, h: c.height };
    });
    expect(dims.w).toBe(864);
    expect(dims.h / dims.w).toBeCloseTo(297 / 210, 2); // Form 5, A4 aspect ratio

    expect(errors).toEqual([]);
  });

  test('per-form state is preserved when switching tabs away and back', async ({ page }) => {
    await gotoApp(page);
    await page.fill('#f-name', 'form one person');
    await switchTo(page, 'form3-en');
    await page.fill('#f3-name', 'form three person');
    await switchTo(page, 'form1-en');
    await expect(page.locator('#f-name')).toHaveValue('FORM ONE PERSON');
    await switchTo(page, 'form3-en');
    await expect(page.locator('#f3-name')).toHaveValue('FORM THREE PERSON');
  });
});

test.describe('Form 3 (child 5-18)', () => {
  test('fills, validates, and exports a valid Letter-size PDF', async ({ page }) => {
    const errors = await gotoApp(page);
    await switchTo(page, 'form3-en');

    await page.check('input[name="f3-purpose"][value="enrolment"]');
    await page.fill('#f3-name', 'child three name');
    await page.check('input[name="f3-gender"][value="male"]');
    await page.fill('#f3-dob', '15082015');
    await page.check('input[name="f3-relationship"][value="guardian"]');
    await page.fill('#f3-hof-aadhaar', '234123412346');
    await expect(page.locator('#entry-form-form3-en [data-status-for="hofAadhaar"] .badge')).toHaveClass(/ok/);

    await page.click('.entry-form:not([hidden]) .btn-print-one');
    await page.waitForTimeout(600);
    const bytes = await pdfBytesFromPreview(page);
    const doc = await PDFDocument.load(bytes);
    const { width, height } = doc.getPages()[0].getSize();
    expect(width).toBeCloseTo(215.9 * 72 / 25.4, 0);
    expect(height).toBeCloseTo(279.4 * 72 / 25.4, 0);

    expect(errors).toEqual([]);
  });
});

test.describe('Form 5 (child under 5)', () => {
  test('multi-select relationship and A4 PDF export', async ({ page }) => {
    const errors = await gotoApp(page);
    await switchTo(page, 'form5-en');

    await page.fill('#f5-name', 'baby five name');
    await page.check('input[name="f5-relationship"][value="mother"]');
    await page.check('input[name="f5-relationship"][value="father"]');
    await expect(page.locator('input[name="f5-relationship"][value="mother"]')).toBeChecked();
    await expect(page.locator('input[name="f5-relationship"][value="father"]')).toBeChecked();

    await page.click('.entry-form:not([hidden]) .btn-print-one');
    await page.waitForTimeout(600);
    const bytes = await pdfBytesFromPreview(page);
    const doc = await PDFDocument.load(bytes);
    const { width, height } = doc.getPages()[0].getSize();
    expect(width).toBeCloseTo(210 * 72 / 25.4, 0);
    expect(height).toBeCloseTo(297 * 72 / 25.4, 0);

    expect(errors).toEqual([]);
  });
});

test.describe('cross-form queue', () => {
  test('duplicate Aadhaar is detected across different form types', async ({ page }) => {
    await gotoApp(page);
    await switchTo(page, 'form3-en');
    await page.fill('#f3-name', 'child three name');
    await page.fill('#f3-applicant-aadhaar', '111122223333');
    await page.click('.entry-form:not([hidden]) .btn-queue');
    await page.waitForTimeout(200);

    await switchTo(page, 'form5-en');
    await page.fill('#f5-applicant-aadhaar', '111122223333');
    await expect(page.locator('#entry-form-form5-en [data-dup-warning-for="applicantAadhaar"]')).toBeVisible();
  });

  test('queue list shows each entry\'s own form label', async ({ page }) => {
    await gotoApp(page);
    await switchTo(page, 'form3-en');
    await page.fill('#f3-name', 'alice');
    await page.click('.entry-form:not([hidden]) .btn-queue');
    await page.waitForTimeout(150);

    await switchTo(page, 'form5-en');
    await page.fill('#f5-name', 'bob');
    await page.click('.entry-form:not([hidden]) .btn-queue');
    await page.waitForTimeout(150);

    await expect(page.locator('#queue-count')).toHaveText('2');
    const text = await page.locator('#queue-list').innerText();
    expect(text).toContain('ALICE — Form 3');
    expect(text).toContain('BOB — Form 5');
  });

  test('reuse address works from a Form 3 entry into the active Form 5 tab', async ({ page }) => {
    await gotoApp(page);
    await switchTo(page, 'form3-en');
    await page.fill('#f3-name', 'sibling name');
    // Form 3's house field is only 2 characters wide (the printed label
    // consumes most of its column -- see templates/form3-en.json), so use a
    // value that actually fits rather than one that would get truncated.
    await page.fill('#f3-house', '5b');
    await page.fill('#f3-street', 'shared family street');
    await page.click('.entry-form:not([hidden]) .btn-queue');
    await page.waitForTimeout(150);

    await switchTo(page, 'form5-en');
    await page.click('#queue-list li button.secondary'); // "Reuse address" on the Form 3 entry
    await page.waitForTimeout(150);

    await expect(page.locator('#f5-house')).toHaveValue('5B');
    await expect(page.locator('#f5-street')).toHaveValue('SHARED FAMILY STREET');
    await expect(page.locator('#f5-name')).toHaveValue('');
  });

  test('printing a mixed queue produces one correctly-sized page per entry', async ({ page }) => {
    await gotoApp(page);
    await switchTo(page, 'form3-en');
    await page.fill('#f3-name', 'letter page person');
    await page.click('.entry-form:not([hidden]) .btn-queue');
    await page.waitForTimeout(150);

    await switchTo(page, 'form5-en');
    await page.fill('#f5-name', 'a4 page person');
    await page.click('.entry-form:not([hidden]) .btn-queue');
    await page.waitForTimeout(150);

    await page.click('#btn-print-queue');
    await page.waitForTimeout(600);
    const bytes = await pdfBytesFromPreview(page);
    const doc = await PDFDocument.load(bytes);
    const pages = doc.getPages();
    expect(pages.length).toBe(2);

    const size0 = pages[0].getSize();
    const size1 = pages[1].getSize();
    expect(size0.width).toBeCloseTo(215.9 * 72 / 25.4, 0); // Form 3, Letter
    expect(size1.width).toBeCloseTo(210 * 72 / 25.4, 0); // Form 5, A4
  });
});

test.describe('shared record-shape convention', () => {
  test('addr keys are identical across all three schemas (required for cross-form reuse)', async ({ page }) => {
    await gotoApp(page);
    const shapes = await page.evaluate(() => ({
      form1: window.SCHEMA_FORM1_EN.recordShape.addr.slice().sort(),
      form3: window.SCHEMA_FORM3_EN.recordShape.addr.slice().sort(),
      form5: window.SCHEMA_FORM5_EN.recordShape.addr.slice().sort(),
    }));
    expect(shapes.form3).toEqual(shapes.form1);
    expect(shapes.form5).toEqual(shapes.form1);
  });
});
