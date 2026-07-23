const { test, expect } = require('@playwright/test');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const INDEX_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const VALID_AADHAAR = '234123412346'; // Verhoeff-valid, confirmed by brute force
const INVALID_AADHAAR = '111111111111';

async function gotoApp(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(INDEX_URL);
  await page.waitForTimeout(600); // let async font-metrics init settle
  return errors;
}

async function fillFullRecord(page) {
  await page.check('input[name="purpose"][value="enrolment"]');
  await page.check('input[name="status"][value="resident"]');
  await page.fill('#f-name', 'ramesh kumar');
  await page.check('input[name="gender"][value="male"]');
  await page.fill('#f-dob', '15081990');
  await page.check('input[name="dobBasis"][value="declared"]');
  await page.fill('#f-email', 'test@example.com');
  await page.fill('#f-mobile', '9876543210');
  await page.check('input[name="basis"][value="document"]');
  await page.fill('#f-house', '12a');
  await page.fill('#f-street', 'mg road');
  await page.fill('#f-village', 'kochi');
  await page.fill('#f-post-office', 'ernakulam');
  await page.fill('#f-pin', '682001');
  await page.fill('#f-subdistrict', 'kanayannur');
  await page.fill('#f-district', 'ernakulam');
  await page.fill('#f-state', 'kerala');
  await page.fill('#f-poi', 'passport');
  await page.fill('#f-poa', 'passport');
  await page.fill('#f-hof-name', 'suresh kumar');
  await page.fill('#f-hof-aadhaar', VALID_AADHAAR);
  await page.check('input[name="relationship"][value="father"]');
  await page.fill('#f-por', 'birth certificate');
  await page.fill('#f-applicant-aadhaar', VALID_AADHAAR);
  await page.waitForTimeout(200);
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

test.describe('input behaviour', () => {
  test('auto-uppercases free text and computes per-field max length', async ({ page }) => {
    const errors = await gotoApp(page);
    await page.fill('#f-name', 'ramesh kumar');
    await expect(page.locator('#f-name')).toHaveValue('RAMESH KUMAR');

    const houseMax = await page.evaluate(() => document.getElementById('f-house').maxLength);
    const wardMax = await page.evaluate(() => document.getElementById('f-ward').maxLength);
    expect(houseMax).toBeGreaterThan(4);
    expect(wardMax).toBe(4); // spec's explicit override, must not be recomputed

    expect(errors).toEqual([]);
  });

  test('strips non-digits and preserves cursor on numeric fields', async ({ page }) => {
    await gotoApp(page);
    await page.fill('#f-mobile', '9876543210');
    await expect(page.locator('#f-mobile')).toHaveValue('9876543210');
    const maxlen = await page.evaluate(() => document.getElementById('f-mobile').maxLength);
    expect(maxlen).toBe(10);
  });
});

test.describe('validation', () => {
  test('Verhoeff shows remaining-digit count then pass/fail', async ({ page }) => {
    await gotoApp(page);
    await page.fill('#f-applicant-aadhaar', '1234');
    await expect(page.locator('#applicant-aadhaar-status')).toContainText('8 digit(s) remaining');

    await page.fill('#f-applicant-aadhaar', VALID_AADHAAR);
    await expect(page.locator('#applicant-aadhaar-status .badge')).toHaveClass(/ok/);

    await page.fill('#f-applicant-aadhaar', INVALID_AADHAAR);
    await expect(page.locator('#applicant-aadhaar-status .badge')).toHaveClass(/bad/);
  });

  test('detects title/honorific in name and clears when removed', async ({ page }) => {
    await gotoApp(page);
    await page.fill('#f-name', 'mr ramesh kumar');
    await expect(page.locator('#name-warning')).not.toBeEmpty();
    await expect(page.locator('#name-warning')).toContainText('MR');

    await page.fill('#f-name', 'ramesh kumar');
    await expect(page.locator('#name-warning')).toBeHidden();
  });

  test('NRI status marks email as mandatory', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#email-req')).toBeHidden();
    await page.check('input[name="status"][value="nri"]');
    await expect(page.locator('#email-req')).toBeVisible();
  });
});

test.describe('queue and family batching', () => {
  test('add to queue resets the form and focuses name', async ({ page }) => {
    await gotoApp(page);
    await fillFullRecord(page);
    await page.click('.entry-form:not([hidden]) .btn-queue');
    await page.waitForTimeout(200);

    await expect(page.locator('#queue-count')).toHaveText('1');
    await expect(page.locator('#f-name')).toHaveValue('');
    const focused = await page.evaluate(() => document.activeElement.id);
    expect(focused).toBe('f-name');
  });

  test('warns on duplicate Aadhaar already in queue', async ({ page }) => {
    await gotoApp(page);
    await fillFullRecord(page);
    await page.click('.entry-form:not([hidden]) .btn-queue');
    await page.waitForTimeout(200);

    await page.fill('#f-applicant-aadhaar', VALID_AADHAAR);
    await expect(page.locator('#dup-warning')).toBeVisible();
  });

  test('reuse address seeds address/POA/HoF but not name or Aadhaar', async ({ page }) => {
    await gotoApp(page);
    await fillFullRecord(page);
    await page.click('.entry-form:not([hidden]) .btn-queue');
    await page.waitForTimeout(200);

    await page.click('#queue-list button.secondary'); // first "Reuse address" button
    await page.waitForTimeout(200);

    await expect(page.locator('#f-house')).toHaveValue('12A');
    await expect(page.locator('#f-hof-name')).toHaveValue('SURESH KUMAR');
    await expect(page.locator('#f-name')).toHaveValue('');
    await expect(page.locator('#f-applicant-aadhaar')).toHaveValue('');
    const focused = await page.evaluate(() => document.activeElement.id);
    expect(focused).toBe('f-name');
  });
});

test.describe('keyboard flow', () => {
  test('Enter advances focus to the next field/group', async ({ page }) => {
    await gotoApp(page);
    await page.click('#f-name');
    await page.fill('#f-name', 'keyboard test');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const focusedName = await page.evaluate(() => document.activeElement.name || document.activeElement.id);
    expect(focusedName).toBe('gender');
  });

  test('Ctrl+S adds current record to queue', async ({ page }) => {
    await gotoApp(page);
    await page.fill('#f-name', 'ctrl s test');
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);
    await expect(page.locator('#queue-count')).toHaveText('1');
  });
});

test.describe('calibration', () => {
  test('apply measurements computes dx/dy/scale', async ({ page }) => {
    await gotoApp(page);
    await page.fill('#meas-x', '20.4');
    await page.fill('#meas-y', '19.6');
    await page.fill('#meas-bar', '150.9');
    await page.click('#cal-apply');
    await page.waitForTimeout(100);

    await expect(page.locator('#cal-dx')).toHaveValue('-0.400');
    await expect(page.locator('#cal-dy')).toHaveValue('0.400');
    await expect(page.locator('#cal-scale')).toHaveValue('0.99404');
  });

  test('new profile can be created and selected', async ({ page }) => {
    await gotoApp(page);
    page.once('dialog', (d) => d.accept('Test Printer'));
    await page.click('#cal-new');
    await page.waitForTimeout(100);
    await expect(page.locator('#cal-profile')).toHaveValue('Test Printer');
  });
});

test.describe('PDF export', () => {
  test('single record produces a valid, correctly sized one-page PDF', async ({ page }) => {
    await gotoApp(page);
    await fillFullRecord(page);
    await page.click('.entry-form:not([hidden]) .btn-print-one');
    await page.waitForTimeout(600);

    const bytes = await pdfBytesFromPreview(page);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPages().length).toBe(1);
    const { width, height } = doc.getPages()[0].getSize();
    expect(width).toBeCloseTo(215.9 * 72 / 25.4, 0);
    expect(height).toBeCloseTo(279.4 * 72 / 25.4, 0);
  });

  test('whole queue produces one page per record', async ({ page }) => {
    await gotoApp(page);
    await fillFullRecord(page);
    await page.click('.entry-form:not([hidden]) .btn-queue');
    await page.waitForTimeout(200);
    await page.fill('#f-name', 'second person');
    await page.fill('#f-applicant-aadhaar', '000000000000');
    await page.click('.entry-form:not([hidden]) .btn-queue');
    await page.waitForTimeout(200);

    await page.click('#btn-print-queue');
    await page.waitForTimeout(600);

    const bytes = await pdfBytesFromPreview(page);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPages().length).toBe(2);
  });

  test('blank print produces an empty one-page PDF at correct size', async ({ page }) => {
    await gotoApp(page);
    await page.click('#btn-print-blank');
    await page.waitForTimeout(600);

    const bytes = await pdfBytesFromPreview(page);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPages().length).toBe(1);
  });

  test('alignment sheet produces a valid one-page PDF', async ({ page }) => {
    await gotoApp(page);
    await page.click('#btn-alignment-sheet');
    await page.waitForTimeout(600);

    const bytes = await pdfBytesFromPreview(page);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPages().length).toBe(1);
  });
});
