# FAMMY — Edge Functions all-in-one (Dashboard deploy)

Questa cartella contiene **4 file standalone TypeScript**, ognuno self-contained
(con tutto l'helper Gemini inlinato), pronti per essere copia-incollati nel
Supabase Dashboard senza dover gestire i file `_shared/`.

| File | Function name (on Supabase) |
|------|-----------------------------|
| `ai-chat.ts` | `ai-chat` |
| `ai-weekly-summary.ts` | `ai-weekly-summary` |
| `ai-suggest-task.ts` | `ai-suggest-task` |
| `ai-gift-ideas.ts` | `ai-gift-ideas` |

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

- Le 4 funzioni leggono i secret `GEMINI_API_KEY` e `GEMINI_MODEL` impostati al
  Step 2 (sono globali a tutte le funzioni del progetto).
- `ai-chat` legge anche `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` —
  Supabase li inietta **automaticamente** in ogni Edge Function: non devi farci
  nulla.
- Tutte le funzioni hanno CORS aperto (`*`), quindi funzionano da
  `farxer.com`, da `fammy-flame.vercel.app` e da preview Emergent.
