# FAMMY — CHANGELOG

> Le voci più recenti in alto. Il PRD completo è in `/app/memory/PRD.md`.

## 2026-06-12 — Push non consegnate: diagnostica per-dispositivo + reset subscription

### Problema riportato
Test push dice "Inviata a 3 dispositivi" ma nulla arriva (né digest mattutino).
L'utente usa solo 2 dispositivi → nel DB ci sono subscription "zombie":
endpoint creati a febbraio (quando il salvataggio server falliva col bug 400),
riesumati dopo il fix ma ormai non più consegnabili dai push service.
`send-push` contava `sent` solo su accettazione del push service e nascondeva
gli errori non-410 (es. 403 VAPID mismatch) → zero visibilità.

### Fix
1. **`send-push.ts`** (standalone, da rideployare): ritorna `results[]` con
   esito per ogni subscription `{id, ua, ok, status, removed}`; elimina dal
   DB anche i 403 (VAPID mismatch) oltre a 404/410; nuovo campo `failed`.
2. **`NotificationsHealthCheck.jsx`**:
   - Sezione "📱 Dispositivi registrati": elenco da `push_subscriptions`
     (browser+OS da user_agent, ultimo uso, badge "questo dispositivo",
     bottone 🗑 per rimuovere righe zombie).
   - Bottone "🔄 Rigenera la subscription di questo dispositivo": delete riga
     DB + `unsubscribe()` + `subscribe()` fresca + upsert → endpoint nuovo
     di zecca (cura per endpoint morti).
   - Il risultato del test push ora mostra l'esito per dispositivo
     ("Safari · iPhone — ✓ inviata / ❌ scaduta · rimossa (410)").
3. **`usePushSubscription.js`**: esportato `urlBase64ToUint8Array`.
4. i18n: 11 nuove chiavi `nhc_devices_*`/`nhc_resub_*`/`nhc_dev_*` in it/en/fr/de.

### Azioni utente
1. Re-deploy edge function `send-push` (Dashboard → Edge Functions)
2. Save to GitHub (deploya anche il fix AddressAutocomplete)
3. Sul telefono: Diagnostica → Rigenera subscription → Invia push di prova

## 2026-06-12 — Fix schermo bianco su autocomplete indirizzo (mobile)

### Bug (segnalato con screenshot iPhone)
Digitando nel campo Indirizzo (Profilo), il dropdown dei suggerimenti del
web component `<gmp-place-autocomplete>` si staccava dal campo: schermo
bianco, suggerimenti renderizzati in cima al documento, utente costretto
a scrollare su per ritrovare il campo. Causa: il dropdown vive nello
shadow DOM del componente Google con posizionamento proprio che va in
conflitto con lo scroll/resize del viewport mobile a tastiera aperta.

### Fix — riscrittura `AddressAutocomplete.jsx`
- Rimosso il web component; ora usa l'**API programmatica
  `AutocompleteSuggestion.fetchAutocompleteSuggestions`** (sempre Places
  API New, stessa chiave/SKU) con **dropdown custom** renderizzato da noi:
  `position:absolute` ancorato al wrapper del campo → scorre con la
  pagina, zero salti di layout.
- Dettagli: debounce 250ms, min 3 caratteri, max 5 suggerimenti,
  `AutocompleteSessionToken` per billing (reset dopo selezione),
  scarto risposte stale, `scrollIntoView({block:'center'})` al focus
  (spazio per il dropdown sopra la tastiera), `onMouseDown.preventDefault`
  sul dropdown (il tap non fa perdere il focus), Escape/blur per chiudere,
  attribution "powered by Google" (richiesta ToS senza mappa), tema
  dark-ready via CSS vars (`--s`, `--sd`, `--k`, `--km`), estrazione
  lat/lng robusta (metodo `lat()` o proprietà `latitude`).
- Graceful degradation invariata: senza chiave/script il campo resta un
  input normale e il Salva funziona.
- data-testid: `profile-address-input`, `-dropdown`, `-suggestion-{i}`.

### Testing
Harness standalone con mock di `window.google` montando il componente
REALE (esbuild + playwright, viewport mobile 390px): dropdown visibile e
ancorato, 3 suggerimenti, selezione → `onSelect {formattedAddress, lat,
lng, placeId}` corretti, input aggiornato, dropdown chiuso. Build Vite OK.
⚠️ Va testato dall'utente su Vercel (chiave Maps ristretta ai suoi domini).

## 2026-06-11 — Digest del mattino (push ☀️ alle 8:00)

### Feature
Push notification mattutina per tutta la famiglia con gli incarichi e gli
eventi di OGGI ("☀️ Buongiorno! Ecco la tua giornata — Oggi ti aspettano
X incarichi e Y eventi"). Riusa l'infrastruttura del digest serale.

### File modificati/creati
- ✏️ `/app/frontend/supabase/_dashboard_standalone/cron-digest.ts`
  — aggiunto `kind: "morning"`: target = OGGI (il serale guarda DOMANI),
  titolo/copy/tag dedicati (`morning-digest`). Stessa logica già collaudata:
  multi-assignee via `task_assignees`, ricorrenti, `task_completions`,
  regola no-spam (skip utenti con 0 incarichi e 0 eventi).
  Debug fields rinominati: `target_key`, `target_weekday`.
- ➕ `/app/frontend/fammy-morning-digest.sql` (idempotente)
  — `fammy_private.trigger_morning_digest()` (security definer, pattern
  identico a `trigger_daily_digest`) + cron job `fammy-morning-digest`
  a `0 6 * * *` UTC (≈ 8:00 IT estate / 7:00 inverno, stessa convenzione
  UTC fissa del serale).

### Azioni utente richieste
1. Re-deploy edge function `cron-digest` (Dashboard → Edge Functions)
   col contenuto aggiornato di `cron-digest.ts`
2. Eseguire `fammy-morning-digest.sql` nel SQL Editor
3. Test manuale: `select fammy_private.trigger_morning_digest();`

## 2026-06-11 — Hotfix errori HTTP 400 post-restore + pulizia i18n

### Fix database (eseguiti dall'utente via Supabase SQL Editor)
Script: `/app/frontend/fammy-hotfix-400.sql` (idempotente, v2 con cast `attname::text`)
- **`push_subscriptions` 400** → causa: mancava la colonna `last_used_at`
  (il restore aveva usato una definizione vecchia della tabella). Aggiunte
  `last_used_at`, `user_agent`, `created_at` con `add column if not exists`;
  garantito vincolo UNIQUE `(user_id, endpoint)` per l'upsert `on_conflict`;
  ricreata policy RLS `push_subs_self_rw`.
- **`task_attachments` 400** → causa: mancava la FK `task_id → tasks(id)`,
  quindi PostgREST non risolveva il join `tasks!inner(...)` (PGRST200).
  Aggiunta FK `task_attachments_task_id_fkey` (con pulizia righe orfane).
- **`event_attachments` 400** → stessa causa, aggiunta FK
  `event_attachments_event_id_fkey` verso `events(id)`.
- `notify pgrst, 'reload schema'` per ricaricare la cache PostgREST.

**Verifica post-fix (curl su PostgREST):**
- join `task_attachments → tasks!inner` → HTTP 200 ✅
- join `event_attachments → events!inner` → HTTP 200 ✅
- upsert `push_subscriptions` → ora supera schema/constraint (per anon dà
  401 RLS come atteso; per utente loggato funziona) ✅

### Frontend
- **`i18n.jsx`: rimosse tutte le 110 chiavi duplicate** segnalate dal build
  Vercel (script parser custom, semantica JS preservata: l'ultima occorrenza
  vinceva già). Verificato con confronto Node: oggetto `T` identico al 100%
  prima/dopo. Build Vite: 0 warning "Duplicate key".
  ⚠️ Richiede "Save to GitHub" per andare live su Vercel.
