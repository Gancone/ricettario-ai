import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
const recipe = {
  id: "12345678-1234-4234-8234-123456789012",
  revision: 1,
  title: "Pasta al pomodoro",
  category: "Primi",
  tags: ["vegetariana"],
  ingredients: ["200 g pasta", "300 g pomodori"],
  steps: ["Cuoci per 2 minuti.", "Mescola per 3 minuti."],
  servings: 2,
  totalTimeMinutes: 15,
  notes: "Nota originale",
  nutrition: { calories: 350, protein: 12 },
  createdAt: "2026-10-15T08:00:00Z",
};
async function fixture(page: Page) {
  const state = {
    pantry: [] as any[],
    plan: [] as any[],
    history: [] as any[],
    stats: [] as any[],
  };
  const calls = {
    extract: 0,
    save: 0,
    max: 0,
    active: 0,
    uploads: [] as Buffer[],
    shopping: [] as any[],
    shoppingRevision: 1,
    offline: false,
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname,
      method = request.method();
    if (calls.offline) {
      await route.abort("internetdisconnected");
      return;
    }
    let status = 200,
      body: any = {};
    if (path === "/api/auth/status") body = { authenticated: true };
    else if (path === "/api/categories") body = [{ id: 1, name: "Primi" }];
    else if (path === "/api/kitchen") body = state;
    else if (path.startsWith("/api/kitchen/")) {
      const entity = path.split("/").pop(),
        key =
          entity === "pantry_items"
            ? "pantry"
            : entity === "meal_plan_entries"
              ? "plan"
              : "history";
      const data = request.postDataJSON();
      const index = state[key].findIndex((row) => row.id === data.item.id);
      const old = state[key][index];
      if (old && old.revision !== data.expectedRevision) {
        status = 409;
        body = { error: "Modifica concorrente" };
      } else {
        body = {
          ...old,
          ...data.item,
          normalized_name: data.item.name?.toLowerCase(),
          revision: (old?.revision || 0) + 1,
        };
        if (index >= 0) state[key][index] = body;
        else state[key].push(body);
        if (key === "history")
          state.stats = [
            {
              recipe_id: recipe.id,
              count: state.history.filter((row) => !row.archived_at).length,
              last_cooked_at: body.cooked_at,
              average_rating: body.rating,
            },
          ];
      }
    } else if (path === "/api/recipes" && method === "GET")
      body =
        url.searchParams.get("view") === "index"
          ? [{ ...recipe, ingredients: [], steps: [] }]
          : {
              items: [recipe],
              total: 1,
              summary: { recipes: 1, favorites: 0, categories: { Primi: 1 } },
            };
    else if (path === "/api/recipes" && method === "POST") {
      calls.save++;
      body = { ...request.postDataJSON(), revision: 1 };
    } else if (path === "/api/recipes/" + recipe.id) body = recipe;
    else if (path === "/api/state/shopping") {
      if (method === "PUT") {
        const input = request.postDataJSON();
        calls.shopping = input.items;
        calls.shoppingRevision++;
      }
      body = { items: calls.shopping, revision: calls.shoppingRevision };
    } else if (path === "/api/extract") {
      calls.extract++;
      calls.active++;
      calls.max = Math.max(calls.max, calls.active);
      await new Promise((resolve) => setTimeout(resolve, 80));
      calls.active--;
      body = {
        ...recipe,
        recipeId: crypto.randomUUID(),
        title: "Ricetta importata " + calls.extract,
      };
    } else if (path === "/api/images/upload") {
      const form = await new Request(request.url(), {
        method: "POST",
        headers: { "content-type": request.headers()["content-type"] },
        body: new Uint8Array(request.postDataBuffer()!),
      }).formData();
      const image = form.get("image") as File;
      calls.uploads.push(Buffer.from(await image.arrayBuffer()));
      body = { imageUrl: "/icons/icon-512.png" };
    } else if (path === "/api/version") body = { version: "7.0.0" };
    else if (path === "/api/backup/status")
      body = {
        recipes: 1,
        latestBackupAt: "2026-10-15T08:00:00Z",
        latestBackupRecipes: 1,
        protected: true,
      };
    else {
      status = 404;
      body = { error: "Endpoint di test non previsto: " + path };
    }
    await route.fulfill({ status, json: body });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Apri " + recipe.title }),
  ).toBeVisible();
  return { state, calls };
}
async function more(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Altro", exact: true })
    .filter({ visible: true })
    .click();
  await page
    .getByRole("button", { name, exact: true })
    .filter({ visible: true })
    .click();
}

test("dispensa: aggiunta, modifica, terminato e archiviazione annullabile", async ({
  page,
}) => {
  const { state } = await fixture(page);
  await more(page, "Dispensa");
  await page.getByLabel("Alimento dispensa").fill("Pomodori");
  await page.getByLabel("Quantità dispensa").fill("100");
  await page.getByLabel("Unità dispensa").selectOption("g");
  await page
    .getByRole("button", { name: "Aggiungi alimento", exact: true })
    .click();
  await expect(page.getByText("100 g", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Modifica", exact: true }).click();
  await page.getByLabel("Quantità dispensa").fill("200");
  await page.getByRole("button", { name: "Salva alimento" }).click();
  await expect(page.getByText("200 g", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Terminato", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Di nuovo disponibile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archivia Pomodori" }).click();
  await expect(
    page.getByRole("button", { name: "Archivia Pomodori" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Annulla archiviazione" }).click();
  await expect(
    page.getByRole("button", { name: "Archivia Pomodori" }),
  ).toBeVisible();
  expect(state.pantry[0].quantity).toBe(200);
});

test("planner: porzioni e lista intelligente senza doppioni", async ({
  page,
}) => {
  const { state, calls } = await fixture(page);
  await more(page, "Piano pasti");
  await page.getByLabel("Ricetta da pianificare").selectOption(recipe.id);
  await page.getByLabel("Porzioni del pasto").fill("4");
  await page.getByRole("button", { name: "Assegna ricetta" }).click();
  await expect(
    page.getByRole("button", { name: "Modifica pasto " + recipe.title }),
  ).toBeVisible();
  expect(state.plan[0].servings).toBe(4);
  await page.getByRole("button", { name: "Genera lista della spesa" }).click();
  await expect(page.getByRole("button", { name: /400 g pasta/ })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Sincronizzata" }),
  ).toBeVisible();
  await more(page, "Piano pasti");
  await page.getByRole("button", { name: "Genera lista della spesa" }).click();
  await expect(page.getByRole("button", { name: /400 g pasta/ })).toHaveCount(
    1,
  );
  expect(calls.shopping).toHaveLength(2);
});

test("cucina: più timer persistenti e storico separato dalle note", async ({
  page,
}) => {
  const { state, calls } = await fixture(page);
  await page.getByRole("button", { name: "Apri " + recipe.title }).click();
  await page.getByRole("button", { name: "Cucina", exact: true }).click();
  await page.getByRole("button", { name: "Avvia timer · 2 min" }).click();
  await page.getByRole("button", { name: "Avanti →" }).click();
  await page.getByRole("button", { name: "Avvia timer · 3 min" }).click();
  await expect(
    page.getByLabel("Timer cucina").locator(".timer-row"),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Fatto · salva nello storico" })
    .click();
  await expect(
    page.getByText("Cucinata 1 volte", { exact: false }),
  ).toBeVisible();
  expect(state.history[0].servings).toBe(2);
  expect(recipe.notes).toBe("Nota originale");
  expect(calls.save).toBe(0);
  await page.reload();
  await expect(
    page.getByLabel("Timer cucina").locator(".timer-row"),
  ).toHaveCount(2);
});

test("tema manuale, visualizzazione persistente e 2 colonne a 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await fixture(page);
  await expect(page.locator(".recipe-grid")).toHaveCSS(
    "grid-template-columns",
    /\d+px \d+px/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await more(page, "Impostazioni");
  await page.getByRole("button", { name: "Scuro", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator(".recipe-grid")).toHaveClass(/view-list/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/v7-dark-320.png",
    fullPage: true,
    animations: "disabled",
  });
  await more(page, "Impostazioni");
  await page.getByRole("button", { name: "Chiaro", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("offline: ricette IndexedDB consultabili dopo errore rete, stato esplicito", async ({
  page,
}) => {
  const { calls } = await fixture(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const open = indexedDB.open("ricettario-ai-v7");
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const request = open.result
                .transaction("state")
                .objectStore("state")
                .get("recipes");
              request.onsuccess = () => resolve(request.result ? 1 : 0);
            };
          }),
      ),
    )
    .toBe(1);
  calls.offline = true;
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", { get: () => false }),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Apri " + recipe.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Offline —" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apri " + recipe.title }).click();
  await expect(page.getByRole("dialog", { name: recipe.title })).toBeVisible();
});

test("import multiplo: sequenziale, revisione esplicita e nessun salvataggio automatico", async ({
  page,
}) => {
  const { calls } = await fixture(page);
  await page
    .getByRole("button", { name: "Nuova", exact: true })
    .filter({ visible: true })
    .click();
  await page.locator("summary").filter({ hasText: "Importa più link" }).click();
  await page
    .getByLabel("Link da importare, uno per riga")
    .fill("https://example.org/prima\nhttps://example.org/seconda");
  await page.getByRole("button", { name: "Aggiungi alla coda" }).click();
  await page
    .getByRole("button", { name: "Avvia importazione sequenziale" })
    .click();
  await expect(
    page.getByRole("button", { name: "Controlla nell’editor" }),
  ).toHaveCount(2);
  expect(calls.max).toBe(1);
  expect(calls.save).toBe(0);
  await page
    .getByRole("button", { name: "Controlla nell’editor" })
    .first()
    .click();
  await expect(page.getByLabel("Titolo", { exact: true })).toHaveValue(
    "Ricetta importata 1",
  );
  expect(calls.save).toBe(0);
});

test("copertina: ritaglio quadrato prima del caricamento, conferma esplicita", async ({
  page,
}) => {
  const { calls } = await fixture(page);
  await page
    .getByRole("button", { name: "Nuova", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Scrivi a mano" }).click();
  const image = await sharp({
    create: { width: 1000, height: 500, channels: 3, background: "#9cac7e" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Scegli foto", { exact: true })
    .setInputFiles({ name: "prova.png", mimeType: "image/png", buffer: image });
  await expect(
    page.getByRole("dialog", { name: "Ritaglia copertina" }),
  ).toBeVisible();
  expect(calls.uploads).toHaveLength(0);
  await page.getByLabel("Zoom ritaglio").fill("2");
  await page.getByRole("button", { name: "Usa ritaglio" }).click();
  await expect(
    page.getByRole("dialog", { name: "Ritaglia copertina" }),
  ).toHaveCount(0);
  expect(calls.uploads).toHaveLength(1);
  const metadata = await sharp(calls.uploads[0]).metadata();
  expect(metadata.width).toBe(metadata.height);
  expect(metadata.format).toBe("webp");
  expect(calls.save).toBe(0);
});

test("titolo lungo, dettaglio e tastiera restano dentro il viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.route("**/api/recipes?view=gallery**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...recipe,
            title: "Un titolo molto lungo con parole e ingredienti ".repeat(6),
          },
        ],
        total: 1,
        summary: { recipes: 1, favorites: 0, categories: {} },
      },
    }),
  );
  await page.reload();
  await page.getByRole("button", { name: /Apri Un titolo/ }).click();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/v7-detail-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test.describe('PWA sulla build compilata',()=>{
 test.use({serviceWorkers:'allow'});
 test('primo avvio conserva shell e ricette per un vero riavvio senza rete',async({page,context})=>{
  test.skip(process.env.PLAYWRIGHT_PRODUCTION!=='1','La cache della shell va verificata sulla build compilata.');
  const{calls}=await fixture(page);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await expect.poll(()=>page.evaluate(async()=>{const cache=await caches.open('ricettario-shell-v7-official-brand');return(await cache.keys()).filter(request=>request.url.includes('/_next/static/')&&request.url.includes('.js')).length;})).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  calls.offline=true;await context.setOffline(true);await page.reload();
  await expect(page.getByRole('button',{name:'Apri '+recipe.title})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'Offline —'})).toBeVisible();
  await page.getByRole('button',{name:'Apri '+recipe.title}).click();await expect(page.getByRole('dialog',{name:recipe.title})).toBeVisible();
 });
});
