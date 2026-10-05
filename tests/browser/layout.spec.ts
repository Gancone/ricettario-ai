import { test, expect, type Page, type Locator } from '@playwright/test';

// Deliberately awkward content catches both clipping and intrinsic grid overflow.
const longWord = 'RicettaDiFamigliaSenzaSpazi'.repeat(7);
const category = 'Piatti della domenica e ricette speciali da condividere';
const recipe = {
  id: '12345678-1234-4234-8234-123456789012', revision: 1,
  title: `Una ricetta con un nome lunghissimo: ${longWord}`,
  category, tags: [], servings: 12, totalTimeMinutes: 120,
  ingredients: [`200 g di ${longWord}`, '2 uova'],
  steps: [`Mescola con cura. ${longWord}`, 'Cuoci per 20 minuti.'],
  sourceNotes: longWord, notes: longWord,
  nutrition: { calories: 12345, protein: 35, carbs: 55, fat: 10 },
  createdAt: '2026-10-05T08:00:00Z'
};

async function fixtures(page: Page, authenticated = true) {
  let shopping = [{ id: '22345678-1234-4234-8234-123456789012', text: longWord, source: recipe.title, done: false }];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === '/api/auth/status') body = { authenticated };
    else if (path === '/api/auth/login') body = { success: true };
    else if (path === '/api/categories') body = [{ id: 1, name: category }];
    else if (path === '/api/recipes') body = [recipe];
    else if (path === '/api/state/shopping') {
      if (route.request().method() === 'PUT') shopping = route.request().postDataJSON().items;
      body = { items: shopping, revision: 1 };
    } else if (path === '/api/version') body = { version: '6.3.0' };
    else if (path === '/api/backup/status') body = { recipes: 19, latestBackupRecipes: 19, latestBackupAt: '2026-10-05T08:00:00Z', protected: true };
    else if (path === '/api/system/status') body = {
      auth: { ok: true, label: 'Accesso protetto' },
      supabase: { ok: true, label: `19 ricette raggiungibili · ${longWord}` },
      backup: { ok: true, label: 'Ultima copia verificata il 05/10/2026 alle 10:00' },
      schema: { ok: true, label: 'Database aggiornato' }
    };
    await route.fulfill({ json: body });
  });
  await page.goto('/');
}

async function containedText(locator: Locator) {
  await expect(locator).toBeVisible();
  expect(await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return Array.from(range.getClientRects()).every(rect =>
      rect.left >= box.left - 1 && rect.right <= box.right + 1 &&
      rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1
    );
  })).toBe(true);
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const width of [320, 390, 768, 1280]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`contenuti lunghi: ${width}px, ${colorScheme}, tutte le schermate`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await fixtures(page);
      await expect(page.getByRole('heading', { name: 'Le mie ricette' })).toBeVisible();
      await containedText(page.locator('.recipe-card-copy h3'));
      await containedText(page.locator('.recipe-card-category'));
      await noHorizontalOverflow(page);
      await page.screenshot({ path: `test-results/layout-${width}-${colorScheme}-home.png`, fullPage: true });

      // Category becomes the page heading; it must wrap as well.
      await page.getByRole('button', { name: `${category} 1`, exact: true }).click();
      await containedText(page.locator('.recipes-hero h1'));
      await noHorizontalOverflow(page);
      await page.getByRole('button', { name: `Apri ${recipe.title}`, exact: true }).click();
      await containedText(page.locator('.hero-copy h2'));
      expect(await page.locator('.hero-copy').evaluate(el => el.getBoundingClientRect().top >= el.parentElement!.getBoundingClientRect().top + 80)).toBe(true);
      expect(await page.locator('.recipe-modal').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await containedText(page.locator('.cook-row').first().locator('span').last());
      await containedText(page.locator('.step-row').first().locator('span').last());
      await page.locator('.nutrition-section').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/layout-${width}-${colorScheme}-detail.png` });
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: /Spesa/ }).filter({ visible: true }).click();
      await containedText(page.locator('.shopping-copy'));
      await noHorizontalOverflow(page);
      await page.screenshot({ path: `test-results/layout-${width}-${colorScheme}-shopping.png`, fullPage: true });

      await page.getByRole('button', { name: 'Altro', exact: true }).filter({ visible: true }).click();
      await containedText(page.locator('.system-row small').filter({ hasText: longWord }));
      await containedText(page.locator('.category-manager-row > span').filter({ hasText: category }));
      await page.locator('.update-drop input').setInputFiles({ name: `${longWord}.zip`, mimeType: 'application/zip', buffer: Buffer.from('layout test only') });
      await containedText(page.locator('.update-drop strong'));
      await noHorizontalOverflow(page);
      await page.screenshot({ path: `test-results/layout-${width}-${colorScheme}-settings.png`, fullPage: true });

      await page.getByRole('button', { name: 'Nuova', exact: true }).filter({ visible: true }).click();
      await page.getByRole('button', { name: 'Scrivi a mano' }).click();
      await page.getByLabel('Titolo', { exact: true }).fill(recipe.title);
      await page.getByLabel('Ingredienti', { exact: true }).fill(recipe.ingredients.join('\n'));
      await page.getByLabel('Procedimento', { exact: true }).fill(recipe.steps.join('\n'));
      await containedText(page.locator('.editor-accordion summary').filter({ hasText: 'Tempi, porzioni e nutrizione' }));
      await noHorizontalOverflow(page);
      await page.screenshot({ path: `test-results/layout-${width}-${colorScheme}-editor.png`, fullPage: true });
    });
  }
}

test('accesso da telefono: etichetta password, errore leggibile e invio da tastiera', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await fixtures(page, false);
  await page.getByRole('button', { name: 'Entra nel ricettario' }).click();
  await expect(page.locator('#login-error')).toContainText('Inserisci la password');
  await noHorizontalOverflow(page);
  await page.getByLabel('Password del ricettario').fill('password-di-prova');
  await page.getByLabel('Password del ricettario').press('Enter');
  await expect(page.getByRole('heading', { name: 'Le mie ricette' })).toBeVisible();
});
