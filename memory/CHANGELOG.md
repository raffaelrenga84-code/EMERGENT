# FAMMY — CHANGELOG

> Le voci più recenti in alto. Il PRD completo è in `/app/memory/PRD.md`.

## 2026-06-13 — Fix FAB sopra toast medicina + bug cron push medicine

### Bug 1: FAB rosso "+" copre il toast promemoria medicina (non cliccabile)
Il FAB (`.fab`, z-index 50/900) era posizionato a `bottom: 92px` mentre il
toast medicina a `bottom: 84px`. Il "+" coperchiava il bottone "⏭️ Salta"
del promemoria → utente non poteva interagire.
**Fix CSS** (`styles.css`): quando `[data-testid="medication-reminder-toast"]`
è nel DOM, il FAB scivola sopra al toast (`bottom: 240px`, transition 220ms
fluida). Stesso trattamento per `.fab.ai-fab` (`bottom: 316px`).

### Bug 2: push medicina mai consegnata fuori dall'app
🎯 **Root cause vera**: nel file `fammy-medication-cron.sql` il cron pg_cron
schedulato ogni minuto usava una query SBAGLIATA per leggere la config:
```
select edge_base_url || '/...' from fammy_private.config limit 1
```
La tabella `fammy_private.config` ha schema `(key text, value text)` →
la colonna `edge_base_url` NON esiste → ogni esecuzione del cron falliva in
silenzio dal giorno 1. Per questo i promemoria medicina non arrivavano mai
come push, mentre task/commenti/foto sì (usano i DB trigger immediati).

**Fix**: nuovo file `/app/frontend/fammy-medication-cron-FIX.sql` con la
query corretta (pattern identico a quello degli altri cron):
```
url := (select value from fammy_private.config where key = 'edge_base_url')
       || '/functions/v1/medication-reminder-push'
```
Lo script include anche query di verifica (`cron.job_run_details`) + trigger
manuale di test. Corretti per coerenza anche `fammy-medication-cron.sql`,
`fammy-RESTORE-2-of-3.sql`, `fammy-MASTER-restore-after-reset.sql`.

### ⚠️ AZIONE UTENTE
1. **Save to GitHub** → deploy Vercel del fix CSS.
2. **Supabase → SQL Editor** → esegui `fammy-medication-cron-FIX.sql`.
3. **Verifica** (opzionale, query in fondo allo script):
   - `select * from cron.job where jobname='fammy-medication-reminder';`
   - Dopo 1-2 minuti: `select * from cron.job_run_details ... limit 5;`
     → deve uscire `status='succeeded'`.
4. **Test fine**: imposta una medicina con orario tra 2-3 minuti → chiudi
   completamente la PWA → attendi → la push deve arrivare come per i
   task/commenti.

## 2026-06-12 (decies) — Fix doppia push "Nuovo incarico"+"Assegnato a te"

### UPDATE (stesso giorno): autore notificato in scenario MULTI-FAMIGLIA
L'utente (creatore) riceveva le notifiche del proprio task: con la vista
multi-famiglia, il task viene creato nella famiglia degli ASSEGNATARI ma
`author_id` era il member id del creatore in UN'ALTRA famiglia → tutti i
filtri "escludi autore" fallivano. Fix su 3 livelli:
1. `AddTaskModal.jsx`: `finalAuthorId` = il MIO membro della famiglia
   FINALE (lookup per user_id); usato in author_id e initialStatus.
2. `notify_task_assigned` (SQL, incluso in fammy-fix-double-push.sql):
   confronto autore/assegnatario per USER ID, non per member id.
   Patch applicata anche a MASTER-restore, RESTORE-3-of-3, push-on-tasks.
3. `task-reminder-push.ts`: lookup globale dell'autore (fallback fuori
   famiglia) nella coda "Nuovo incarico".
Desiderata utente confermato: il creatore deve ricevere SOLO follow-up
(chi accetta, commenti, foto) — mai notifiche delle proprie azioni.

### Problema
Famiglia da 2: l'assegnatario riceveva 2 push per lo stesso task. Causa:
trigger `notify_task_created` (su tasks INSERT) non può escludere gli
assegnatari perché vengono inseriti DOPO il task (transazioni separate).

### Soluzione — coda con debounce
- SQL `fammy-fix-double-push.sql` (DA ESEGUIRE): nuova tabella
  `public.task_notify_queue` (RLS senza policy = solo service_role);
  `notify_task_created` ora ACCODA invece di inviare.
- `task-reminder-push.ts` (DA RIDEPLOYARE): nuova sezione A che processa
  la coda dopo ~45s → invia "📌 X · Nuovo incarico" alla famiglia
  ESCLUDENDO autore e assegnatari; campo `queue_sent` nelle risposte.
  Il trigger "Assegnato a te" resta immediato e invariato.
- Frontend: rimossa la notifica LOCALE "Nuovo incarico" dal watcher
  realtime (era un ulteriore doppione del push server per chi ha l'app
  aperta); rimossa la funzione `showNewTaskNotification` non più usata.

### Risultato atteso
- Assegnatario → SOLO "Assegnato a te" (immediata)
- Altri familiari → SOLO "Nuovo incarico" (entro ~1-2 min)
- Autore → niente

## 2026-06-12 (nonies) — Update banner: auto-reload silenzioso all'avvio

Domanda utente: "ogni volta che apro l'app mi dice ricarica". Causa: ~6 deploy
nello stesso giorno → ogni apertura trovava una nuova versione (comportamento
by design del banner). Miglioria UX in `UpdateBanner.jsx`:
- Se l'update viene rilevato nei primi 15s dall'avvio → `location.reload()`
  silenzioso (nessun lavoro da perdere), guard anti-loop via sessionStorage
  (max 1 auto-reload/minuto).
- Banner mostrato SOLO per update che arrivano a sessione in corso.

Risposta data: le medicine pre-esistenti ricevono comunque le notifiche
(il cron legge tutte le medicine attive dal DB ogni minuto).

## 2026-06-12 (octies) — Fix i18n schermata iniziale + overflow form medicine

### Bug 1: chiavi raw "PROFILE_START_TAB" visibili nel Profilo
Le chiavi `profile_start_tab` / `profile_start_tab_hint` erano presenti in
en/fr/de ma MANCAVANO nel blocco italiano (l'edit della 16.5.48 era stato
applicato in un punto sbagliato). Aggiunte nel blocco it.

### Bug 2: form medicine sborda a destra su iPhone
Causa: gli input date/time su iOS hanno una min-width intrinseca che nei
flex row impedisce la compressione → la riga sborda (bottone "+ Aggiungi"
e campo "Al" tagliati). Fix:
- CSS globale: `.modal input[type=date|time|number] { min-width:0; max-width:100% }`
- MedicationsModal: `minWidth:0` sugli input flex, `flexShrink:0 +
  whiteSpace:nowrap` sui bottoni "+ Aggiungi".

### Stato azioni Supabase (CONFERMATE FATTE dall'utente, 12 giu):
✅ fammy-care-upgrade.sql · ✅ medication-reminder-push redeploy (2 deploy)
✅ task-reminder-push creata (+ cron SQL) · ✅ hotfix get_invitation eseguito

## 2026-06-12 (septies) — Grafici salute 30gg + Report per il medico con QR

### Feature 1: mini-grafici andamento (tab 🩺 Profilo del Care Hub)
➕ `HealthTrendsCard.jsx`: SVG charts ultimi 30 giorni da daily_diary —
pressione (SYS/DIA, due linee) e peso, con ultimo valore evidenziato.
Si nasconde se < 2 rilevazioni. Montata sopra MedicalProfileSection.

### Feature 2: Report per il medico (immagine condivisibile con QR FAMMY)
➕ `src/lib/doctorReport.js`: genera PNG A4-style via canvas con:
header FAMMY + data, grafici 30gg (pressione+peso), profilo medico,
terapia (con periodo 📅 e cambi di frequenza 🔁), diario recente (14 voci),
footer brandizzato con QR code → https://farxer.com (lib `qrcode` aggiunta
via yarn). Bottone "🧑‍⚕️ Report per il medico (immagine)" in cima a
CareReportShare: genera + `navigator.share({files})` (fallback download).

### Testing
Harness con dati mock (esbuild bundle reale + playwright): immagine
generata correttamente, layout verificato visivamente (grafici, fasi
terapia, QR in basso a destra). Build Vite OK.

### Note
- i18n: nuove chiavi crs_doctor_*, ht_*, dr_* (it/en, fr/de via fallback).
- Richiede solo "Save to GitHub" (nessuna azione DB).

## 2026-06-12 (sexies) — Upgrade Assistenza: pressione + periodo/fasi medicine

### Richieste utente
1. Pressione sanguigna nel Diario.
2. Medicine: periodo di assunzione "dal… al…".
3. Medicine: frequenza variabile (sett.1: 2 volte/giorno → sett.2: 1 volta).

### Implementazione
- SQL `fammy-care-upgrade.sql` (DA ESEGUIRE dall'utente):
  `daily_diary.bp_systolic/bp_diastolic smallint`,
  `medications.schedule_phases jsonb` (start/end_date esistevano già).
- `DailyDiarySection.jsx`: campi 🩺 sistolica/diastolica (120/80), salvataggio,
  storico e report condivisibile (`CareReportShare.jsx`) aggiornati.
- `MedicationsModal.jsx`: form con "Periodo di assunzione" (Dal default oggi /
  Al opzionale) + sezione "🔁 Cambi di frequenza" (fasi: {from, times[]},
  editor orari per fase). Card medicina: mostra periodo (📅 12 giu → 26 giu),
  orari ATTIVI oggi (fase corrente), prossimi cambi (🔁 Dal 19 giu: 🕒 08:00),
  stato "✅ Cura terminata".
- ➕ `src/lib/medSchedule.js`: helper condivisi `activeTimesForToday` /
  `isMedActiveOn` usati da card, hook in-app e (in TS) dal cron.
- `useMedicationReminders.js`: i banner in-app rispettano periodo + fasi.
- `medication-reminder-push.ts` (DA RIDEPLOYARE): 🐛 FIX bug latente — gli
  orari erano confrontati in UTC (reminder 2h in ritardo d'estate!). Ora usa
  Europe/Rome via Intl; rispetta start/end_date e schedule_phases;
  scheduled_at = istante UTC dell'orario italiano (ora coerente con i log
  scritti dal client in ora locale).

### Azioni utente PENDENTI (riepilogo completo)
1. SQL: `fammy-care-upgrade.sql` (pressione + fasi)
2. SQL: hotfix `get_invitation` (inviato, forse già eseguito)
3. Re-deploy edge function `medication-reminder-push` (fix UTC + fasi)
4. Nuova edge function `task-reminder-push` + SQL cron (promemoria incarichi)
5. Save to GitHub (notifiche, modal full-screen, diario/medicine UI)

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

## Iterazione 16.5.53 (giugno 2026) — Fix auto-zoom iOS sugli input (globale)
Problema: aprendo qualsiasi finestra/modale (Famiglia, nuovi incarichi,
medicine, assenze…) e toccando un campo di testo, iOS zoomava la pagina
spostando la vista fuori schermo. Causa: font-size degli input < 16px.

### Fix (3 livelli)
- `index.html`: meta viewport con `maximum-scale=1.0` → blocca lo zoom
  automatico al focus (il pinch-zoom manuale resta possibile, iOS 10+).
- `styles.css`: `.input` portato da 15px a 16px; textarea AI drawer 14→16px.
- `styles.css`: guardia solo-iOS `@supports (-webkit-touch-callout: none)`
  che forza `font-size: max(16px, 1em) !important` su input/textarea/select
  (copre anche gli stili inline nei componenti tipo CountryCodeSelect,
  QuietHoursControl, MergeAccountModal). Esclusi checkbox/radio/range.

Verificato via screenshot (viewport iPhone): meta corretto, `.input`=16px,
regola iOS presente nel bundle. ⚠️ Richiede "Save to GitHub" → Vercel,
poi test sull'iPhone dell'utente.

## Iterazione 16.5.54 (giugno 2026) — Pressione: misurazioni multiple al giorno
Richiesta utente: "solitamente si misura la pressione più volte al giorno".

### DB (richiede SQL manuale)
- `fammy-bp-readings.sql`: nuova colonna `daily_diary.bp_readings` (jsonb)
  formato `[{"t":"08:15","sys":120,"dia":80}, ...]` + migrazione dei vecchi
  valori singoli. Colonne legacy bp_systolic/bp_diastolic restano (fallback).

### Frontend
- Nuovo helper `src/lib/bp.js`: getBpReadings (ordina per ora, fallback
  legacy), bpDailyAvg (media giornaliera per i grafici), formatBpReadings.
- `DailyDiarySection.jsx`: lista chips delle misurazioni di oggi (orario +
  valori + ✕ elimina) + riga aggiunta (ora precompilata con adesso, sys/dia,
  bottone +). Ogni misurazione si salva SUBITO via upsert dedicato che non
  tocca gli altri campi del giorno né gli input non ancora salvati.
- **Bug fix latente**: la pressione non veniva MAI salvata (mancava nel
  payload di "Salva oggi") — ora risolto col salvataggio immediato.
- `HealthTrendsCard.jsx` + `doctorReport.js`: grafici 30gg usano la media
  giornaliera; diario nel report mostra tutte le misurazioni con orario.
- `CareReportShare.jsx`: report testuale con tutte le misurazioni.
- i18n: nuove chiavi dd_bp_add / dd_bp_hint (it+en).

Verifica: build Vite OK, unit test logica bp.js OK (ordinamento/media/
fallback/cancellazione), smoke screenshot OK. Il tab Diario è dietro OAuth
Google → verifica visiva finale a carico dell'utente dopo deploy.
⚠️ Ordine deploy: 1) esegui fammy-bp-readings.sql su Supabase, 2) Save to
GitHub → Vercel.

## Iterazione 16.5.55 (giugno 2026) — Report medico: pressione fuori soglia in rosso
- `bp.js`: soglie BP_SYS_LIMIT=140 / BP_DIA_LIMIT=90 + isBpHigh();
  formatBpReadings aggiunge ⚠️ ai valori alti (storico diario + report testo).
- `doctorReport.js` (PNG):
  - grafico pressione: linee soglia tratteggiate rosse a 140 e 90 (etichette
    a sinistra), punti rossi sui giorni con media oltre soglia;
  - diario recente: nuovo renderer wrapSegments multi-colore — ogni
    misurazione fuori soglia in rosso grassetto + ⚠️; legenda finale
    "⚠️ In rosso: pressione ≥ 140/90 mmHg" (i18n dr_bp_alert_legend it+en).
- `DailyDiarySection.jsx`: chips delle misurazioni di oggi in rosso
  (testo+bordo+sfondo) quando fuori soglia.
- Verifica: harness visivo temporaneo (poi rimosso) — grafico e diario
  controllati a schermo, build Vite OK, unit test soglie OK.
- Nessun nuovo SQL richiesto (usa bp_readings dell'iterazione 16.5.54).

## Iterazione 16.5.56 (giugno 2026) — Card Bacheca: badge chat 💬 + miniature foto
Richiesta: dalla Bacheca non si vedeva che un incarico avesse commenti/foto.
- `HomeScreen.jsx`: dopo il load dei task, fetch in parallelo di
  task_responses (task_id, type) e task_attachments; costruisce `taskMeta`
  { taskId: { msgs: n. messaggi NON system, photos: [{id,url}] } } con
  signed URLs in batch (createSignedUrls, bucket privato task-attachments).
- `BachecaTab.jsx` → TaskCard: nuovo prop `meta` (lookup con
  task._origId || task.id per le ricorrenze):
  - badge 💬 N nella riga meta (testid task-chat-badge-{id});
  - riga miniature foto 46px (max 3, bordo+ombra) + etichetta 📷 N
    (testid task-photos-{id}); fallback icona se signed URL mancante.
- Verificato con harness visivo temporaneo (poi rimosso): badge e
  thumbnail visibili sulla card. Build Vite OK. Nessun SQL richiesto.

## Iterazione 16.5.57 (giugno 2026) — Tap su miniatura → foto fullscreen + tap su 💬 → chat
- `BachecaTab.jsx`:
  - tap su una miniatura della card → lightbox a schermo intero direttamente
    in Bacheca (testid bacheca-photo-lightbox) con ✕ chiudi, frecce ‹ ›
    e contatore N/M quando le foto sono più di una; tap fuori chiude.
  - tap sul badge 💬 → apre il TaskDetailModal che parte già sul tab Chat
    (default 'thread'), con stopPropagation per non interferire con la card.
  - TaskCard: nuovo prop onOpenPhoto(index); thumbnails e label 📷 cliccabili.
- Verificato con harness Playwright (poi rimosso): apertura lightbox,
  navigazione 2/2, chiusura, apertura chat dal badge — tutti OK. Build OK.

## Iterazione 16.5.58 (giugno 2026) — Profilo: tendine chiuse + foto profilo + fix colore
- `ProfileTab.jsx`:
  - ProfileGroup: rimossa la persistenza localStorage → entrando in Profilo
    le tendine sono SEMPRE tutte chiuse.
  - Avatar header cliccabile (badge 📷) → opzioni foto: 📷 Carica foto
    (upload su bucket member-avatars, path profiles/{uid}/...),
    ✨ Usa foto Google (da user_metadata.picture, mostrato se diversa
    dall'attuale), 🗑️ Rimuovi foto. testid: profile-avatar-edit,
    profile-photo-options/-upload/-google/-remove.
  - updateAvatarEverywhere + saveColor ora aggiornano `profiles` E TUTTI i
    `members` dell'utente (foto/colore cambiano ovunque nell'app) e mostrano
    alert in caso di errore (prima fallivano in silenzio).
  - 🎨 e 📷 si chiudono a vicenda.
- i18n: profile_photo_upload/google/remove/hint (it+en).
- Verificato con harness: 7 gruppi chiusi di default, opzioni foto al tap
  sull'avatar, palette/foto mutuamente esclusive, 0 errori JS. Build OK.
- Nessun SQL nuovo (bucket member-avatars + policy già esistenti da
  fammy-photo-permissions.sql).

## Iterazione 16.5.59 (giugno 2026) — Famiglia: modifica più intuitiva (no ingranaggio nudo)
Problema: gli utenti non capivano che per cambiare nome/foto famiglia
serviva l'ingranaggio; toccavano la riga e si apriva la tendina membri.
- `FamilyTab.jsx` (vista "Tutte"):
  - avatar/emoji famiglia cliccabile per l'owner con badge ✏️ →
    apre direttamente EditFamilyModal (testid family-avatar-edit-{id});
  - ingranaggio ⚙️ sostituito da bottone etichettato "✏️ Modifica"
    (flex, accanto a 💌 Invita; testid family-edit-btn-{id});
  - header riga convertito da <button> a <div role=button> per permettere
    il bottone avatar annidato (niente bottoni dentro bottoni).
- Vista famiglia singola (hero): avatar cliccabile con badge ✏️
  (family-hero-avatar-edit) + bottone "✏️ Modifica" (era ⚙️).
- Non-owner: nessun badge/bottone (comportamento invariato).
- Verificato con harness: owner vs non-owner, tap avatar apre il modal
  (non la tendina), 0 errori JS. Build OK. Nessun SQL.

## Iterazione 16.5.60 (giugno 2026) — Nuova famiglia: step 2 "aggiungi membri"
Problema: dopo la creazione il modal si chiudeva e la famiglia restava vuota.
- `NewFamilyModal.jsx`: dopo "Crea" non si chiude più; mostra lo step 2
  🎉 "Famiglia creata!" con:
  - 💌 Invita con un link → apre FamilyInviteModal sulla nuova famiglia;
  - ➕ Aggiungi membro (es. nonni, bambini) → apre AddMemberModal
    (contatore "✓ N membri aggiunti" dopo ogni aggiunta);
  - "Più tardi"/"Fatto" → chiude.
  testid: new-family-success-step / -invite-btn / -add-member-btn /
  -later-btn / -added-count.
- `HomeScreen.jsx`: onCreated ora fa solo refreshAll() (la chiusura la
  gestisce il modal stesso con onClose).
- i18n: chiavi nf_* (it+en, fr/de fallback automatico su it).
- Verificato con harness + stub RPC: Crea → step 2 → AddMemberModal →
  Più tardi chiude. 0 errori JS. Build OK. Nessun SQL.

## Iterazione 16.5.61 (giugno 2026) — Onboarding invito + alias famiglia per membro
### 1. Onboarding: invita il partner subito dopo la registrazione
- `WelcomeScreen.jsx` → FamilyCreateForm: dopo la creazione mostra lo step
  🎉 "Famiglia creata!" con 💌 "Invita con un link" (FamilyInviteModal) e
  "Vai alla bacheca →" (testid onboarding-invite-step/-invite-btn/
  -goto-board-btn). skipToBoard/FamilyThenItem/Demo invariati.

### 2. Alias famiglia personale (nome/emoji/foto per membro)
- SQL `fammy-family-alias.sql`: 3 colonne su members
  (custom_family_name/emoji/photo_url). ⚠️ DA ESEGUIRE su Supabase.
- `App.jsx`: select('*, families(*)') (resiliente pre-migrazione) + merge:
  i campi display name/emoji/photo_url usano l'alias se presente; i reali
  restano in real_name/real_emoji/real_photo_url. Tutta l'app a valle vede
  la versione personalizzata automaticamente.
- `EditFamilyModal.jsx`: prop personal + session. personal=true → titolo
  "Personalizza famiglia", sub "Solo tu vedrai... gli altri vedono {reale}",
  salva su members.custom_family_* (errore chiaro se SQL mancante), foto su
  family-photos path alias-{uid}, bottone "↩️ Ripristina originale"
  (family-personal-reset), niente Elimina. Owner-mode: parte dai valori
  REALI e onSaved aggiorna anche real_*.
- `FamilyTab.jsx`: avatar + bottone editabili per TUTTI i membri
  (owner "✏️ Modifica" / membro "✏️ Personalizza") in lista e vista singola;
  personal={created_by !== session.user.id} sui 2 call site del modal.
- i18n: ob_invite_sub, ob_goto_board, fam_personalize, fam_personal_*.
- FIX: rimosso blocco JSX orfano duplicato a fine FamilyTab.jsx (residuo di
  un edit precedente) che rompeva la build.
- Verificato con harness: alias "Casa" visibile, modal Personalizza con nome
  reale + reset, onboarding step invito end-to-end. Build OK.
⚠️ Ordine deploy: 1) fammy-family-alias.sql su Supabase, 2) Save to GitHub.

## Iterazione 16.5.62 (giugno 2026) — Fix: orario medicina non salvato
Bug: l'orario scelto nel time-picker veniva salvato SOLO premendo
"+ Aggiungi"; chi salvava direttamente perdeva l'orario → "Al bisogno".
(Non c'entrava la data di fine: vuota = per sempre, già corretto.)
- `MedicationsModal.jsx` (MedForm):
  - nuovo flag newTimeTouched: se l'utente ha toccato il picker senza
    premere "+ Aggiungi", l'orario viene incluso comunque al submit;
  - default 08:00 NON toccato → resta "al bisogno" (niente falsi orari);
  - stesso auto-include per gli orari delle fasi di frequenza (_touched).
- Verificato con harness + stub supabase (payload catturato):
  1) picker 15:20 senza Aggiungi → ['15:20'] ✓
  2) picker non toccato → [] al bisogno ✓
  3) chip 08:30 + picker 20:00 → entrambi ✓
- Build OK. Nessun SQL.

## Iterazione 16.5.63 (giugno 2026) — Chat non lette stile WhatsApp in Bacheca
- `HomeScreen.jsx`: taskMeta ora include lastMsg {at, author_id} (ultimo
  messaggio non-system per task).
- `BachecaTab.jsx`:
  - tracking "visto" per device in localStorage (fammy_chat_seen_v1);
    markChatSeen all'apertura E alla chiusura del TaskDetailModal;
  - hasUnreadChat: ultimo msg di qualcun altro + successivo all'ultima
    apertura (se l'ultimo è mio → letto);
  - badge 💬 BLU (#2A6FDB) + animazione pulse (classe .chat-badge-unread,
    keyframes fammy-chat-pulse in styles.css) quando non letto; neutro se letto;
  - sortByNews sulla lista "Da fare": prima chat non lette (più recente in
    cima), poi priorità alta/media, poi ordine consueto (sort stabile).
    Archivio "Fatti" non riordinato.
- Verificato con harness: ordine non letta→urgente→normale, badge blu
  pulsante (animationName=fammy-chat-pulse), dopo apertura torna neutro e
  l'urgente risale. 0 errori JS. Build OK. Nessun SQL.
- NOTA: il "visto" è per dispositivo (localStorage); sync cross-device
  richiederebbe una tabella task_reads (eventuale evoluzione futura).

## Iterazione 16.5.64 (giugno 2026) — Badge icona iOS: azzeramento stile WhatsApp
Bug: il numerino rosso sull'icona PWA era incrementale (es. 16) e non si
azzerava aprendo l'app. Causa: il clear del badge c'era già, ma le notifiche
CONSEGNATE restavano nel centro notifiche iOS → al push successivo il SW le
ricontava tutte (getNotifications().length) e il badge ripartiva dal totale.
- `lib/useAppBadge.js`: clearBadge ora (1) azzera il badge, (2) CHIUDE tutte
  le notifiche consegnate (reg.getNotifications().close — come WhatsApp),
  (3) postMessage CLEAR_BADGE al SW (controller || reg.active). Aggiunto
  listener pageshow (resume iOS PWA da standby).
- `public/sw.js`: handler CLEAR_BADGE ora chiude anche le notifiche
  consegnate (waitUntil su ExtendableMessageEvent).
- Sintassi sw.js verificata + build OK. Da testare su iPhone reale dopo
  deploy (push non simulabile in preview): apri l'app col badge attivo →
  badge sparisce e notifiche rimosse; il push successivo riparte da 1.

## Iterazione 16.5.65 (giugno 2026) — Allegati FILE (PDF/doc) su Android + incarichi
Bug 1: nel profilo medico il bottone "📎 File" su Android apriva solo
Camera/Galleria — l'accept conteneva image/* che su Android nasconde il
file manager. Bug 2: su nuovi incarichi/dettagli mancava del tutto il
bottone File.
- Nuovo `lib/fileKind.js`: isImageFile(name) + DOC_ACCEPT (pdf/doc/xls/...
  SENZA image/*).
- `CareAttachments.jsx`: accept del bottone File → solo documenti.
- `PhotoGalleryEditor.jsx` (dettagli incarico): terzo input+bottone 📎
  (photo-gallery-doc-btn-{kind}); bottoni ora SEMPRE visibili anche a 0
  allegati; su iOS input unico image/*+DOC_ACCEPT (il picker iOS ha già
  "Sfoglia"); allegati non-immagine renderizzati come chip 📄 con nome,
  tap → apre signed URL in nuova scheda ({kind}-doc-{id}).
- `AddTaskModal.jsx`: terzo bottone "📎 File" (add-task-attach-file-btn) con
  input dedicato (add-task-file-input-doc); handleFileSelect: i non-immagine
  entrano senza anteprima e mostrano chip 📄 col nome; upload già generico.
- `HomeScreen.jsx`: taskMeta separa photos (solo immagini, thumbnails) da
  docs (contatore); select aggiunge file_name.
- `BachecaTab.jsx`: badge 📎 N sulla card (task-docs-badge-{id}).
- i18n: td_attach_photos → "Foto & file", hint con PDF (it+en).
- Verificato con harness: 3 bottoni gallery, chip PDF nel dettaglio, bottone
  File + selezione PDF reale in AddTaskModal (set_input_files). Build OK.

## Iterazione 16.5.66 (giugno 2026) — 📎 File su Eventi/Spese + feedback Diario
### Eventi & Spese
- `AddEventModal.jsx` / `AddExpenseModal.jsx`: terzo bottone "📎 File"
  (add-event/-expense-attach-file-btn) con input doc dedicato (DOC_ACCEPT
  senza image/* → Android apre il file manager); iOS input unico
  image/*+documenti; non-immagine senza anteprima → chip 📄 col nome.
- `SpeseTab.jsx`: NUOVO viewer allegati sulle card spese (prima gli allegati
  venivano caricati ma MAI mostrati!): fetch batch expense_attachments +
  createSignedUrls; foto = miniature 42px, PDF = chip 📄 col nome, tap →
  apre in nuova scheda (expense-attachments-{id}, expense-att-img/-doc-{id}).
- Eventi: il dettaglio usa già PhotoGalleryEditor (aggiornato in 16.5.65).
### Diario medico
- Nessun blocco di validazione esisteva (tutti i campi opzionali), ma
  mancava QUALSIASI feedback → l'utente pensava che il salvataggio fosse
  rifiutato. Ora: toast "✅ Diario salvato" (fammy_toast) + auto-include
  della misurazione pressione digitata ma non aggiunta col "+" (stesso
  pattern del fix medicine 16.5.62). i18n dd_saved (it+en).
- Verifica: harness su entrambi i modal (bottone 📎 + chip PDF con
  set_input_files reale), build OK. expense_attachments table/bucket già
  presenti nel MASTER sql — nessun nuovo SQL.

## Iterazione 16.5.67 (giugno 2026) — ⚠️ Avviso campi incompleti Diario medico
- `DailyDiarySection.jsx`: nuova `getMissingFields()` — prima del salvataggio
  controlla Umore, Sonno, Peso, Pressione (conta sia misurazioni già salvate
  sia quelle digitate non ancora aggiunte col "+"), Appetito, Note.
- Se mancano campi → `window.confirm` con elenco puntato dei campi vuoti +
  "Vuoi salvare comunque?". Annulla = non salva; OK = salva normale.
- i18n: dd_incomplete_warn, dd_incomplete_continue (it+en).
- Convenzione window.confirm coerente col resto dell'app (EditFamilyModal,
  TaskDetailModal, ecc.). Verifica: esbuild OK, HMR OK, smoke screenshot OK.
  Test e2e manuale richiesto (sezione dietro Google OAuth).

## Iterazione 16.5.68 (giugno 2026) — Diario: chiusura automatica dopo salvataggio
- L'utente segnalava che dopo "💾 Salva oggi" il modale Care restava aperto.
- `DailyDiarySection.jsx`: nuova prop `onSaved` chiamata dopo salvataggio
  riuscito (solo dal bottone principale, NON dal "+" pressione).
- `MedicationsModal.jsx`: passa `onSaved={onClose}` → il Care Hub si chiude.
- Il toast "✅ Diario salvato" è globale (ToastListener su window) → resta
  visibile anche a modale chiuso. Verifica: esbuild + Vite serve OK.

## Iterazione 16.5.69 (giugno 2026) — 💬 Fix scroll chat mobile (P0)
Tre cause radice risolte:
1. **Scroll annidati** (modale overflow-y + lista chat maxHeight 360): su
   Android la lista catturava il touch e l'ultimo messaggio/composer era
   irraggiungibile. Ora con tab Chat attivo il modale diventa
   `.modal.modal-chat` (altezza fissa 92dvh, colonna flex, overflow hidden):
   UNICA area scrollabile `.chat-scroll` (action bar + header + messaggi),
   quick replies + composer FISSI in basso (stile WhatsApp).
2. **Nessun auto-scroll**: nuovo `chatListRef` + `scrollChatToBottom(force)`
   — scroll in fondo all'apertura del tab e su nuovi messaggi (rAF);
   `onLoad` delle foto ri-allinea solo se l'utente è già vicino al fondo
   (non strappa lo scroll mentre legge la cronologia).
3. **Tastiera Android copre il composer**: aggiunto
   `interactive-widget=resizes-content` al viewport meta (index.html) → il
   layout si restringe quando la tastiera è aperta e dvh si adatta.
Extra: `.chat-scroll` con `overscroll-behavior: contain` +
`-webkit-overflow-scrolling: touch` (fix glitch iOS); GiftChatModal ora ha
auto-scroll (mancava del tutto); AbsenceCommentsThread usa `.chat-scroll`.
Verifica: harness HTML con 30 messaggi su viewport 390x700 — auto-scroll
PASS (gap 0px, ultimo msg visibile, composer in viewport), scroll-to-top
mostra action bar con composer sempre fisso. Harness rimosso.

## Iterazione 16.5.70 (giugno 2026) — 🔔 Fix push chat: partecipanti esclusi
Segnalazione: "Jenna non riceve più le notifiche se le scrivo in chat o
inserisco una foto". Dai log Supabase: ZERO invocazioni send-push per i
messaggi incriminati → il client risolveva una lista destinatari VUOTA.
### Root cause
I push della chat andavano SOLO a autore del task + assegnatari +
delegated_from. Chi partecipava alla conversazione senza essere
autore/assegnatario (caso Jenna) non veniva MAI notificato. Conferma:
quando Jenna scriveva, l'autore riceveva regolarmente il push.
### Fix (`TaskDetailModal.jsx`)
- Nuovo helper `chatRecipientMemberIds(threadComments?)`: autore +
  assegnatari + delegated_from + TUTTI i partecipanti al thread
  (author_id dei task_responses); se il task non ha assegnatari (task di
  bacheca aperto) → tutta la famiglia del task. Sender escluso a livello
  user dopo la risoluzione member→user.
- Usato in: addComment (con i comments freschi), upload 📎 dalla chat.
- BONUS BUGFIX: l'upload foto/file dalla tab DETTAGLI (PhotoGalleryEditor
  onAdded) non notificava nessuno → ora crea anche un messaggio nel thread
  (📷 foto → type photo con thumbnail; 📎 doc → comment col nome file,
  così scatta pure il badge non letti) + push agli stessi destinatari.
- Import isImageFile da lib/fileKind.js.
Nota: send-push edge function verificata OK (nessun filtro lato server).
Verifica: esbuild OK, smoke OK. Test push reale richiesto dall'utente
(2 dispositivi con account Google).

## Iterazione 16.5.71 (giugno 2026) — 🐛 Crash Profilo (React error #300)
Segnalazione: "Qualcosa è andato storto / Minified React error #300"
aprendo Tema / Piani e prezzi / Accessibilità / Privacy & dati dal Profilo.
### Root cause
Il useEffect "Foto Google dal metadata auth" (aggiunto con il sync avatar
Google) era posizionato DOPO gli early-return `if (view === 'plans') return
<PricingScreen/>` ecc. in ProfileTab.jsx. Cambiando `view`, React
renderizzava meno hook del render precedente → error #300 → error boundary.
### Fix
Spostato il useEffect nella sezione hook in alto (prima degli early
return), con commento ⚠️ per evitare regressioni. Verificato che nessun
altro hook resti dopo i return condizionali nel componente principale
(i hook a riga 1098+ appartengono a SettingRow/ProfileGroup, ok).

## Iterazione 16.5.72 (giugno 2026) — 🌍 Allineamento completo i18n (en/fr/de)
Segnalazione: "Personalizza" appariva in italiano nella UI inglese
(FamilyTab). Causa: t() fa fallback su T.it per le chiavi mancanti, e i
dizionari erano disallineati: EN −12 chiavi, FR −261, DE −270 (tutte le
feature recenti: Care Hub, medicine, diario, feedback, inviti, push help,
A2HS, alias famiglia, foto task...).
### Fix
- Script una-tantum: inserite TUTTE le chiavi mancanti con traduzioni
  native in en (12), fr (261), de (270) → ora 1066 chiavi identiche in
  tutte e 4 le lingue (validato: 0 mancanti, 0 duplicate, build OK).
- Nuova chiave `fam_edit_h` (titolo modale "Modifica famiglia",
  prima hardcoded in italiano in EditFamilyModal).
- Locale hardcoded 'it-IT' → undefined (locale browser) in FamilyTab
  (compleanno), birthdayUtils, GiftChatModal.
- Verifica runtime via import del modulo: PASS su 6 chiavi campione x4 lingue.
### Debito noto (non bloccante)
- AddTaskModal: weekday picker con etichette 'Dom/Lun/...' hardcoded.
- useEventNotifications.jsx: testi notifiche locali in italiano hardcoded.

## Iterazione 16.5.73 (giugno 2026) — 😊 Fix picker reazioni fuori schermo
Segnalazione: nel picker reazioni della chat appariva solo 🙏 (l'ultimo),
gli altri emoji erano fuori dalla visualizzazione.
### Root cause
`MessageReactions.jsx`: picker `position:absolute` con `right:-8` ancorato
a un wrapper stretto sul lato sinistro del bubble → per i messaggi degli
ALTRI il picker (≈230px) si estendeva a sinistra fuori dallo schermo, e in
più veniva clippato dal contenitore scrollabile della chat (overflow).
### Fix
- Picker ora `position:fixed` (z-index 300, sopra il modale): posizione
  calcolata all'apertura dal getBoundingClientRect dell'anchor, clampata
  dentro lo schermo (margin 8px); flip sotto l'anchor se manca spazio sopra.
- Listener scroll (capture) chiude il picker se la chat scrolla.
- Verifica: harness React root HTML (Vite transform) con 12 messaggi —
  picker non-mio: PASS (left 60, right 290, 6 emoji visibili);
  picker mio: PASS (dentro viewport). Harness rimosso.

## Iterazione 16.5.74 (giugno 2026) — 🔔 Push al creatore su azioni swipe + follow-up "Da seguire"
Richiesta utente: 1) quando qualcuno usa le swipe actions (Me ne occupo /
Fatto / Non posso) la notifica deve arrivare al CREATORE dell'incarico,
mai a chi clicca; 2) se l'assegnatario non interagisce e la scadenza si
avvicina, reminder al creatore ("X non ha interagito, vuoi incaricare
qualcun altro / scrivergli in chat?").
### 1. Push azioni (client)
- BachecaTab: nuovo `notifyQuickAction(task, title)` → push a autore +
  assegnatari correnti (pre-azione), chi clicca SEMPRE escluso (member +
  user level). Hook su quickToggleDone (solo →done: "✅ X ha completato"),
  quickAssignMe ("✋ X se ne occupa"), quickDecline ("🤚 X non può
  occuparsene").
- TaskDetailModal: updateStatus('done') → stessa push via
  chatRecipientMemberIds (fire-and-forget, non ritarda la chiusura modale).
- i18n: push_act_done/claim/decline ×4 lingue.
- NOTA: la notifica locale al creatore (showAssignedToMyTaskNotification,
  watcher realtime) esisteva già ma SOLO con app aperta; ora c'è la push.
### 2. Follow-up creatore (server)
- `_dashboard_standalone/task-reminder-push.ts`: nuova sezione C — alle
  18:00 Europe/Rome (cron al minuto, match orario singolo): task con
  due_date=DOMANI e status='todo' → push al creatore "👀 <title> scade
  domani / X non ha ancora interagito...". Skip se gli unici assegnatari
  sono il creatore stesso (promemoria personale). Test manuale: POST
  body {"manual_followup": true}. Campo `followup_sent` nelle risposte.
- ⚠️ RICHIEDE RIDEPLOY manuale della funzione su Supabase dashboard
  (l'utente l'ha già fatto in passato; il PAT non è salvato nel repo).

## Iterazione 16.5.75 (giugno 2026) — 🚨 Incidente DB: riparazione RLS + inviti
Sintomi post-incidente (dati famiglie persi ieri):
1. "new row violates row-level security policy for table families"
2. Inviti: "record \"mem\" is not assigned yet"
### Diagnosi (via REST anon, senza accesso al DB)
- Schema dati COMPLETO (expense_attachments, custom_family_name, bp_readings,
  schedule_phases, reply_to_id, medical_profiles... tutti presenti).
- create_family_with_owner RPC presente e funzionante (NOT_AUTHENTICATED da
  anon). list_claimable_placeholders ok.
- MANCANO: policy families_insert/update/delete (+ presumibilmente
  members_insert/profiles_insert) e get_invitation è la versione VECCHIA
  buggata (`mem record` non assegnato per inviti generici).
### Fix
- CLIENT (subito attivo): WelcomeScreen FamilyCreateForm ora usa la RPC
  `create_family_with_owner` (SECURITY DEFINER, bypassa RLS) invece del
  doppio INSERT diretto families+members. setCreated({id,name,emoji}).
  NB: NewFamilyModal usava già la RPC.
- SQL: nuovo `fammy-REPAIR-incidente-db-giugno.sql` (idempotente) =
  rls-hotfix (families/members/profiles insert) + get_invitation fixed +
  accept_invitation v2 + list_claimable_placeholders. L'UTENTE deve
  eseguirlo nel SQL Editor.
### Nota UX (domanda utente)
Su iOS i link d'invito si aprono per forza in Safari (le PWA non possono
catturare i link): NON serve sloggarsi — login Google in Safari, accetta,
poi riapri la PWA installata che vede la nuova famiglia dal server.

## Iterazione 16.5.76 (giugno 2026) — ↩️ Risposta diretta (citazione WhatsApp)
Feature richiesta da Jenna: rispondere a un messaggio specifico in chat.
DB già pronto (task_responses.reply_to_id, da fammy-chat-enhancements.sql,
verificato presente in prod via probe REST).
### Implementazione
- MessageReactions: nuova prop `onReply` → il picker long-press mostra
  6 emoji + separatore + bottone ↩️ (PICKER_W ricalcolato con +1 slot).
- TaskDetailModal:
  • stato `replyTo` + banner sopra il composer (nome autore + estratto +
    ✕ annulla, testid task-chat-reply-banner) + focus automatico input;
  • addComment include `reply_to_id` e resetta replyTo;
  • bubble con `c.reply_to_id` → blocchetto citazione (autore + estratto
    2 righe, '📷 Foto' per i messaggi foto, 'Messaggio non disponibile'
    se orfano) con stile adattato mio/altrui (testid task-chat-quote-*);
  • tap sulla citazione → scrollToMessage: scrollIntoView center + flash
    highlight 1.3s sul row (id DOM chat-msg-<id>).
- i18n: td_reply, td_quoted_missing ×4 lingue.
- Verifica: harness React — picker 7 bottoni in viewport, click ↩️
  chiama onReply: PASS. Harness rimosso.
