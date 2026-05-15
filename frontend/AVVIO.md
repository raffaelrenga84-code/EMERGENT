# FAMMY — Come avviarlo sul tuo PC

Questo documento ti guida ad avviare l'app FAMMY sul tuo computer.
Tempo stimato: 10 minuti la prima volta, 30 secondi le volte successive.

---

## 1. Installa Node.js (una volta sola)

Se non l'hai già:
- Vai su https://nodejs.org
- Scarica la versione **LTS** (consigliata, blu)
- Installalo (clicca "Avanti" finché finisce)

Per verificare che sia installato, apri il **Prompt dei comandi**
(tasto Windows → digita `cmd` → Invio) e digita:

```
node --version
```

Se vedi qualcosa tipo `v22.x.x`, sei a posto.

---

## 2. Esegui il trigger di autenticazione su Supabase (una volta sola)

Apri il file [fammy-auth-trigger.sql](fammy-auth-trigger.sql), copia tutto
il contenuto, vai su **SQL Editor** di Supabase, incolla, e clicca **Run**.

Cosa fa: ogni volta che qualcuno fa login per la prima volta, crea
in automatico la sua riga nella tabella `profiles`.

---

## 3. Apri il terminale nella cartella del progetto

- Vai con Esplora File alla cartella `Fammy`.
- Clicca sulla **barra degli indirizzi** in alto (dove c'è il percorso).
- Cancella tutto e digita `cmd`, poi premi Invio.

Si apre il terminale già nella cartella giusta.

---

## 4. Installa le dipendenze (una volta sola)

Nel terminale digita:

```
npm install
```

Aspetta 1-2 minuti. Vedrai scorrere righe di testo. Alla fine torna il
cursore. Se vedi `WARN`, ignorali. Se vedi `ERR!`, mandami uno screenshot.

---

## 5. Avvia l'app

```
npm run dev
```

Vedrai qualcosa tipo:

```
  VITE v5.x  ready in 423 ms
  ➜  Local:   http://localhost:5173/
```

**Apri http://localhost:5173 nel browser.**

Dovresti vedere la schermata di login di FAMMY con il logo 🏡.

Per **fermare l'app**: torna al terminale e premi `Ctrl + C`.
Per **riavviarla**: ridai `npm run dev` (i passi 1, 2, 4 NON vanno rifatti).

---

## 6. Provala

1. Inserisci nome ed email → "Inviami il link di accesso"
2. Apri la tua casella mail → cerca un'email da Supabase → clicca il link
3. Il browser ti riporta su FAMMY, ora sei loggato
4. Crea la prima famiglia
5. Aggiungi il primo incarico col bottone +
6. Marcalo come fatto cliccandoci sopra

I dati ora sono **salvati nel database vero**: chiudi il browser, riaprilo,
sono ancora lì. Lo stesso login dal telefono ti farà vedere gli stessi dati.

---

## Configurazione email Supabase (importante per il magic link)

Se la mail con il link di accesso non arriva o arriva con un dominio strano:

1. Vai sulla dashboard Supabase del tuo progetto.
2. Menu sinistra → **Authentication** → **URL Configuration**.
3. Sotto **Site URL** metti: `http://localhost:5173`
4. Sotto **Redirect URLs** aggiungi: `http://localhost:5173`
5. Salva.

In produzione (quando metteremo l'app online), aggiungeremo anche
l'URL pubblico tipo `https://fammy.vercel.app`.

---

## Cosa c'è dentro questa cartella

```
Fammy/
├── .env.local              ← chiavi Supabase (NON condividere)
├── package.json            ← elenco dipendenze
├── vite.config.js          ← configurazione Vite
├── index.html              ← pagina HTML di partenza
├── fammy-schema.sql        ← struttura database
├── fammy-auth-trigger.sql  ← trigger profilo automatico
├── AVVIO.md                ← questo file
├── src/
│   ├── main.jsx            ← punto di ingresso React
│   ├── App.jsx             ← router principale
│   ├── styles.css          ← design system FAMMY
│   ├── lib/
│   │   └── supabase.js     ← client Supabase
│   ├── screens/
│   │   ├── LoginScreen.jsx
│   │   ├── WelcomeScreen.jsx
│   │   └── HomeScreen.jsx
│   └── components/
│       └── AddTaskModal.jsx
```

---

## Problemi frequenti

**"npm: comando non trovato"**
→ Node.js non è installato. Torna al passo 1.

**"Cannot find module '@supabase/supabase-js'"**
→ Hai dimenticato `npm install`. Lancialo.

**Schermata bianca**
→ Apri la console del browser (F12 → tab Console) e mandami lo screenshot.

**"Mancano le variabili VITE_SUPABASE_URL"**
→ Manca il file `.env.local` o è nel posto sbagliato. Deve stare nella
cartella principale `Fammy/`, non dentro `src/`.

**Il magic link non arriva**
→ Controlla la cartella spam. Se proprio non arriva, su Supabase:
Authentication → Logs, vedi se ci sono errori.
