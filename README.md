# Ricettario AI 7.0

Ricettario personale con l’identità ufficiale verde/salvia e crema. Ricette, immagini, versioni, dispensa e piano pasti sono conservati su Supabase; il browser mantiene una copia per consultazione offline.

## Funzioni

- Import da siti web, testo, foto, PDF e social video. JSON-LD, microdata e testo strutturato vengono letti prima di ricorrere all’AI. Ogni risultato apre l’editor e richiede un salvataggio esplicito.
- Coda fino a 20 link, elaborati uno alla volta; controllo duplicati prima dell’AI.
- Ingredienti strutturati con frazioni e intervalli; stringhe legacy conservate. Porzioni temporanee, aggregazione della spesa con unità compatibili e reparti facoltativi.
- Dispensa, piano settimanale, storico delle preparazioni con note e voto separati dalle note della ricetta.
- Gallery con ricerca sul server, 20 elementi per pagina, Griglia/Lista/Compatta, preferiti e archivio.
- Modalità cucina a singolo passaggio, swipe, tastiera, schermo acceso dove supportato, più timer conservati in IndexedDB e ricalcolati dall’orario reale.
- Tema Sistema/Chiaro/Scuro, layout da 320px, logo e icone ufficiali invariati.
- Foto con crop e fotocamera, nomi immutabili, originale e varianti medium/thumbnail.
- Backup ZIP con JSON e fotografie fisiche, checksum e importazione additiva. Backup preventivo verificato prima di import, recupero, migrazioni e aggiornamenti.

## Configurazione

Node.js 24, npm 11. Copia `.env.example` in `.env.local` e inserisci i valori sul tuo dispositivo, oppure in Vercel. Non inviare password o chiavi in chat e non committare `.env.local`.

Obbligatorie: `APP_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. `DATABASE_URL` serve per eseguire le migrazioni. `OPENAI_API_KEY` serve solo quando la fonte richiede AI. Nessuna chiave amministrativa deve essere `NEXT_PUBLIC_`.

Il motore social usa la release yt-dlp 2026.08.19 con SHA-256 verificato. Per sostituire la release imposta `YTDLP_VERSION`, `YTDLP_SHA256` (Linux) e `YTDLP_WINDOWS_SHA256` (Windows). I modelli si possono configurare con `OPENAI_RECIPE_MODEL` e `OPENAI_AUDIO_MODEL`. Nessun aggiornamento automatico di questi strumenti.

## Verifiche locali

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Su Windows i test usano Google Chrome. Su Linux installa Chromium con `npx playwright install --with-deps chromium`. Per provare la build compilata, imposta `PLAYWRIGHT_PRODUCTION=1` prima dei test. Le prove usano API simulate e PostgreSQL isolato PGlite, senza ricette reali né chiamate AI.

`npm run dev` avvia lo sviluppo. La CI verifica installazione, TypeScript, test, build e browser sulle pull request; non pubblica Production.

## Migrazioni e rilascio

Vedi `docs/V7-REPORT.md` per la procedura completa, i risultati e i limiti verificati.

1. Conserva un backup dei dati attuali e pubblica il ramo `completion/ricettario-v7` come Preview.
2. Verifica le variabili nella Preview. Prima di usare il database reale, approva separatamente la migrazione e il rilascio.
3. Esegui `npm run db:migrate` con la connessione amministrativa corretta, oppure il modulo autenticato `/api/admin/migrations` del deployment v7. Il runner verifica un backup prima di applicare i file SQL mancanti; non modificare gli SQL già applicati.
4. Controlla `/api/health`, ricette legacy, modifica/salvataggio, fotografie, planner, dispensa, spesa, export/import e offline.
5. Dopo la verifica e l’approvazione, integra il ramo in main e pubblica Production. Verifica di nuovo sul dominio ufficiale.

Non usare vecchi deployment per le migrazioni v7. Non fare reset del database. Per risolvere problemi di una migrazione già applicata prepara una nuova migrazione additiva.

## Aggiornamenti e conservazione

L’updater web richiede `GITHUB_UPDATE_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` e facoltativamente `GITHUB_BRANCH` come base. Prepara esclusivamente un ramo `update/...`, senza modificare main. Il token deve avere accesso solo al repository necessario; CI e Preview richiedono verifica prima del rilascio. ZIP web massimo 4 MB.

Il vecchio launcher `tools/install-v6.ps1` ora delega a `tools/prepare-update.ps1`: copia il codice in un checkout Git isolato, senza cancellare cartelle, senza copiare credenziali e senza push automatico. I dati non sono parte del pacchetto codice.

I backup completi passano tramite Storage privato per evitare il limite Vercel di 4,5 MB. Il limite applicativo è 50 MB; il link firmato di download vale 5 minuti. Gli archivi e le fotografie precedenti vengono conservati. La rimozione automatica degli orfani è rimandata per proteggere anche i backup storici.

La copia IndexedDB dipende dallo spazio del browser: conserva anche un backup ZIP esterno. Solo la spesa dispone di una coda offline con gestione dei conflitti; gli altri salvataggi richiedono rete. I timer riprendono correttamente al ritorno nell’app; non promettono notifiche di sistema quando il browser è chiuso.

Il collegamento Windows usa l’icona stabile in `Desktop/TOOLS/LOGHI`, indipendente dalla posizione della foto originale. Gli asset ufficiali non vengono rigenerati o sostituiti.
