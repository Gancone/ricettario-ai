# Ricettario AI 6.3 — La tua cucina, ogni giorno

## Novità della 6.3

- Palette salvia con aspetto chiaro e scuro automatico, superfici morbide e illustrazione locale.
- Titoli completi sotto le foto, senza sovrapposizione alle immagini o ai preferiti.
- Griglie adattabili e testi lunghi contenuti in ricette, ingredienti, spesa, cataloghi e nomi ZIP.
- Dettaglio ricetta con testata che cresce con il titolo; testi del sistema leggibili senza ellissi.
- Editor e impostazioni più leggibili, pulsanti comodi da telefono e accesso da tastiera.

Verificata in Chrome a 320, 390, 768 e 1280 px, in modalità chiara e scura,
con titoli, ingredienti e nomi file molto lunghi. Le prove coprono anche salvataggio,
bozze, errori di rete, spesa offline e accesso. La 6.3 non aggiunge migrazioni:
usa `001_backend_safety` e `002_shopping_read` della 6.2.

## Novità della 6.1

- Bozza automatica sul dispositivo, recuperata dopo ricaricamento e conservata durante i cambi di scheda. I file video devono essere selezionati nuovamente dopo un ricaricamento.
- Inserimento manuale delle ricette senza chiamare OpenAI, con controllo dei campi e protezione dai doppi salvataggi.
- Ricerca per più parole in qualsiasi ordine, senza distinzione di accenti, riepilogo della raccolta e azzeramento dei filtri.
- Lista della spesa con errori di sincronizzazione visibili, coda locale dei cambiamenti, riprova e ripartenza alla riconnessione. Le richieste dello stesso dispositivo sono serializzate; modifiche simultanee da dispositivi diversi continuano a seguire l’ultimo salvataggio.
- Quantità diverse degli ingredienti mantenute in lista, rimozione degli acquistati e annullamento dello svuotamento.
- Dosi con frazioni (`1/2`, `1 1/2`, `½`), timer basato sull’orario reale e ricalcolo al ritorno alla pagina. Per ricevere l’avviso del timer occorre lasciare aperta la scheda ricetta; non sono notifiche di sistema in background.
- Modifiche conservate in caso di errore, avviso prima di uscire senza salvare, focus nella scheda ricetta, tasto Esc e pulsanti con etichette accessibili.
- Cataloghi, ricette e spesa caricati indipendentemente; recupero locale additivo che non sovrascrive le ricette già presenti sul server.
- Validazione server dei dati, timeout delle richieste, stato del backup visibile e foto mancanti con recupero manuale.
- Interfaccia più leggibile da telefono, campi senza zoom automatico, supporto alle preferenze di movimento ridotto e cache che non conserva risposte di errore.

## Sviluppo e verifiche

Richiede Node.js 24 e npm. `npm ci` installa le dipendenze bloccate nel lockfile.

- `npm test`: test delle dosi, bozze, ricerca, validazione, UUID ed errori API.
- `npm run typecheck`: controllo TypeScript.
- `npm run build`: compilazione di produzione, possibile anche senza credenziali locali; le API richiedono la configurazione al momento dell’uso.
- `npm run test:browser`: prove desktop/mobile in Chrome, con dati e API simulate. Richiede Google Chrome installato; nessuna ricetta reale viene modificata.

La distribuzione avviene dal ramo `main` tramite Vercel, dopo avere verificato il backup dal sito. Nessuna migrazione del database è richiesta per la 6.1.

## Correzione salvataggio 6.0.1

Gli ID delle bozze sono UUID validi anche nei browser senza `crypto.randomUUID`.
Tempi e porzioni decimali vengono arrotondati per eccesso per le colonne intere di Supabase.
Gli errori di salvataggio compaiono anche accanto al pulsante Salva; i campi numerici vuoti restano non specificati.

Verifica di regressione (Node.js 24): `node --test tests/recipe-save.test.mjs`.

Per l'updater ZIP di questo repository, configurare su Vercel `GITHUB_OWNER=Gancone`,
`GITHUB_REPO=ricettario-ai`, `GITHUB_BRANCH=main` e `GITHUB_UPDATE_TOKEN` con accesso
al repository e permesso Contents in lettura e scrittura. Non inserire il token nel codice.
L'aggiornamento conserva il controllo del backup precedente alla pubblicazione.

Aggiornamento progettato per uso personale, mobile-first e senza nuovi servizi a pagamento.

## Cosa cambia

- Ricette sempre su Supabase, con copia locale e snapshot automatici.
- Backup pre-aggiornamento obbligatorio: se fallisce, l'aggiornamento non parte.
- Accesso personale con cookie annuale. `APP_PASSWORD` è opzionale: se non configurata viene usata `UPDATE_PASSWORD` già presente su Vercel.
- Nessuna seconda password per installare gli ZIP dopo l'accesso al Ricettario.
- Controllo duplicati prima di OpenAI: lo stesso link non viene estratto due volte.
- Cataloghi base sempre disponibili, catalogo suggerito automaticamente e creazione catalogo direttamente nel form.
- Porzioni e valori nutrizionali stimati anche quando il video non li dichiara.
- Note della fonte separate dalle note personali.
- Modifica completa delle ricette già salvate.
- Preferiti e Archivio senza cancellazione permanente.
- Copertine salvate direttamente su Supabase Storage durante l'estrazione; recupero massivo solo manuale.
- PDF con fotografia e note separate.
- Lista della spesa sincronizzata via Supabase Storage.
- Ricerca anche in procedimento e note, più filtri rapidi per tempo/calorie/proteine.
- Porzioni ridimensionabili, timer dai passaggi e Wake Lock per tenere lo schermo acceso.
- Stato sistema nelle Impostazioni.
- Aggiornamenti futuri puliscono automaticamente i file obsoleti nelle cartelle gestite.

## Installazione consigliata dalla v5

Apri il sito v5 → **Altro / Impostazioni → Aggiornamenti ZIP** → seleziona `ricettario-ai-v6.zip` → installa.

La prima apertura della v6 chiede la password personale. Se non hai configurato `APP_PASSWORD`, usa la stessa `UPDATE_PASSWORD` che avevi già impostato su Vercel. Il dispositivo resta autorizzato per un anno.

## Fallback senza Prompt

Se l'updater web non fosse disponibile, estrai lo ZIP e fai doppio clic su `INSTALLA-V6.vbs`. Non serve aprire Prompt o PowerShell manualmente.

## Dati

La v6 non esegue `DROP`, `TRUNCATE` o cancellazioni della tabella `recipes`. Le nuove funzioni (preferiti, archivio, note dalla fonte) usano il JSON `nutrition` già esistente e non richiedono modifiche SQL manuali.
