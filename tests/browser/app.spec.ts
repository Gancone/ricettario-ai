import { test, expect, type Page } from '@playwright/test';

const recipe = { id: '12345678-1234-4234-8234-123456789012', title: 'Caffè al latte', category: 'Colazione', tags: ['veloce'], ingredients: ['1/2 tazza di latte', '1 cucchiaio di caffè'], steps: ['Scalda per 2 minuti.', 'Versa nella tazza.'], servings: 2, totalTimeMinutes: 5, nutrition: { calories: 100, protein: 5 }, createdAt: '2026-09-28T08:00:00Z' };
async function setup(page: Page, { saveFails = false, shoppingFails = false, categoriesFail = false } = {}) {
  const saved: any[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    let status = 200;
    if (path === '/api/auth/status') body = { authenticated: true };
    else if (path === '/api/categories') { body = categoriesFail ? { error: 'Cataloghi non disponibili' } : [{ id: 1, name: 'Colazione' }]; status = categoriesFail ? 503 : 200; }
    else if (path === '/api/recipes' && route.request().method() === 'GET') body = [recipe];
    else if (path.startsWith('/api/recipes')) {
      if (saveFails) { status = 503; body = { error: 'Errore simulato di salvataggio' }; }
      else { body = route.request().postDataJSON(); saved.push(body); }
    }
    else if (path === '/api/state/shopping') {
      if (shoppingFails) { status = 503; body = { error: 'Connessione di prova interrotta' }; }
      else body = route.request().method() === 'GET' ? [] : { success: true };
    }
    else if (path === '/api/version') body = { version: '6.1.0' };
    await route.fulfill({ status, json: body });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Le mie ricette' })).toBeVisible();
  return saved;
}
async function newManual(page: Page) {
  await page.getByRole('button', { name: 'Nuova', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Scrivi a mano' }).click();
  await page.getByLabel('Titolo', { exact: true }).fill('La mia torta');
  await page.getByLabel('Ingredienti', { exact: true }).fill('100 g farina\n2 uova');
  await page.getByLabel('Procedimento', { exact: true }).fill('Mescola e cuoci.');
}
test('bozza conservata tra schede e dopo ricaricamento; salvataggio riuscito la elimina', async ({ page }) => {
  const saved = await setup(page);
  await newManual(page);
  await page.getByRole('button', { name: 'Ricette', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Nuova', exact: true }).filter({ visible: true }).click();
  await expect(page.getByLabel('Titolo', { exact: true })).toHaveValue('La mia torta');
  await page.reload();
  await page.getByRole('button', { name: 'Nuova', exact: true }).filter({ visible: true }).click();
  await expect(page.getByLabel('Titolo', { exact: true })).toHaveValue('La mia torta');
  await page.getByRole('button', { name: 'Salva nel ricettario' }).click();
  await expect(page.getByRole('dialog', { name: 'La mia torta' })).toBeVisible();
  expect(saved).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('ricettario-draft-v6'))).toBeNull();
});
test('errore di salvataggio conserva i dati e rende il pulsante riutilizzabile', async ({ page }) => {
  await setup(page, { saveFails: true }); await newManual(page);
  await page.getByRole('button', { name: 'Salva nel ricettario' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Errore simulato' }).last()).toBeVisible();
  await expect(page.getByLabel('Titolo', { exact: true })).toHaveValue('La mia torta');
  await expect(page.getByRole('button', { name: 'Salva nel ricettario' })).toBeEnabled();
});
test('ricette disponibili anche se falliscono cataloghi e spesa; ricerca senza accenti', async ({ page }) => {
  await setup(page, { categoriesFail: true, shoppingFails: true });
  await page.getByLabel('Cerca ricette').fill('latte caffe');
  await expect(page.getByRole('button', { name: 'Apri Caffè al latte' })).toBeVisible();
  await page.screenshot({ path: 'test-results/ricettario-desktop.png', fullPage: true, animations: 'disabled' });
});
test('modalità cucina: dosi corrette, tastiera e modifiche conservate se il server fallisce', async ({ page }) => {
  await setup(page, { saveFails: true });
  await page.getByRole('button', { name: 'Apri Caffè al latte' }).click();
  await page.getByRole('button', { name: 'Aumenta porzioni' }).click();
  await page.getByRole('button', { name: 'Aumenta porzioni' }).click();
  await expect(page.getByRole('button', { name: '1 tazza di latte', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Modifica', exact: true }).click();
  await page.getByLabel('Titolo', { exact: true }).fill('Titolo corretto');
  await page.getByRole('button', { name: 'Salva modifiche' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Errore simulato' })).toBeVisible();
  await expect(page.getByLabel('Titolo', { exact: true })).toHaveValue('Titolo corretto');
  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('spesa offline: stato veritiero, recupero dopo reload e annullamento svuotamento', async ({ page }) => {
  await setup(page, { shoppingFails: true });
  await page.getByRole('button', { name: 'Spesa', exact: true }).filter({ visible: true }).click();
  await page.getByLabel('Aggiungi alla spesa').fill('Latte');
  await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Da sincronizzare' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^Spesa/ }).filter({ visible: true }).click();
  await expect(page.getByRole('button', { name: 'Latte Aggiunto a mano' })).toBeVisible();
  await page.getByRole('button', { name: 'Svuota', exact: true }).click();
  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Latte Aggiunto a mano' })).toBeVisible();
});
test('telefono: nessun overflow orizzontale e inserimento manuale accessibile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ricettario-mobile.png', fullPage: true, animations: 'disabled' });
  await newManual(page);
  await page.screenshot({ path: 'test-results/ricettario-editor-mobile.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
