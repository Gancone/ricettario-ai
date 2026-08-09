# Il mio Ricettario AI — versione 2

Questa versione prova prima a fare tutto dal **link del video**:

1. incolli un URL pubblico di YouTube / TikTok / Instagram;
2. il server usa `yt-dlp` per recuperare titolo, descrizione e contenuto multimediale;
3. OpenAI trascrive l'audio;
4. l'AI ricava ingredienti e procedimento;
5. controlli e salvi la ricetta.

Il caricamento manuale resta come fallback quando il social impedisce l'accesso automatico.

## Requisiti

- Node.js recente
- `yt-dlp`
- `ffmpeg`
- una `OPENAI_API_KEY`

## Installazione macOS

Con Homebrew:

```bash
brew install yt-dlp ffmpeg
npm install
```

Poi crea `.env.local`:

```text
OPENAI_API_KEY=sk-...
```

Avvia:

```bash
npm run dev
```

e apri `http://localhost:3000`.

## Installazione Windows

1. Installa Node.js LTS.
2. Installa `yt-dlp` seguendo: https://github.com/yt-dlp/yt-dlp/wiki/Installation
3. Installa FFmpeg e assicurati che `ffmpeg` sia disponibile nel PATH.
4. Nella cartella del progetto:

```bash
npm install
npm run dev
```

## Nota importante

Instagram, TikTok e YouTube cambiano frequentemente i loro sistemi. Un link pubblico può funzionare oggi e smettere di funzionare dopo un aggiornamento della piattaforma. Video privati, contenuti che richiedono login o protezioni anti-bot possono non essere recuperabili automaticamente.

Questa versione analizza titolo/didascalia + audio. Una versione successiva può anche estrarre fotogrammi dal video per leggere ingredienti e quantità mostrati solo visivamente sullo schermo.


## Versione 3 — diagnosi e login browser

La v3 prova in quest'ordine:
1. accesso pubblico;
2. cookie della sessione Chrome;
3. cookie della sessione Edge.

Non devi inserire username/password nell'app. Se Instagram/TikTok richiede login, apri il contenuto in Chrome o Edge dove sei già autenticato e poi riprova.

### Test rapido Windows

Nel terminale:

```bat
yt-dlp --version
ffmpeg -version
```

Poi prova direttamente il link:

```bat
yt-dlp -v "INCOLLA_QUI_IL_LINK"
```

Se richiede login:

```bat
yt-dlp --cookies-from-browser chrome -v "INCOLLA_QUI_IL_LINK"
```

oppure:

```bat
yt-dlp --cookies-from-browser edge -v "INCOLLA_QUI_IL_LINK"
```

La v3 mostra nel browser l'errore reale di yt-dlp invece del messaggio generico.
