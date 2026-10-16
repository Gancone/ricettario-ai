# Ricettario AI 7.0 — report di completamento

Verifica locale: 15 ottobre 2026. Progetto: `C:\Users\Admin\Desktop\TOOLS\RICETTARIO AI`.

La versione 7.0 è implementata e verificata localmente. Il database reale e Production non sono stati modificati durante il lavoro. L’attivazione richiede migrazione additiva e verifica del deployment Preview prima del rilascio approvato.

## 1. Ramo

`completion/ricettario-v7`. Conserva la storia del ramo di branding e del backend, e incorpora `origin/main` (`1712694`) nel ramo v7. Nessun merge è stato eseguito **verso** main. I conflitti sono stati risolti conservando il comportamento v7, il logo e le correzioni già pubblicate; sono stati mantenuti e adattati i test di layout precedenti.

## 2. Commit di implementazione

| Commit | Blocco |
|---|---|
| `3e3174a` | Backend: restore, revisioni spesa, guardie API |
| `dfe1f29` | Schema additivo e parsing ingredienti |
| `abb81ab` | Servizi dispensa, planner e storico |
| `e738b11` | Backup ZIP con foto e IndexedDB |
| `b985437` | Import deterministico/documenti e foto immutabili |
| `cbb6f65` | Interfaccia v7 e flussi collegati |
| `a4af058` | CI, PWA offline reale e installer sicuro |
| `c867017` | Integrazione di main nel ramo v7 e regressioni di layout |

Il commit che contiene questo report aggiunge la documentazione e le prove finali. La revisione consegnata si ricava con `git rev-parse HEAD`; l’elenco completo è in `docs/V7-FILES.txt`.

## 3. File modificati

L’elenco esatto rispetto alla base locale `078bcf1`, con lo stato Git di ciascun percorso, è in `docs/V7-FILES.txt`. I blocchi principali sono `app/api`, `lib`, `components`, `app/v7.css`, `database/migrations`, `tests`, `tools` e `.github/workflows/quality.yml`.

Il file personale non tracciato `db-connect-test.cjs` è rimasto fuori da commit e pacchetto. `.env.local` non è stato letto, copiato, modificato o incluso. Il progetto storico `Desktop/ricettario-ai-v4` non è stato usato come destinazione del codice: contiene solo l’area di preparazione del lavoro e il pacchetto consegnato.

## 4. Nuove tabelle

| Tabella | Campi principali |
|---|---|
| `recipe_ingredients` | id, recipe_id, recipe_revision, position, original_text, quantity, quantity_max, unit, ingredient, notes, normalized_ingredient, created_at, updated_at |
| `pantry_items` | id, name, normalized_name, quantity, unit, notes, finished, revision, archived_at, created_at, updated_at |
| `meal_plan_entries` | id, date, meal_type, recipe_id, servings, notes, revision, archived_at, created_at, updated_at |
| `cooking_history` | id, recipe_id, cooked_at, servings, rating, notes, revision, archived_at, created_at, updated_at |
| `recipe_settings` | id, preferences, revision, archived_at, created_at, updated_at |

RLS attiva; accesso diretto anonimo negato. Le relazioni con le ricette usano `ON DELETE RESTRICT`. Archiviazione tramite timestamp per dispensa, pasti e preparazioni. Non è presente cancellazione permanente delle ricette.

## 5. Nuove colonne e compatibilità

`shopping_items`: `quantity_max`, `ingredient_key`, `group_name`, `contributions`.

`recipes.ingredients` rimane un array di stringhe. Gli ingredienti strutturati e la fiducia nutrizionale hanno anche una rappresentazione nel JSON nutrition. Il trigger memorizza la struttura per ogni nuova revisione esplicita; le ricette legacy vengono lette tramite fallback deterministico, senza backfill obbligatorio e senza riscrittura massiva.

Le colonne già introdotte dalla 001 per revisioni, preferiti, archivio e note non vengono ricreate. L’SQL della migrazione 001 è rimasto identico alla base locale.

## 6. Migrazioni

| File | Scopo |
|---|---|
| `001_backend_safety.sql` | Esistente, conservato senza cambiamenti |
| `002_shopping_read.sql` | Correzione già pubblicata: lista e revisione lette atomicamente |
| `003_personal_kitchen.sql` | Nuove tabelle, archiviazione, ingredienti per revisione, CAS cucina e spesa strutturata |
| `004_kitchen_read.sql` | Overview cucina e statistiche in una RPC |
| `005_recipe_gallery.sql` | Ricerca, filtri, ordinamento e pagina di massimo 20 ricette |

Runner con lock PostgreSQL, transazione, backup verificato prima del DDL, controllo dei checksum e registrazione dei file applicati. La compatibilità degli a capo Windows/Linux non permette di accettare una modifica del contenuto SQL. Le nuove migrazioni usano `IF NOT EXISTS`/`CREATE OR REPLACE`; 003 e 005 sono state eseguite due volte nel database di test popolato.

Non sono state eseguite migrazioni sul database dell’utente.

## 7. Funzioni implementate

- Auth obbligatoria con `APP_PASSWORD`, sessione HttpOnly e controllo origine; login limitato in modo durevole quando lo schema è disponibile e con fallback limitato solo al bootstrap.
- Revisioni e storico delle ricette, conflitti espliciti, ripristino di una versione con backup preventivo.
- Backup last-known-good verificati; una copia sospetta non sostituisce quella buona. Import e recupero additivi conservano i record esistenti e riportano i conflitti.
- Protezione SSRF per URL esterni e redirect, limiti download e timeout; yt-dlp fissato per versione e hash anche su Windows.
- Parsing di quantità, frazioni, intervalli e unità. Quantità assenti restano assenti. Scaling temporaneo che conserva il testo originale.
- Spesa deterministica con g/kg e ml/l compatibili, unità diverse separate, provenienza dei contributi, rigenerazione dei pasti senza duplicare o sommare di nuovo il contributo già presente. Reparti facoltativi e annullamento delle rimozioni.
- Dispensa con quantità facoltative, ricerca, modifica, terminato, archiviazione e annullamento. Copertura ingredienti e aggiunta dei mancanti dalla ricetta.
- Planner lunedì–domenica, colazione/pranzo/cena/snack, giorno, porzioni, note, modifica, apertura ricetta, rimozione reversibile e lista della spesa.
- Storico con porzioni, voto e nota separata dalle note della ricetta; conteggio, ultima preparazione e media dei voti.
- Import universale da web, testo, immagine, PDF e video: prima JSON-LD/microdata/testo strutturato, poi AI quando necessario. Nessun autosalvataggio. Coda sequenziale fino a 20 fonti con errori e riprova.
- Nutrizione sempre indicata come stimata, fiducia high/medium/low deterministica e controllo aritmetico 4/4/9 senza chiamate AI.
- Foto da galleria/fotocamera, crop, nomi nuovi e immutabili, thumbnail e immagine media. Aggiornamento DB dopo il caricamento riuscito; originali precedenti conservati.
- ZIP portabile con manifest, nove JSON e fotografie fisiche; checksum, controllo percorsi e dimensioni; nessuna estrazione arbitraria su disco. Trasferimento dei file grandi tramite Storage privato e URL firmati.
- IndexedDB per ricette, bozze, miniature, spesa, cucina, coda import e timer. Migrazione in lettura dalle copie localStorage senza cancellare le vecchie ricette. Preparazione completa offline esplicita.
- PWA con HTML, JS e CSS compilati in cache fin dal primo avvio; API escluse dalla cache del service worker. Riavvio realmente senza rete testato.
- Home compatta, due colonne su telefono, Griglia/Lista/Compatta, ricerca sul server con massimo 20 elementi, titolo completo nel dettaglio e nome accessibile delle card.
- Modalità cucina a singolo passaggio, swipe, tastiera, ingredienti, timer multipli durevoli, schermo acceso dove supportato e storico al completamento. I timer non coprono le azioni del dettaglio.
- Editor ad accordion con Ingredienti aperto, salvataggio sticky, stati vuoti specifici e impostazioni riorganizzate.
- Tema Sistema/Chiaro/Scuro, focus visibile, tap target, testi lunghi, movimento ridotto e layout verificati da 320 a 1280px.
- Updater ZIP su ramo di anteprima; installer locale in checkout isolato, senza cancellazioni di cartelle, senza credenziali e senza push automatico.

Ricerca, shopping, planner, dispensa, scaling, filtri, backup, PDF, preferiti, archivio e normale visualizzazione non chiamano OpenAI.

## 8. Funzioni rimandate deliberatamente

- Cancellazione automatica di immagini o archivi orfani: sono conservati per non spezzare versioni e backup storici. Serve una politica di retention verificata prima di rimuoverli.
- Coda di scrittura offline per ricette, dispensa, planner e storico: l’app richiede rete e segnala gli errori; la sola spesa ha una coda con gestione prudente dei conflitti.
- Preferenze dell’interfaccia sincronizzate tra dispositivi: tema, vista e reparti restano locali come richiesto. La tabella settings è predisposta, accessibile tramite API e inclusa nei backup; può essere vuota.
- Notifiche timer di sistema a browser chiuso: non sono promesse. I timer mantengono l’orario e vengono ricalcolati al ritorno nell’app.
- Ricerca molto estesa in raccolte enormi: il filtro “Disponibili con dispensa” usa parsing e confronto sul server, con lettura della raccolta lato server. Non scarica l’intera raccolta nel client; per decine di migliaia di ricette servirebbe un indice specifico.

Multiutente, community, chat permanente, profili pubblici, pagamenti e pubblicità non sono stati introdotti.

## 9. Variabili d’ambiente

Obbligatorie: `APP_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. `DATABASE_URL` amministrativa serve soltanto per le migrazioni. La connessione va copiata con la password reale al posto del segnaposto e con i caratteri speciali codificati nell’URL.

AI facoltativa: `OPENAI_API_KEY`, `OPENAI_RECIPE_MODEL` (default gpt-4o-mini), `OPENAI_AUDIO_MODEL` (default gpt-4o-mini-transcribe).

Updater facoltativo: `GITHUB_UPDATE_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` come base. Il token deve essere limitato al repository; l’aggiornamento di workflow GitHub può richiedere anche il permesso Workflows.

Override video facoltativi: `YTDLP_VERSION`, `YTDLP_SHA256` e `YTDLP_WINDOWS_SHA256`. Di default viene usata la release ufficiale 2026.08.19, verificata contro SHA2-256SUMS. Non usare l’hash Windows per il binario Linux. Nessuna nuova variabile obbligatoria per le sole funzioni cucina se Supabase è già configurato.

Le variabili esistenti non sono state modificate. Nessuna chiave amministrativa è diventata NEXT_PUBLIC.

## 10–14. Controlli e risultati

| Comando / verifica | Risultato locale |
|---|---|
| `npm ci` | Riuscito; 0 vulnerabilità riportate |
| `npm run typecheck` | Riuscito |
| `npm test` | 35 test passati, 0 falliti |
| `npm run build` | Riuscito, senza avvisi di tracciamento |
| `PLAYWRIGHT_PRODUCTION=1 npm run test:e2e` | 24 test browser sulla build compilata |
| Migrazioni in PGlite | Ricetta legacy conservata, CAS e statistiche corrette, DDL ripetibile |
| Test browser | Bozze, salvataggio/fallimento, spesa offline, dispensa, planner, timer, storico, tema, import sequenziale, crop, riavvio PWA senza rete |
| Regressioni layout | 320/390/768/1280px, chiaro e scuro, testi estremi su home/dettaglio/spesa/impostazioni/editor; login da tastiera |
| Parser PowerShell installer | Riuscito; installer non eseguito contro i dati dell’utente |
| Audit degli asset | 11 file ufficiali PNG/WebP/ICO identici byte per byte alla base |
| Audit build | Nessun file .env o script privato nelle 34 trace server; nessun nome di chiave amministrativa nel JS client |
| Controllo diff | Nessuna nuova cancellazione di ricette, DROP/TRUNCATE di tabelle o credenziale riconosciuta |

I test usano dati simulati e PostgreSQL isolato. Nessuna chiamata AI reale e nessuna ricetta reale alterata. I warning Node sui moduli TypeScript e quello npm sul postinstall core-js non hanno impedito i controlli; non sono errori di migrazione.

Le prove locali non certificano ancora la configurazione del futuro deployment Preview o i permessi del database reale.

## 15. Limiti e rischi residui

- ZIP dati fino a 50 MB, foto complessive fino a 90 MB prima del controllo della dimensione ZIP. Oltre il limite il download viene bloccato esplicitamente; il JSON e gli originali su Storage restano disponibili. Archivi privati e foto precedenti occupano spazio finché non viene approvata una retention sicura.
- Il link firmato del backup vale 5 minuti. I caricamenti diretti del backup usano un token limitato al singolo nuovo oggetto; la service-role key resta sul server.
- L’importazione è additiva ma non è una singola transazione tra Storage e tutte le tabelle: un’interruzione può lasciare una importazione parziale e file aggiunti. Rieseguire conserva gli ID esistenti; il report distingue inseriti, conflitti ed errori. Il backup preventivo rimane disponibile.
- Il browser può rimuovere IndexedDB per pressione di spazio o pulizia manuale. Conservare uno ZIP esterno; l’offline non sostituisce il database.
- La corrispondenza dispensa è conservativa: non assume equivalenza tra ingredienti diversi né converte cucchiai in grammi. Le quantità non note sono segnalate da controllare.
- I social possono bloccare i server cloud o richiedere login. Testo incollato, documenti e inserimento manuale restano disponibili.
- La fiducia nutrizionale è un indicatore della qualità delle quantità disponibili, non una certificazione nutrizionale.
- Wake lock, fotocamera e condivisione dipendono dal browser. La PWA mantiene i timer, senza garantire avvisi a browser chiuso.
- La nuova gallery richiede la migrazione 005; non promuovere il deployment prima di completare i controlli dello schema.

## 16. Deploy di anteprima e rilascio

1. Usare esclusivamente il ramo `completion/ricettario-v7` e la revisione verificata. Pubblicarlo su GitHub come ramo di sviluppo e aprire una pull request in bozza verso main.
2. Verificare i controlli GitHub Actions. Vercel deve creare una **Preview** di questo ramo; non usare Redeploy di un vecchio commit main per provare la v7.
3. Configurare le variabili Preview sul progetto corretto. Se cambiano variabili, rifare il deployment Preview della revisione v7.
4. Eseguire la migrazione solo dopo l’approvazione dell’uso del database reale e la verifica del backup. Una Preview che usa il database di Production condivide quegli stessi dati.
5. Verificare le funzioni elencate sotto sul deployment effettivo. Promuovere/integrare in main soltanto dopo approvazione esplicita. Non viene richiesto un reset DB e non serve reinstallare l’app per perdere o ricreare ricette.

## 17. Migrazione del database

- Conservare uno ZIP esterno e verificare l’ultimo backup. Fare un backup del provider se disponibile.
- Aprire **il deployment Preview v7 appena creato**, accedere all’app e poi aprire `/api/admin/migrations` dello stesso dominio. Il modulo deve mostrare “Esegui backup e migrazione”. In alternativa, dalla cartella del progetto configurata, eseguire `npm run db:migrate`.
- Il runner applica soltanto i file mancanti, dopo backup a chunk verificato. Non cambiare checksum a mano e non rieseguire SQL vecchi da un deployment diverso.
- Controllare l’esito: elenco `applied`, `recipesDeleted: 0`. Se i file sono già applicati l’elenco può essere vuoto. Controllare `/api/health`: versione 7.0.0, schema richiesto 005, database raggiungibile e conteggio coerente.
- Se il backup o una connessione falliscono, fermare il rilascio e correggere la configurazione; i dati esistenti restano conservati. Non usare reset o cancellazione di tabelle come soluzione.

## 18–19. Conservazione e legacy

Nessuna ricetta reale è stata cancellata, riscritta o usata come dato di test durante il lavoro. Le nuove migrazioni non cancellano ricette, non ricreano tabelle e non impongono relazioni strutturate ai record legacy. I test partono da una ricetta precedente all’aggiornamento e verificano che resti presente dopo tutte le migrazioni e i conflitti.

ID, stringhe ingredienti e note esistenti rimangono compatibili. Le modifiche intenzionali dell’utente passano da revisioni e cronologia. Gli asset ufficiali e lo script del collegamento con icona stabile in LOGHI restano conservati.

## 20. Passi manuali ancora necessari

Dopo la consegna del codice e dell’eventuale ramo remoto/PR:

1. Approvare la migrazione additiva sul database reale; verificare prima il backup e il conteggio attuale.
2. Verificare la Preview v7 su PC e telefono: aprire vecchie ricette e foto, salvare e ricaricare una ricetta di prova, controllare storico/versioni, aggiungere dispensa e pasti, generare spesa senza doppioni, esportare lo ZIP completo, importarlo in modo additivo su un ambiente di prova e preparare l’offline.
3. Controllare log, `/api/health` e backup senza mostrare chiavi o password.
4. Approvare il rilascio. Solo allora integrare la PR in main/promuovere il deployment corretto e verificare il dominio ufficiale.
5. Conservare il backup esterno e decidere in seguito una retention delle fotografie e degli archivi. Nessuna pulizia automatica degli originali è stata attivata.

## Riferimenti dei limiti verificati

- [Vercel Functions: limite payload 4,5 MB](https://vercel.com/docs/functions/limitations): trasferimenti ZIP grandi delegati a Storage.
- [Supabase Storage: limiti file](https://supabase.com/docs/guides/storage/uploads/file-limits): limite applicativo 50 MB compatibile con la soglia massima Free.
- [Supabase: URL firmati di upload](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl): token di upload limitato al percorso, valido 2 ore.
- [Release yt-dlp verificata](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19): binari con versione e SHA-256 controllati prima dell’esecuzione.
