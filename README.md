# Ricettario AI v6 — Precision

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
