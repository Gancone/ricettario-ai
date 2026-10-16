# Branding ufficiale Ricettario AI

Intervento limitato a logo, icone, metadata e collegamento Windows. Il design, il comportamento di accesso, le API, i backup, Supabase e le migrazioni restano invariati. Nessuna pubblicazione su `main`.

## Originale e varianti

- Master: `public/branding/ricettario-ai-logo.png`, copia identica del file ufficiale sul Desktop (1254 × 1254, RGBA). Non viene caricato dall'interfaccia.
- Logo completo ottimizzato: `public/branding/ricettario-ai-logo-login.webp` (640 × 560), login.
- Simbolo: `public/branding/ricettario-ai-mark.png` (512 × 512) e `ricettario-ai-mark.webp` (128 × 128), header e caricamento.
- PWA: `public/icons/icon-192.png` e `icon-512.png`.
- Apple: `public/icons/apple-touch-icon.png` (180 × 180).
- Favicon: `public/icons/favicon-16.png`, `favicon-32.png`, `app/favicon.ico` e `public/icons/ricettario-ai.ico`.
- ICO reale con sei dimensioni: 16, 32, 48, 64, 128 e 256 pixel. Ogni icona contiene solo il simbolo, senza testo minuscolo.

Le esportazioni mantengono proporzioni, colori originali e trasparenza. Il login usa un contenitore color crema per mantenere leggibile il testo originale anche in modalità scura; lo sfondo delle immagini rimane trasparente. Il componente `BrandLogo` usa `next/image` con dimensioni riservate e asset già ottimizzati. Logo completo: `alt="Ricettario AI"`; simbolo accanto al testo identico: `alt=""`.

Rigenerazione, dopo aver installato le dipendenze del progetto:

```powershell
node tools/generate-branding-assets.cjs
```

Non ci sono metadata OpenGraph/Twitter preesistenti da aggiornare; non sono state aggiunte modifiche SEO.

## Collegamento Windows

Production verificata: https://ricettario-ai-kappa.vercel.app/

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/create-windows-shortcut.ps1
```

Il percorso progetto viene ricavato dalla posizione dello script. L'URL viene letto da `public/branding/site.json`; può essere passato esplicitamente con `-ProductionUrl`. `-ToolsDirectory` permette di indicare un'altra cartella di destinazione. L'URL viene validato come HTTPS, senza credenziali, parametri o destinazioni locali.

Sul PC corrente:

- Collegamento: `C:\Users\Admin\Desktop\TOOLS\Ricettario AI.lnk`.
- Icona stabile: `C:\Users\Admin\Desktop\TOOLS\LOGHI\RICETTARIO-AI.ico`.
- Target: `%WINDIR%\explorer.exe`, con l'URL Production come argomento.

Explorer apre HTTPS usando il browser predefinito di Windows, senza legarsi a Chrome o Edge e senza avviare PowerShell, npm o un server locale. Verificato il doppio clic: si apre Chrome, attualmente predefinito, con la finestra del Ricettario; nessuna nuova finestra di terminale. Script eseguito due volte: un solo collegamento, aggiornato senza duplicati.

La copia ICO stabile vive **fuori** dalle cartelle del progetto sostituite dall'installer. Il sito online resta quello già pubblicato: il branding locale verrà mostrato online solo dopo un successivo rilascio autorizzato.

## Distribuzione e compatibilità

Il manifest PWA indica le nuove icone. Il service worker mantiene la stessa logica e include soltanto gli asset branding aggiunti; cambia il nome della cache per evitare icone obsolete. I pacchetti completi devono includere `public/branding/`, `public/icons/`, `app/favicon.ico` e gli script `tools/`. L'installer esistente distribuisce già `public/` e `tools/`; `update-manifest.json` ora include anche `tools` tra le cartelle gestite. Nessun cambiamento alla logica dell'updater o delle API.

Gli originali sostituiti sono conservati in `releases/before-branding-2026-10-13/`, ignorata da Git. Nessun file dell'utente è stato cancellato.

## Verifica

- `npm run typecheck`: passato.
- `npm test`: 12 test passati.
- `npm run build`: passato, Next.js 16.3.8.
- `npm run test:browser`: 6 test passati.
- Controlli visivi aggiuntivi: login e home a 320, 390 e 1280 pixel, nei temi chiaro e scuro (12 viste), nessun overflow del documento o del logo.
- Favicon ICO/PNG, shortcut icon, Apple icon, manifest e tutti gli asset offline serviti correttamente.
- Hash del master identico all'originale. Hash invariati per 51 file in `app/api/`, `database/` e `lib/`.
- `git diff --check`: passato; nessuna modifica a backend, migrazioni, configurazione Supabase o flusso di autenticazione.

Anteprime e risultati locali: `releases/branding-verification/` (non inclusa in Git).

## File del commit branding

```text
README.md
app/branding.css
app/favicon.ico
app/layout.tsx
app/page.tsx
components/BrandLogo.tsx
components/LoginScreen.tsx
docs/branding.md
public/branding/ricettario-ai-logo.png
public/branding/ricettario-ai-logo-login.webp
public/branding/ricettario-ai-mark.png
public/branding/ricettario-ai-mark.webp
public/branding/site.json
public/icons/apple-touch-icon.png
public/icons/favicon-16.png
public/icons/favicon-32.png
public/icons/icon-192.png
public/icons/icon-512.png
public/icons/ricettario-ai.ico
public/manifest.webmanifest
public/sw.js
tools/create-windows-shortcut.ps1
tools/generate-branding-assets.cjs
update-manifest.json
```

Ramo: `branding/logo-shortcut`, creato dal commit corrente `a4f6bac` del ramo `backend/data-safety`. Commit dedicato: `Add Ricettario AI branding and Windows shortcut`. Nessun merge o push su `main`, nessuna riscrittura della cronologia. Il file preesistente non tracciato `db-connect-test.cjs` è rimasto escluso dal commit.
