# FAMMY — Edge Functions all-in-one (Dashboard deploy)

Questa cartella contiene **6 file standalone TypeScript**, ognuno self-contained,
pronti per essere deployati nel Supabase Dashboard / via Management API.

| File | Function name (on Supabase) | Scopo |
|------|-----------------------------|-------|
| `ai-chat.ts` | `ai-chat` | Chat AI assistant |
| `ai-weekly-summary.ts` | `ai-weekly-summary` | Riepilogo settimanale |
| `ai-suggest-task.ts` | `ai-suggest-task` | Smart task hint |
| `ai-gift-ideas.ts` | `ai-gift-ideas` | Idee regalo |
| `send-push.ts` | `send-push` | Invio push notification (Web Push) |
| `cron-digest.ts` | `cron-digest` | Trigger giornaliero/settimanale (chiamato da pg_cron) |

## Deploy steps

### 1. Tabella per la chat history (UNA volta sola)

Supabase Dashboard → **SQL Editor** → New query → incolla il contenuto di
`frontend/fammy-ai-chat-table.sql` → **Run**.

### 2. Secret Gemini (UNA volta sola)

Supabase Dashboard → **Project Settings → Edge Functions → Secrets** →
**+ Add new secret**:
- Name: `GEMINI_API_KEY`
- Value: la tua chiave da Google AI Studio

(Opzionale) `GEMINI_MODEL` = `gemini-2.5-flash` (default già impostato).

### 3. Per ognuno dei 4 file

1. Supabase Dashboard → **Edge Functions** → **+ Create a new function**
2. **Function name**: scrivi ESATTAMENTE il nome (`ai-chat`, `ai-weekly-summary`,
   `ai-suggest-task`, `ai-gift-ideas`)
3. Si apre l'editor con un sample → **CANCELLA TUTTO** e **incolla il contenuto
   del file `.ts` corrispondente** da questa cartella
4. Click **Deploy function** in alto a destra
5. Aspetta ~30 secondi (build Deno)

Ripeti per tutti e 4.

### 3-bis. ⚠️ CRITICO — `verify_jwt = false` al MOMENTO del deploy

Il Dashboard Supabase deploya le Edge Functions con `verify_jwt = true` di
default e l'opzione **non si vede più nella UI** (mostra solo il toggle
legacy). Il gateway risponde sempre **401 `INVALID_CREDENTIALS`** finché
`verify_jwt` non è disabilitato AL MOMENTO del deploy (non basta cambiarlo
dopo via API).

**Workaround**: deploy via **Management API** con `verify_jwt:false` esplicito.
Funziona da bash, da Postman, ovunque — richiede solo un Personal Access Token
generato su https://supabase.com/dashboard/account/tokens.

```bash
PAT="sbp_xxx"
PROJECT="jwzoymvtxjzpymaywjtw"
SLUG="ai-chat"   # ripeti per ai-weekly-summary, ai-suggest-task, ai-gift-ideas

cp ./ai-chat.ts /tmp/index.ts
curl -X POST "https://api.supabase.com/v1/projects/${PROJECT}/functions/deploy?slug=${SLUG}" \
  -H "Authorization: Bearer ${PAT}" \
  -F "metadata={\"name\":\"${SLUG}\",\"entrypoint_path\":\"index.ts\",\"verify_jwt\":false}" \
  -F "file=@/tmp/index.ts"
```

In alternativa via Supabase CLI: `supabase functions deploy ai-chat --no-verify-jwt`.

**Non re-deployare le 4 funzioni AI dal Dashboard** (anche solo "Edit code" +
"Save"): il deploy via UI re-imposta `verify_jwt=true` silenziosamente
ignorando il setting precedente, e l'AI smette di funzionare con 401.

### 4. Test

Apri la funzione → tab **Logs** per vedere eventuali errori in real-time.
Oppure prova via curl (sostituisci `<TOKEN>` con un user JWT):

```bash
curl -X POST \
  "https://jwzoymvtxjzpymaywjtw.supabase.co/functions/v1/ai-suggest-task" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Comprare il pane","lang":"it"}'
```

Risposta attesa:
```json
{"category":"home","suggested_due_date":null,"reasoning":"..."}
```

### Note

- Le 4 funzioni AI leggono i secret `GEMINI_API_KEY` e `GEMINI_MODEL` impostati al
  Step 2 (sono globali a tutte le funzioni del progetto).
- `ai-chat` legge anche `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` —
  Supabase li inietta **automaticamente** in ogni Edge Function: non devi farci
  nulla.
- Tutte le funzioni hanno CORS aperto (`*`), quindi funzionano da
  `farxer.com`, da `fammy-flame.vercel.app` e da preview Emergent.

## 🔔 Push notifications ad app chiusa — setup

### Step A: VAPID keys

Apri un terminale qualsiasi con Node installato e lancia:
```bash
npx web-push generate-vapid-keys
```
Output:
```
=======================================
Public Key:
B...lunga stringa base64-url...
Private Key:
abc...short string...
=======================================
```

Copia entrambe.

### Step B: Frontend env (Vercel)

Aggiungi a Vercel → Project Settings → Environment Variables:
- `VITE_VAPID_PUBLIC_KEY` = la **public key**

Redeploy il sito.

### Step C: Supabase Secrets (Edge Functions)

Supabase Dashboard → Project Settings → Edge Functions → Secrets, aggiungi:
- `VAPID_PUBLIC_KEY`  = (stesso valore di sopra)
- `VAPID_PRIVATE_KEY` = (la private key — NON METTERLA nel frontend!)
- `VAPID_SUBJECT`     = `mailto:la-tua-email@example.com`

### Step D: Deploy `send-push` e `cron-digest`

Stesso workflow Management API (`verify_jwt: false` perchè la sicurezza è
gestita via Bearer service_role_key passato dal cron):

```bash
PAT="sbp_xxx"
PROJECT="jwzoymvtxjzpymaywjtw"

for SLUG in send-push cron-digest; do
  cp ./${SLUG}.ts /tmp/index.ts
  curl -X POST "https://api.supabase.com/v1/projects/${PROJECT}/functions/deploy?slug=${SLUG}" \
    -H "Authorization: Bearer ${PAT}" \
    -F "metadata={\"name\":\"${SLUG}\",\"entrypoint_path\":\"index.ts\",\"verify_jwt\":false}" \
    -F "file=@/tmp/index.ts"
done
```

### Step E: SQL push (UNA volta)

Apri `frontend/fammy-push-notifications.sql` e fallo girare su Supabase
Dashboard → SQL Editor → Run. Crea la tabella `push_subscriptions`, installa
le estensioni `pg_cron`/`pg_net`, registra i job cron.

### Step F: Inserisci edge_base_url e service_role_key in `fammy_private.config`

Lo SQL del passo precedente NON inserisce questi valori (sono per-progetto).
Apri di nuovo SQL Editor e lancia:

```sql
insert into fammy_private.config (key, value) values
  ('edge_base_url',    'https://jwzoymvtxjzpymaywjtw.supabase.co'),
  ('service_role_key', 'eyJxxxxxx...<SERVICE_ROLE_KEY da Settings → API>')
on conflict (key) do update set value = excluded.value;
```

⚠️ La `service_role_key` la trovi su Supabase Dashboard → Settings → API →
"Project API keys" → `service_role` (NON l'anon/publishable!). Resta
salvata solo in `fammy_private.config`, schema isolato da auth, e solo le
funzioni `SECURITY DEFINER` la possono leggere.

### Step G: Test

```bash
# Test manuale send-push (sostituisci con un tuo user_id reale)
curl -X POST "https://jwzoymvtxjzpymaywjtw.supabase.co/functions/v1/send-push" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<TUO_USER_ID>","title":"Test FAMMY","body":"Funziona!"}'

# Test manuale cron-digest
curl -X POST "https://jwzoymvtxjzpymaywjtw.supabase.co/functions/v1/cron-digest" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"kind":"daily"}'
```

### Note finali

- Le push notification arrivano anche con **app chiusa** ma SOLO se l'utente
  ha installato la PWA (Add to Home Screen) o tiene il browser in background.
- iOS supporta Web Push dal 16.4+ ma SOLO se l'app è installata come PWA.
- Il cron 21:00 IT è schedulato come 19:00 UTC nel SQL (vedi `pg_cron` lines).
  Se sei in inverno (UTC+1) le notifiche arriveranno alle 20:00 ora italiana —
  cambia il cron a `0 20 * * *` se ti serve sempre 21:00 IT solare.
