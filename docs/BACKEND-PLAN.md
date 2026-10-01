# Audit e implementazione backend — 1 ottobre 2026

Fonte: codice del repository, non le garanzie del README. UI e CSS fuori ambito.

## Architettura osservata
Next App Router, route Node, Supabase SDK con service role solo server. Nessun SQL/schema
versionato presente: lo schema legacy è inferito da recipe-map (UUID, testi, array,
nutrition JSON, created_at); non è stato ispezionato il database di produzione.
Cookie deterministico annuale, fail-open senza password. UPDATE_PASSWORD usata come fallback.
Storage: recipe-images pubblico con cover sovrascritta; ricettario-backups privato con
latest e 40 snapshot, limite 10 MB e query non paginate; ricettario-state/shopping.json
last-write-wins. Restore usa upsert aggiornante. POST recipes può sovrascrivere ID esistenti.
PATCH e riparazioni immagini non hanno revisione/cronologia. Recovery limitata a 500 righe.
yt-dlp scaricato da latest senza checksum; fetch esterni non proteggono DNS/redirect/size.
Updater ZIP modifica main, elimina file gestiti e lockfile; installer elimina cartelle.
Test esistenti: unità JS/TS, 6 scenari Playwright con API simulate.

## Interventi completati
1. Auth fail-closed, cookie firmati a scadenza, CSRF, limiti input e rate limit persistente.
2. Migrazione PostgreSQL additiva e idempotente: revisioni, metadati, versioni, shopping,
   rate limit e lock di backup. Trigger atomici per storia e blocco cancellazioni ricette.
3. Servizio ricette comune: insert-only, compare-and-swap, 409, recupero a batch, ricerca indicizzata.
4. Backup paginato gzip con manifest/checksum, last-known-good e snapshot immutabili;
   restore additivo per default e sostituzione esplicita con revisione e backup.
5. Export JSON e ZIP con immagini fisiche, manifest/checksum e import ZIP validato non distruttivo.
6. Immagini immutabili, temporanei/promozione e GC manuale conservativa; fetch con DNS
   vincolato all'IP verificato, controlli redirect, MIME e stream limitato.
7. Video con release/checksum fissati, proxy di uscita SSRF, limiti durata/dimensione/tempo;
   OpenAI dopo controlli, logging minimo e nessuna chiamata diagnostica a pagamento.
8. Shopping per riga e CAS lista legacy; updater produce branch da verificare; installer
   preserva lockfile/env. Health check e runner migrazioni con connessione amministrativa.
9. Dipendenze stabili aggiornate, controlli ZIP/SSRF, test di regressione e runner riproducibile;
   npm audit, typecheck, test e build verificati.

## Vincoli di rilascio
Non applicare SQL al DB reale senza connessione amministrativa configurata e backup
verificato. Il service-role REST non è una connessione DDL: non creare un RPC SQL arbitrario.
Le nuove scritture richiedono schema pronto; letture legacy continuano a funzionare.
Nessun DROP/TRUNCATE/DELETE recipes, nessuna modifica degli ID, nessuna pulizia backup automatica.
