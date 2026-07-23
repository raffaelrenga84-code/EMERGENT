# FAMMY — Edge Functions (deploy da Dashboard / Management API)

Questa cartella è l'**archivio di sicurezza** del codice delle Edge Functions
che girano in produzione su Supabase.

> ⚠️ **Il codice vero vive su Supabase, non qui.** Le funzioni vengono
> modificate e deployate dalla Dashboard. Questa cartella serve a non perderle
> se l'account avesse un problema, e a poter leggere/diffare il codice da
> GitHub. **Va riallineata dopo ogni modifica** (vedi "Backup automatico").

---

## Funzioni attualmente deployate (12)

| File | Function name | Scopo | Trigger |
|------|---------------|-------|---------|
| `ai-chat.ts` | `ai-chat` | Chat AI assistant | chiamata dal client |
| `ai-gift-ideas.ts` | `ai-gift-ideas` | Idee regalo | chiamata dal client |
| `ai-suggest-task.ts` | `ai-suggest-task` | Smart task hint | chiamata dal client |
| `ai-weekly-summary.ts` | `ai-weekly-summary` | Riepilogo settimanale | chiamata dal client |
| `birthday-reminder-push.ts` | `birthday-reminder-push` | Promemoria compleanni | pg_cron |
| `cron-digest.ts` | `cron-digest` | Digest giornaliero/settimanale | pg_cron |
| `event-logistics-reminder.ts` | `event-logistics-reminder` | Promemoria logistica eventi | pg_cron |
| `medication-reminder-push.ts` | `medication-reminder-push` | Promemoria medicine | pg_cron (ogni minuto) |
| `parse-schedule.ts` | `parse-schedule` | Import turni da foto | chiamata dal client |
| `send-push.ts` | `send-push` | **Invio Web Push** (usata da tutte le altre) | chiamata da client + funzioni |
| `task-reminder-push.ts` | `task-reminder-push` | Promemoria incarichi | pg_cron |
| `weekly-calendar-sync.ts` | `weekly-calendar-sync` | Sync calendari | pg_cron |

`send-push` è la funzione più critica: se si rompe, **tutte** le notifiche
dell'app smettono di funzionare in silenzio.

---

## ☠️ Cartella pericolosa: `supabase/functions/`

Nel repo esiste ancora `frontend/supabase/functions/` con 5 funzioni in vecchio
formato CLI, tra cui una **`send-push` incompatibile**: accetta solo webhook su
`tasks`/`events` e **scarta** le chiamate con `user_ids` restituendo `ignored`
con status 200.

Se venisse deployata sovrascriverebbe quella buona e **tutte le push
smetterebbero di arrivare senza alcun errore visibile** (`pushClient.js`
controlla solo `res.ok`, e 200 passa il controllo).

**Non deployare mai nulla da quella cartella.** Va cancellata o rinominata
`_OLD_DO_NOT_DEPLOY/`.

---

## Backup automatico (consigliato)

Invece di copiare a mano il sorgente dalla Dashboard, lancia lo script che
scarica tutte le funzioni deployate:

```bash
# 1. Genera un Personal Access Token:
#    https://supabase.com/dashboard/account/tokens

# 2. Da questa cartella:

# Windows (PowerShell)
$env:SUPABASE_PAT="sbp_incolla_qui"
node backup-edge-functions.mjs

# Mac / Linux
SUPABASE_PAT="sbp_incolla_qui" node backup-edge-functions.mjs
```

Lo script:
- elenca tutte le funzioni del progetto
- scarica il sorgente di ognuna (`GET /v1/projects/{ref}/functions/{slug}/body`)
- salva `<slug>.ts` (o una cartella `<slug>/` se la funzione ha più file)
- scrive `_functions-manifest.json` con versione, `verify_jwt`, `updated_at`

⚠️ Il token **non va mai** scritto nel file né committato: lo script lo legge
solo dalla variabile d'ambiente.

Dopo il backup: committa i file su GitHub.

---

## Deploy di una funzione

### ⚠️ CRITICO — `verify_jwt = false` al MOMENTO del deploy

Il Dashboard deploya con `verify_jwt = true` di default e l'opzione **non è più
visibile nella UI**. Il gateway risponde `401 INVALID_CREDENTIALS` finché
`verify_jwt` non viene disabilitato **al momento del deploy** (cambiarlo dopo
non basta).

Deploy via Management API con `verify_jwt:false` esplicito:

```bash
PAT="sbp_xxx"
PROJECT="jwzoymvtxjzpymaywjtw"
SLUG="send-push"

cp ./${SLUG}.ts /tmp/index.ts
curl -X POST "https://api.supabase.com/v1/projects/${PROJECT}/functions/deploy?slug=${SLUG}" \
  -H "Authorization: Bearer ${PAT}" \
  -F "metadata={\"name\":\"${SLUG}\",\"entrypoint_path\":\"index.ts\",\"verify_jwt\":false}" \
  -F "file=@/tmp/index.ts"
```

In alternativa via CLI: `supabase functions deploy <slug> --no-verify-jwt`.

**Non re-deployare dal Dashboard** (nemmeno "Edit code" + "Save"): il deploy via
UI reimposta `verify_jwt=true` silenziosamente e la funzione smette di
rispondere con 401.

---

## Secrets richiesti

Supabase Dashboard → Project Settings → Edge Functions → Secrets:

| Secret | Usato da | Note |
|--------|----------|------|
| `GEMINI_API_KEY` | le 4 funzioni AI | da Google AI Studio |
| `GEMINI_MODEL` | le 4 funzioni AI | opzionale, default `gemini-2.5-flash` |
| `VAPID_PUBLIC_KEY` | `send-push` | da `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | `send-push` | **mai nel frontend** |
| `VAPID_SUBJECT` | `send-push` | es. `mailto:tua@email.it` |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono iniettati automaticamente da
Supabase in ogni Edge Function: non vanno impostati.

Lato frontend (Vercel → Environment Variables): `VITE_VAPID_PUBLIC_KEY` con la
stessa public key.

---

## Test rapido

```bash
# send-push verso un utente reale
curl -X POST "https://jwzoymvtxjzpymaywjtw.supabase.co/functions/v1/send-push" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<USER_ID>","title":"Test FAMMY","body":"Funziona!"}'
```

Risposta attesa: `{"sent":N,...}`. Se torna `{"sent":0,"reason":"no_subscriptions"}`
l'utente non ha dispositivi registrati (o le subscription sono scadute).

Per la diagnostica lato utente: **app → Profilo → Notifiche → Diagnostica
notifiche**, che verifica permessi, service worker, subscription locale e lato
server, e permette di inviare una push di prova.

---

## Note

- Le push arrivano ad app chiusa solo se la PWA è installata (Add to Home Screen).
- iOS supporta Web Push dal 16.4+ **solo** come PWA installata, e invalida le
  subscription con facilità: i doppioni in `push_subscriptions` sono normali,
  vanno ripuliti ogni tanto.
- I cron sono schedulati in UTC: 21:00 ora italiana = `0 19 * * *` in estate,
  `0 20 * * *` in inverno.
- Le assenze **non hanno** una funzione dedicata: la push parte dal client
  (`AbsenceModal.jsx` → `send-push`). Va spostata lato server per essere
  affidabile e per tradurre il testo nella lingua del destinatario.
