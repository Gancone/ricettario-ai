# Configurazione backend 6.2

Prima del primo deploy della versione 6.2 configura queste variabili server-only in Vercel:

- `APP_PASSWORD`: password obbligatoria dell'applicazione.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: accesso solo server.
- `DATABASE_URL`: connessione PostgreSQL amministrativa usata esclusivamente dal runner delle migrazioni.
- `YTDLP_VERSION` e `YTDLP_SHA256`: release yt-dlp approvata e SHA-256 del binario Linux; senza il pin l'estrazione video viene bloccata.
- `GITHUB_UPDATE_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` solo se si usa l'updater integrato.

Esegui una volta `npm run db:migrate` nell'ambiente di deploy oppure `POST /api/admin/migrations` dopo l'accesso. Il runner prende un backup verificato, usa un advisory lock, applica solo migrazioni additive e registra il checksum in `schema_migrations`.

Le API ricette richiedono lo schema `001_backend_safety`. Se la migrazione manca rispondono con `SCHEMA_NOT_READY` senza toccare i dati. Il salvataggio usa la revisione della ricetta: una modifica concorrente risponde `409` e non sovrascrive l'ultima versione. La cancellazione permanente delle ricette è disabilitata dal trigger PostgreSQL.

Il backup JSON esistente resta disponibile. Per un archivio completo con immagini usa `/api/backup/export?format=zip`; l'importazione ZIP passa da `/api/backup/import`, è additiva per default e richiede `OVERWRITE_WITH_HISTORY` più le revisioni attese per sostituire dati già presenti.
