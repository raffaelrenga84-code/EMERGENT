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

### 3-bis. ⚠️ CRITICO — Disattiva "Verify JWT" per OGNI funzione

Le 4 funzioni gestiscono internamente l'auth (via `supabaseUser.auth.getUser()`).
Il toggle automatico di Supabase NON è compatibile con la nuova `sb_publishable_*`
key + JWT ES256 e restituisce **401 "Invalid credentials"**.

Per OGNI funzione (`ai-chat`, `ai-weekly-summary`, `ai-suggest-task`,
`ai-gift-ideas`):

1. Supabase Dashboard → **Edge Functions** → click sul nome della funzione
2. Tab **Settings** (in alto, accanto a Overview / Invocations / Logs / Code)
3. Trova il toggle **"Enforce JWT verification"** (o "Verify JWT") → **SPEGNILO**
4. Click **Save**

Senza questo step, le funzioni rispondono sempre 401 al frontend.

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
