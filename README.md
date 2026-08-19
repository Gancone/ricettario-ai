# Ricettario AI v4.0.0

Versione mobile-first del ricettario personale.

## Cosa include

- Ricette sincronizzate su Supabase
- Cataloghi personalizzati sincronizzati
- Import da link video con fallback a caricamento manuale
- Trascrizione + ricetta con OpenAI
- Tempi, porzioni e valori nutrizionali per porzione
- Foto persistente: quando salvi una nuova ricetta, il server prova a copiare la cover in Supabase Storage
- Ricette compatte a immagine, apertura in scheda completa
- 20 ricette per pagina
- Modalità cucina con ingredienti e passaggi spuntabili
- Lista della spesa locale
- PDF con foto della ricetta
- Backup JSON
- PWA installabile sulla Home del telefono
- Aggiornamenti futuri via ZIP direttamente dall'app

## Variabili già usate

Su Vercel devono esserci:

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Aggiornamenti ZIP dall'app: configurazione una tantum

Dopo aver installato questa v4, aggiungi su **Vercel → Project → Settings → Environment Variables**:

- `GITHUB_OWNER` = il tuo username GitHub
- `GITHUB_REPO` = nome del repository, per esempio `ricettario-ai`
- `GITHUB_BRANCH` = `main`
- `UPDATE_PASSWORD` = una password lunga scelta da te
- `GITHUB_UPDATE_TOKEN` = token GitHub fine-grained con accesso solo a questo repository e permesso **Contents: Read and write**

Poi fai un Redeploy una sola volta.

Da quel momento, per i prossimi aggiornamenti:

1. apri il sito;
2. vai in **Impostazioni → Aggiornamenti ZIP**;
3. trascina il nuovo ZIP che ti viene fornito;
4. inserisci la password aggiornamenti;
5. premi **Installa aggiornamento**.

Il sito crea un commit su GitHub e Vercel fa automaticamente il deploy. Non serve più usare Prompt dei comandi.

## Prima installazione della v4 senza Prompt

Questa versione include `INSTALLA-V4.vbs` (senza Prompt dei comandi) e, come alternativa, `INSTALLA-V4.bat`.

1. Estrai lo ZIP della v4.
2. Fai doppio clic su `INSTALLA-V4.vbs`.
3. Seleziona la cartella del progetto attuale collegata a GitHub.
4. Lo script conserva `.env.local`, copia la v4, crea il commit e fa push.
5. Vercel effettua il deploy automaticamente.

Richiede che Git/GitHub siano già configurati sul PC, come lo sono stati per il deploy precedente.

## Database

La v4 usa la tabella `recipes` già esistente con queste colonne:

- `id` uuid
- `title` text
- `source_url` text
- `image_url` text
- `category` text
- `tags` text[]
- `ingredients` text[]
- `steps` text[]
- `notes` text
- `prep_time_minutes` integer
- `cook_time_minutes` integer
- `total_time_minutes` integer
- `servings` integer
- `nutrition` jsonb
- `created_at` timestamptz

E la tabella `categories` già creata con `id`, `name`, `created_at`.

RLS può rimanere attivo: l'app accede a Supabase solo dal backend usando la chiave server-side.

## Costi

Le funzioni normali del ricettario (visualizzazione, ricerca, cataloghi, PDF, lista spesa, backup, aggiornamenti) non chiamano OpenAI. OpenAI viene usata solo quando chiedi di estrarre una nuova ricetta.
