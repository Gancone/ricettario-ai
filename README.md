# Ricettario AI v5 — Fortress

Versione progettata con priorità assoluta a stabilità, protezione dei dati e qualità mobile.

## Protezione dati

- Le ricette restano su Supabase e non fanno parte degli ZIP di aggiornamento.
- La cancellazione permanente delle ricette dall'interfaccia/API è disattivata.
- Ogni salvataggio o modifica crea un backup JSON automatico nel bucket privato `ricettario-backups` di Supabase Storage.
- Prima di ogni aggiornamento ZIP viene creato un backup pre-aggiornamento.
- Se la tabella recipes risultasse inaspettatamente vuota, l'app prova a ripristinare automaticamente l'ultimo backup.
- Il browser mantiene anche una copia locale di sicurezza e può reinviarla a Supabase se trova ricette mancanti.
- Il service worker non salva mai in cache le API delle ricette, evitando viste vuote/stale dopo un aggiornamento.

## Immagini

Le nuove estrazioni provano a recuperare la copertina del video e il salvataggio la rende persistente nel bucket `recipe-images`. Le ricette precedenti con fonte social e copertina mancante vengono riparate gradualmente in background.

## Installazione della v5 su Windows

1. Estrai completamente lo ZIP.
2. Fai doppio clic su `INSTALLA-V5.vbs`.
3. Se trova `C:\Users\Admin\Desktop\ricettario-ai-v3` la usa automaticamente; altrimenti chiede di scegliere la cartella del progetto GitHub.
4. Lo script sostituisce solo il codice, conserva `.env.local`, fa commit e push.
5. Aspetta che Vercel mostri `Ready`.

Lo script non esegue query distruttive e non modifica Supabase.

## Aggiornamenti successivi

Da v5 in poi usa Impostazioni → Aggiornamenti ZIP. Dopo l'autorizzazione iniziale del browser, la password non viene più chiesta per un anno su quel dispositivo. Prima di ogni aggiornamento viene creato automaticamente un backup dei dati.
