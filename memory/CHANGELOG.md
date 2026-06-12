# FAMMY — CHANGELOG

> Le voci più recenti in alto. Il PRD completo è in `/app/memory/PRD.md`.

## 2026-06-12 (quinquies) — Logica notifiche incarichi + promemoria a orario + modal full-screen

### Bug 1: il creatore riceveva notifiche per le proprie azioni
- "📋 Nuovo incarico": il watcher locale tasks INSERT non escludeva l'autore
  → fix in `useEventNotifications.jsx` (skip se `author_id ∈ myMemberIds`).
- "✅ X se ne occupa": scattava su QUALSIASI INSERT in task_assignees, inclusa
  l'assegnazione fatta dal creatore alla creazione (anche verso placeholder
  senza account, es. Jenna non ancora registrata). Nuove guardie nel watcher:
  1. `wasSelfAssignment(taskId)` — marker localStorage scritto da
     AddTaskModal (create+edit), AbsenceModal (riassegna), TaskDetailModal
     (delega + unassign-restore) quando IO modifico gli assegnatari
     (nuovo file `src/lib/assignMarker.js`). Il claim (`claimOnly`,
     swipe "Me ne occupo io", azione push) NON marca: deve notificare.
  2. Skip se assegnazione entro 2 min dalla creazione del task (cross-device).
  3. Skip se l'assegnatario è un placeholder senza account (non può
     essersi preso l'incarico da solo).

### Feature: ⏰ promemoria push all'ora dell'incarico
Caso d'uso: incarico auto-assegnato come promemoria → push al giorno e
all'ora impostati (due_date + due_time), NON alla creazione.
- ➕ `task-reminder-push.ts` (standalone): cron ogni minuto, calcola data/ora
  in Europe/Rome via Intl, matcha `due_date=oggi AND due_time=adesso AND
  status≠done`, push agli assegnatari (`⏰ <titolo> — È l'ora che avevi
  impostato · 🕒 HH:MM`, tag `task-due-<id>`).
- ➕ `fammy-task-reminder-cron.sql`: job pg_cron 'fammy-task-reminder'
  (* * * * *), pattern identico al promemoria farmaci.
- AZIONI UTENTE: creare la NUOVA edge function `task-reminder-push` nel
  dashboard + eseguire l'SQL. ESEGUITE? da confermare.

### Bug 2: modal "Nuovo incarico" ballava a destra/sinistra e non era full-screen
- `.modal { overflow-x: hidden }` (stop pan orizzontale da figli larghi).
- Nuova variante `.modal-full` (100dvh - safe-area) applicata ad AddTaskModal;
  su desktop ≥768px torna al comportamento standard (92vh, centrato).

Build OK + smoke preview OK. Test funzionale push → utente su device reali.

## 2026-06-12 (quater) — Fix schermo bianco al rientro + opzione Spese

### Bug P0: schermo bianco al rientro nell'app (es. dopo invito WhatsApp)
Causa doppia su iOS PWA standalone:
1. `window.open('https://wa.me/...', '_blank')` può lasciare la PWA su una
   pagina morta dopo il redirect wa.me → WhatsApp.
2. Bug noto WebKit: al rientro da app esterne la pagina viene ripristinata
   in stato "morto" (niente paint) → bianco fisso.

### Fix
1. ➕ `src/lib/openExternal.js` — apre URL esterni con anchor temporaneo
   `target=_blank rel=noopener` (delegato all'OS, contesto PWA intatto).
   Sostituito `window.open` nei 4 punti wa.me: `FamilyInviteModal.jsx` (x2),
   `InviteShareModal.jsx`, `CareReportShare.jsx`.
2. **Watchdog white-screen** in `main.jsx`:
   - `pageshow` con `persisted=true` → reload
   - `visibilitychange→visible`: se `#root` è vuoto → reload; altrimenti
     nudge di repaint (`translateZ(0)` + rAF reset) per sbloccare il compositing.

### Feature: 💶 Spese come schermata iniziale
Terza opzione nel selettore "Schermata iniziale" (Profilo → App & Lingua).
Icone allineate alla bottom nav (🏠 Bacheca, 📅 Agenda, 💶 Spese).
Validazione aggiornata in `HomeScreen.jsx` e `ProfileTab.jsx`.

Smoke test preview: boot OK con watchdog attivo. Build OK.
⚠️ Da verificare dall'utente su iPhone reale (il white-screen è solo su device).

## 2026-06-12 (ter) — Personalizzazione schermata iniziale (Bacheca o Agenda)

### Feature (richiesta utente, priorità su condivisione foto)
Nuova preferenza "Schermata iniziale" in Profilo → App & Lingua: pill
📋 Bacheca / 📅 Agenda. Salvata in `localStorage('fammy_start_tab')`
(per-dispositivo, stessa convenzione del tema). `HomeScreen.jsx` inizializza
`activeTab` dalla preferenza. i18n in 4 lingue (`profile_start_tab[_hint]`).
data-testid: `profile-start-tab-bacheca|agenda`. Build OK.

### Nota
La condivisione foto/ricordi via Web Share API (scelta d) è stata INIZIATA
(esplorazione: FamilyMemoriesCard.jsx, pattern navigator.share già presente in
FamilyInviteModal.jsx:140 e CareReportShare.jsx:123) ma MESSA IN PAUSA su
richiesta utente. È il prossimo task in coda.

## 2026-06-12 (bis) — ROOT CAUSE push iPhone: VAPID_PUBLIC_KEY errata su Supabase

### ✅ VERIFICATO DALL'UTENTE (12 giu, 09:14)
Dopo la rotazione delle chiavi VAPID, screenshot dell'iPhone con la notifica
"☀️ Buongiorno! Ecco la tua giornata — Oggi ti aspettano 1 incarico" arrivata.
Push iOS funzionanti per la PRIMA volta + digest del mattino live.

### Diagnosi (via confronto digest SHA256 dei Secrets!)
Il test push restituiva 400 da Apple anche con subscription appena rigenerata.
Supabase non mostra i valori dei secret ma il loro digest SHA256 → calcolati
i digest dei valori attesi e confrontati con gli screenshot:
- `VAPID_SUBJECT` digest = sha256('mailto:raffael.renga84@gmail.com') ✓ corretto
- `VAPID_PUBLIC_KEY` digest ≠ sha256 della chiave usata dal frontend ✗ MISMATCH
→ Il server firmava con una coppia VAPID diversa da quella delle subscription
→ Apple risponde 400 BadJwtToken (Google storicamente più permissivo).

### Fix — rotazione completa coppia VAPID
Nuova coppia generata e validata (web-push accetta e firma):
- PUBLIC: BJK76d3zk8AqYX5mDakExRQ2sh8frQqoDUgJwgxCSqgJH8BSWo18GzvhkwxWylH53y5U0zJfBqjSNa24vNyk-nI
- PRIVATE: consegnata all'utente per i Supabase Secrets (non in repo)
1. `usePushSubscription.js`: **auto-rotazione** — se la subscription locale è
   legata a una `applicationServerKey` diversa dalla VAPID corrente, elimina
   la riga DB del vecchio endpoint, `unsubscribe()` e re-subscribe fresca.
   Così TUTTI i dispositivi (anche Jenna) si auto-riparano al primo avvio.
2. `send-push.ts`: elimina la subscription anche su 400 con
   `BadJwtToken|VapidPkHashMismatch` nel body (oltre a 403/404/410);
   campo `detail` con il motivo del push service nei results.
3. `NotificationsHealthCheck.jsx`: mostra `detail` negli esiti per device.
4. `.env` locale aggiornato con la nuova public key.

### Azioni utente richieste
1. Supabase Secrets: aggiornare VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (nuova coppia)
2. Vercel env: VITE_VAPID_PUBLIC_KEY = nuova public → Redeploy
3. Re-deploy edge function send-push (v3 con detail + delete BadJwtToken)
4. Save to GitHub; poi su ogni device riaprire l'app (auto-fix) e test push

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
