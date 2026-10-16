# Audit iniziale v7

Base locale: `078bcf1`, ramo branding/logo-shortcut; solo `db-connect-test.cjs` preesistente non tracciato, escluso dal lavoro. Ramo di completamento: completion/ricettario-v7. GitHub main è 1712694 (6.3); nessun merge o rilascio automatico. Logo ufficiale e collegamento TOOLS/LOGHI preservati.

Presenti e riutilizzati: sessione firmata HttpOnly/SameSite con scadenza, guard API e validazione Zod, protezione DNS SSRF con redirect limitati, revisioni CAS PostgreSQL e recipe_versions, archivio invece di DELETE, snapshot a chunk con checksum e last-known-good, storage immagini immutabili, editor con bozze, import video/testo, PDF e lista spesa con stato offline, PWA e logo ufficiale.

Lacune osservate: shopping GET restituisceva righe senza revisione; rate limit login solo in memoria; restore/import additivo senza snapshot preventivo; ZIP parziale (assenza nuovi dati, foto esterne saltate silenziosamente); verifica yt-dlp cache incompleta; UI updater cerca una pubblicazione Production che il backend correttamente non esegue; installer legacy cancella cartelle e fa push; assenza dispensa/piano/storico/ingredienti strutturati, IndexedDB, import immagini/PDF/web deterministico, coda multipla e CI.

Procedura: A affidabilità, B ingredienti/schema, C dispensa/piano/storico, D backup/offline, E UX/import/immagini, F integrazione/CI. Test e commit per blocco. Nessuna connessione ai dati reali durante i test; migrazioni verificate con PGlite popolato da record sintetici. Le nuove migrazioni non aggiornano né cancellano ricette legacy. Le migrazioni storiche applicate non vengono riscritte.
