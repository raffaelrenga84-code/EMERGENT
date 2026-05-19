# FAMMY — Family Organization App (Iterazione 14)

## Iterazione 14.1 (19 maggio 2026, sera) — Hotfix Bacheca

Dopo il deploy di iter 14, l'utente ha segnalato:
1. **i18n IT mancanti**: i chip filtro mostravano `filter_todo` / `filter_urgent` raw → mancavano nelle dichiarazioni IT (esistevano solo in EN/FR/DE come duplicati interni).
2. **Sezioni ridondanti**: "⭐ Solo le mie da fare" + "📋 Tutte" sotto i filtri rapidi erano una doppia gerarchia confusa (sopra i filtri Tutte/Da fare/Urgenti/Solo mie, sotto le sezioni con gli stessi nomi).

### Fix
- **i18n IT**: aggiunti `filter_todo`, `filter_urgent` con emoji (linea 69). Migliorato `filter_all` da "Tutto" → "🌍 Tutte".
- **i18n EN/FR/DE**: emoji-prefix uniformati + rimossi duplicati che convivevano in stesso oggetto (era sopravvissuta solo l'ultima dichiarazione, ora la sola "vera").
- **BachecaTab**: rimosse le due `CollapsibleSection` "mine"/"all" e sostituite con **una sola lista flat** (mie task prima, poi le altre per priorità visuale). Empty state contestuale al filtro attivo. "Fatti" rimane come collapsibile a fondo pagina.
- Nuova i18n key `no_tasks_filter` ("— Nessun risultato con questo filtro —") × 4 lingue.

## Iterazione 14 (19 maggio 2026) — Wave 2 UX Zenzap: Tab orizzontali + Swipe iOS

### Tab orizzontali nei modali di dettaglio
Nuovo componente riusabile **`DetailTabs.jsx`** (pill-shape, sticky, count badge).

**TaskDetailModal** ora ha 3 tab:
- **📋 Dettagli** — banner delega + assegnatari + azioni assegnazione + stato (Da fare/Fatto/Da pagare)
- **💬 Thread** — commenti (con label "sistema" per i system messages) + composer
- **📎 Allegati** — foto allegate (signed URLs, lightbox) + spese collegate (`expenses.task_id`)

**EventDetailModal** ora ha 2 tab:
- **📋 Dettagli** — luogo + note + assegnatari
- **📸 Foto** — galleria con lightbox

Tutti i tab hanno empty state ariosi (emoji 36px + testo).

### Swipe actions iOS Mail-style sui task della Bacheca
Nuovo componente **`SwipeableRow.jsx`** — touch events nativi, axis-lock, snap behavior, auto-trigger past threshold.

Per ogni TaskCard nella Bacheca:
- **Swipe LEFT corto** (~80-220px) → rivela ✓ Completa + 🗑 Elimina
- **Swipe LEFT lungo** (>220px) → auto-Elimina (con confirm dialog)
- **Swipe RIGHT corto** (~80-160px) → rivela azione veloce contestuale:
  - se task done: ↩️ Riapri
  - se assegnato a me: ✓ Fatto
  - altrimenti: 👤 A me
- **Swipe RIGHT lungo** (>160px) → auto-trigger della quick action
- **Tap fuori** o **tap sulla card aperta** → chiude lo swipe

L'azione "Elimina" usa `confirm()` per evitare cancellazioni accidentali (su istanze ricorrenti elimina TUTTA la serie — coerente con la logica esistente di TaskDetailModal).

### Fix bug pre-esistente
`BachecaTab.jsx` referenziava `visibleDones` ma la variabile non era mai dichiarata
(probabile residuo dell'iterazione 13). Aggiunto `applyQuickFilter()` che ora
applica davvero i filtri rapidi (`all`/`todo`/`urgent`/`mine`) ai task in tutte
e 3 le sezioni (Mie, Tutte, Fatti).

### i18n
Nuove key in IT/EN/FR/DE: `td_tab_details`, `td_tab_thread`, `td_tab_attach`,
`td_attach_photos`, `td_attach_expenses`, `td_no_attachments`,
`td_no_linked_expenses`, `td_expense_untitled`, `td_system_label`,
`ed_tab_details`, `ed_tab_photos`, `ed_no_photos`,
`swipe_done`, `swipe_undo`, `swipe_delete`, `swipe_assign_me`.

### File modificati / nuovi
- ➕ `/app/frontend/src/components/SwipeableRow.jsx` (nuovo, 220 righe)
- ➕ `/app/frontend/src/components/DetailTabs.jsx` (nuovo, 70 righe)
- ✏️ `/app/frontend/src/components/TaskDetailModal.jsx` (tabs + attachments fetch)
- ✏️ `/app/frontend/src/components/EventDetailModal.jsx` (tabs)
- ✏️ `/app/frontend/src/screens/tabs/BachecaTab.jsx` (SwipeableRow + filtri funzionanti)
- ✏️ `/app/frontend/src/lib/i18n.jsx` (16 nuove keys × 4 lingue)

### Testing
- Lint: tutti i file ✅
- Smoke test screenshot: login screen renders correctly ✅
- Funzionalità swipe + tab → richiede login Google OAuth (non testabile da
  testing agent automatici); test manuale richiesto dall'utente.

---

# FAMMY — Family Organization App (Iterazione 1-13)

## Problem Statement (originale)
> "crea app per organizzazione famigliare prendendo spunto da quello che ho già fatto nel GITHUB"

L'utente ha caricato il repo `raffaelrenga84-code/fammy` (branch `vercel/install-vercel-…`) — un'app PWA matura per organizzazione famigliare basata su Vite + React + Supabase con auth Google OAuth, multi-famiglia, task, eventi, spese, membri, compleanni e inviti.

## Architettura

- **Frontend**: `/app/frontend/` — Vite 5 + React 18 (serve `yarn start` su port 3000)
- **Backend AI (nuovo)**: `/app/backend/` — FastAPI su port 8001, `/api/*`
- **Auth + DB principale**: Supabase (jwzoymvtxjzpymaywjtw.supabase.co) — Google OAuth + Postgres con RLS
- **MongoDB**: usato dal backend solo per la cronologia chat AI
- **LLM**: Claude Sonnet 4.5 via emergentintegrations (EMERGENT_LLM_KEY)

```
┌─────────────────┐   Supabase JS SDK    ┌──────────────┐
│  Vite/React PWA │ ───────────────────▶ │   Supabase   │
│  (port 3000)    │ ◀───────────────────│ Auth + DB    │
└────────┬────────┘                      └──────────────┘
         │ fetch /api/ai/*
         ▼
┌─────────────────┐  emergentintegrations ┌──────────────┐
│  FastAPI Backend│ ───────────────────▶  │  Claude 4.5  │
│  (port 8001)    │                       └──────────────┘
└────────┬────────┘
         ▼
   MongoDB (chat_messages)
```

## User Personas
- **Genitore organizzatore** (Marco/Sara, 35-50 anni) — primary user, gestisce task della casa, spese, agenda figli
- **Nonni** (60-75) — vogliono restare connessi, ricevere reminder compleanni, vedere agenda nipoti
- **Membro famiglia "leggero"** — riceve solo notifiche, completa task che gli sono assegnati

## Core Requirements (statici, non cambiano)
- PWA installabile, mobile-first, dark/light theme, accessibilità (font size, contrast, reduced motion), i18n (it/en/es/fr/de)
- Multi-famiglia (utente può appartenere a più famiglie)
- Auth via Google OAuth (Supabase)
- Tutti i dati famiglia (task/eventi/spese/membri) live in Supabase con RLS
- Italian primary copy

## Implementato in questa iterazione (15 maggio 2026)
1. **Riorganizzazione progetto** per fit Emergent supervisor
   - `/app/` (root Vite project) → `/app/frontend/`
   - Aggiunto `/app/backend/` con FastAPI
   - `vite.config.js` configurato per host 0.0.0.0:3000 con HMR wss
   - `package.json` aggiunto script `start`
2. **Nuovo design system "Organic & Earthy"** (terracotta + sage + ochre)
   - Font: Cormorant Garamond (headings) + Outfit (body)
   - Palette warm sand `#F7F5F0`, primary terracotta `#C1624B`, sage `#8C9D86`
   - CSS variables update in `styles.css` retrocompatibile con tutte le classi esistenti
3. **4 nuove feature AI** powered by Claude Sonnet 4.5:
   - **AI Family Assistant Chat** (`/api/ai/chat`) — FAB sage in basso a destra, drawer bottom-sheet conversazionale multi-turn con session memory + family context
   - **Weekly Family Summary Card** (`/api/ai/weekly-summary`) — card terracotta/sage in cima alla Bacheca, cached per ISO week, "Rigenera" button
   - **Smart Task Suggestion** (`/api/ai/suggest-task`) — hint inline in `AddTaskModal` (debounce 700ms) che propone categoria + scadenza, "Applica" / "Ignora"
   - **Gift Ideas Modal** (`/api/ai/gift-ideas`) — modale aperta da EditMemberModal (solo se birthdate impostata), interests + range budget personalizzabili
4. **Test backend completi**: 14/14 test green (`/app/backend/tests/test_ai_endpoints.py`)
5. **Fix bug minor**: pagination cronologia chat (sort DESC + reverse per gli ultimi 10 turni)

## Bug fix & enhancements — Iterazione 2 (15 maggio 2026 pomeriggio)
1. **Bug: "Chiedi a qualcuno: Lo fai tu?" mostrava membri di altre famiglie**
   - `TaskDetailModal.jsx` linea 205: aggiunto filtro `m.family_id === task.family_id`
2. **Bug: "Invita" non tradotto nella sezione Famiglia**
   - Aggiunto `invite_btn` + `family_edit_title` + `remove` per IT/EN/FR/DE
   - `FamilyTab.jsx`: rimpiazzati tutti i title hardcoded con t()
3. **Bug: ruoli membro solo in italiano + impossibile aggiungerne uno custom**
   - Aggiunti `role_nonno/nonna/mamma/papa/figlio/...` per IT/EN/FR/DE (14 ruoli × 4 lingue)
   - `AddMemberModal.jsx` e `EditMemberModal.jsx`: usano `translateRole(role, t)` per display
   - Aggiunto bottone "+ Aggiungi ruolo personalizzato" con input testo libero
   - I ruoli "preset" sono salvati in italiano in DB (compat. con dati esistenti); quelli custom sono salvati così come scritti
   - `FamilyTab.jsx` MemberCard: mostra anche lì il ruolo tradotto
4. **Bug: "Could not find birth_date column" quando si modifica un membro**
   - Causa radice: la migration `fammy-add-birthdate.sql` non è ancora stata eseguita sul progetto Supabase dell'utente
   - **AddMemberModal**: ora include il campo "Data di nascita" durante la creazione
   - **EditMemberModal & AddMemberModal**: retry automatico senza `birth_date` se il DB non ha la colonna + mostra un messaggio chiaro `schema_missing_birthdate` che istruisce a eseguire la SQL migration
   - Membro creato anche se la migration non è applicata (graceful degradation)
5. **Notifiche per nuovi commenti**
   - `useEventNotifications.jsx`: sub realtime a `task_responses` (INSERT), filtra system messages + i propri commenti, notifica solo se task della propria famiglia + se sono autore/assegnatario/delegated_from
6. **Notifica locale del riepilogo AI ogni domenica alle 20:00**
   - Scheduler `setTimeout` in `useEventNotifications.jsx`, deduplica con localStorage per ISO week
   - Funziona quando l'app è aperta nel weekend (PWA installata o tab aperto)
   - **Per push reali ad app chiusa**: serve deployare la Edge Function `send-push` su Supabase + impostare `VITE_VAPID_PUBLIC_KEY` + cron pg_cron settimanale che chiami `/api/ai/weekly-summary`. Vedi `PUSH_NOTIFICATIONS_SETUP.md`.

## Iterazione 13 (16 maggio 2026) — Preview famiglia + rigenera codice

### Preview famiglia prima del join (2-step UX)
`JoinFamilyByCodeModal` ora ha 3 stati: `input` → `preview` → `success`.
- **Step input**: l'utente digita il codice 6-char
- **Step preview**: mostra una **card grande** della famiglia (emoji 56px,
  nome Cormorant 24px, "👥 N membri"), invita l'utente a confermare
- **Step success**: animazione 🎉 e auto-close
Se l'utente è già membro (peek `already_member: true`), il pulsante diventa
"🏡 Vai alla famiglia" (no double-join). Confidence boost senza join sbagliati.

### Rigenera codice invito (solo owner)
Nuovo bottoncino "🔄 rigenera codice" sotto il codice grande in
`FamilyInviteModal`, visibile solo all'owner della famiglia. Chiama l'RPC
`regenerate_family_invite_code(family_id)` SECURITY DEFINER con check owner.
Conferma con confirm() prima di procedere. `localFamily` state aggiornato
subito senza ricaricare il modal.

### SQL `fammy-invite-code.sql` esteso
Aggiunte 2 nuove RPC:
- `peek_family_by_code(p_code)` → ritorna `{family_id, family_name, emoji, members_count, already_member}` senza joinare
- `regenerate_family_invite_code(p_family_id)` → solo owner, retry su collisione codice, ritorna `new_code`

Entrambe `grant execute to authenticated`.

## Iterazione 12 (15 maggio 2026, mattina prestissimo) — Codice invito famiglia

### Anti-doppione robusto via codice invito (no email)
L'utente ha fatto notare che basarsi sull'email per dedupare gli account è
fragile (una persona può avere Google→gmail + Apple→icloud + Magic→hotmail =
3 utenti distinti). Soluzione: codice invito di 6 caratteri (alfanumerico,
no caratteri ambigui 0/O/1/I/L), come Splitwise/WhatsApp.

### Nuovi file
1. **`fammy-invite-code.sql`** — colonna `families.invite_code text unique`,
   trigger auto-generate per nuove famiglie, backfill per famiglie esistenti,
   RPC SECURITY DEFINER `accept_family_by_code(p_code, p_name)` che:
   - Trova la famiglia case-insensitive
   - Se l'utente è GIÀ membro → ritorna `already_member: true` senza creare duplicato
   - Altrimenti crea il `members` row con `user_id = auth.uid()`
2. **`JoinFamilyByCodeModal.jsx`** — input visuale 6 char (auto-uppercase,
   filtra non-alfanum, formatta in stile keypad). Stato success/error friendly.
   Già pronto per i18n se serve in futuro.

### Wire-up
3. **`FamilyInviteModal.jsx`** rifatto: hero block con codice grande
   (Cormorant 42px, letter-spacing 0.2em, tap-to-copy), link in `<details>`
   collapsabile, 3 action button compatti (Condividi/WhatsApp/Copia).
   Bug fix shareViaWeb: stesso bug URL doppio risolto (text senza url, OS
   appende url separatamente).
4. **WelcomeScreen.jsx**: nuova HubCard "🎟️ Ho un codice invito" subito
   sotto "Crea famiglia".
5. **FamilyTab.jsx**: bottone tratteggiato "🎟️ Ho un codice invito" affianco
   al "Nuova famiglia" (vista Tutte) — anche per chi è già loggato.

### Flusso end-to-end
- A (owner) crea famiglia → trigger genera codice MX68YV
- A apre Famiglia → "Invita" → vede il codice grande, lo manda via WhatsApp
- B riceve "Codice: MX68YV", apre FAMMY, login Google
- B atterra in WelcomeScreen → tap "Ho un codice invito" → digita MX68YV → unito
- Se B aveva già un altro account (Apple) e tenta di rifare il join → `already_member: true`, no doppione

## Iterazione 11 (15 maggio 2026, dopo mezzanotte) — Bug-fix share + onboarding

### Bug fix: URL doppio nel messaggio "Invita amici"
Quando `ProfileTab.shareApp()` chiamava `navigator.share({ text, url })`:
- il `text` conteneva già `{url}` interpolato → `"... Provalo: https://farxer.com"`
- e `navigator.share` aggiungeva di nuovo `url` come campo separato
- risultato su WhatsApp: l'URL appariva DUE volte di seguito

Fix: usiamo 2 versioni del messaggio:
- `messageBare` (senza url) per `navigator.share` → l'OS appende l'url
- `messageWithUrl` (con url inline) per il fallback clipboard

### Migliorie testo referral
- Pulsante: **"💝 Invita un amico nuovo"** (era "Invita amici a usare FAMMY", troppo vago)
- Sub: chiarito che è per chi *ancora non usa* FAMMY
- Hint sotto: "Per inviti dentro una famiglia, usa Famiglia → Invita"
- Tradotto in IT/EN (FR/DE invariati per ora)

### Onboarding mostrato anche su WelcomeScreen
- `OnboardingTour` (componente esistente, 4 slide: benvenuto / 3 tab / multi-famiglia / aggiungi a Home) era montato solo in `HomeScreen.jsx`. Ma i nuovi utenti senza famiglia atterrano su `WelcomeScreen.jsx`, dove non lo vedevano.
- Aggiunto import + mount con stesso check `localStorage('fammy_onboarding_done')` → tour visibile in tutti i casi.

### Bottone "Rivedi il tour" nel Profilo
Nuova sezione "🎓 Tour & aiuto" in `ProfileTab` con bottone full-width "✨ Rivedi il tour di benvenuto" — utile per chi vuole rivedere/spiegare ad altri.

## Iterazione 10 (15 maggio 2026, mezzanotte) — Memorie filtrate + AI auto-collapse + anti-doppione invito

### Family Memories — upgrade
1. **Filtro per famiglia**: chip "🌍 Tutte" + chip per ogni famiglia (mostrate
   solo se l'utente è in più famiglie). Le foto vengono ri-fetched al cambio.
2. **Click sulla foto apre il task/evento** corrispondente:
   - kind=task → `TaskDetailModal` (con commenti, completamento, etc.)
   - kind=event → `EventDetailModal` (con dettagli + assegnatari + altre foto)
3. Empty state intelligente: "Nessuna foto questo mese in 'Renga'" (mostra il
   filtro attivo).
4. Card spostata da `(familyIds)` a props completi `(families, members, me)` —
   ProfileTab aggiornato di conseguenza.

### WeeklySummaryCard — auto-collapse
- Dopo **10 secondi** dal load completo, la card si riduce a una **barra
  compatta** (eyebrow + prima frase 70 char + freccia per riaprire). Stato
  persistito per famiglia+settimana+lingua (`localStorage`) → se l'utente
  l'ha chiusa, non si ri-apre da sola.
- Pulsante **"⌃ Riduci"** anche manuale dentro la card aperta.
- Tap sulla barra compatta → ri-espande.
- i18n: `collapse_label` IT/EN.

### Anti-doppione invito
- Warning ambra nel **FamilyInviteModal** subito sotto il titolo:
  "⚠️ Per evitare account doppi: di' a chi inviti di aprire prima FAMMY e
  accedere con il provider che usa di solito (Google o Apple). Solo dopo
  dovrà cliccare il link."
- Affronta la causa storica del problema doppioni che l'utente aveva avuto
  (membri con Google su gmail + magic-link Hotmail = 2 utenti distinti).

## Iterazione 9 (15 maggio 2026, notte) — Apple Sign-In + warning duplicati + design polish

### Apple Sign-In abilitato
- Pulsante Apple ora **attivo** (era greyed out con "Soon"): `loginWithProvider('apple')`.
- Warning anti-doppione **sotto i pulsanti**: alert ambra "💡 Già registrato?
  Usa lo stesso provider di sempre per non creare account doppi" — affronta
  esattamente il problema riportato dall'utente (Google+gmail vs Apple+icloud
  → 2 utenti distinti).
- i18n: nuova key `login_warn_dup` in IT/EN/FR/DE.
- ⚠️ NOTA: il pulsante chiama già Supabase Auth con `provider: 'apple'`, ma
  per funzionare in produzione richiede:
  1. Apple Developer Account (99$/anno) → crea Service ID + Sign in with Apple
  2. Supabase Dashboard → Authentication → Providers → Apple → enable + paste
     Service ID, Team ID, Key ID, Private Key.

### Test Push notification button (Profile)
- Nuovo `TestPushButton` component nel Profile → Notifiche.
- Chiama `send-push` edge function con un messaggio di test "🎉 Test FAMMY".
- Diagnostica: distingue "nessuna sub registrata" da "edge function non
  deployata" → l'utente capisce subito cosa sistemare.

### Design polish (CSS-only — `styles-v3.css`)
Importato dopo `styles.css` in `main.jsx`. Override mirati senza rinominare
classi:
- Header hero più editoriale (H1 32px, font Cormorant, letter-spacing -0.025em)
- Family chip switcher più calligrafico (border-radius 14px, padding più morbido)
- Collapsible section headers (Bacheca/Agenda) più ariosi
- Cards con bordo morbido + ombra calda
- Empty states più grandi (emoji 64px, padding 56px top)
- Profile section divider con `var(--sd)` invece di `var(--sm)`
- Member cards più tattili + hover translateY
- FAB con gradient terracotta + scale hover
- Bottom nav: indicator visivo (3px bar in alto) sull'item active

## Iterazione 8 (15 maggio 2026, sera tardi) — Push ad app chiusa + Family Memories

### Push notifications ad app chiusa (Web Push)
1. **VAPID keys** generate per FAMMY:
   - Public:  `BAzrdbzuKWMEgL4t32QPuGQ6CeNyS8wEFZwNjaHAJQ4iNMtAMi7D-wOLgi3-aIfl__xgF0cEjp62up74MXf7WW8`
   - Private: `hUbqJkSVAbCapkzkAPeUYQnjIjkgInpyMnkmAW3c3ok` (mai esporre al frontend)
2. **`fammy-push-notifications.sql`** (NUOVO):
   - Tabella `push_subscriptions(user_id, endpoint, p256dh, auth, …)` + RLS
   - Estensioni `pg_cron` + `pg_net`
   - Schema `fammy_private` con tabella `config` (per service_role_key)
   - Helper SECURITY DEFINER `trigger_daily_digest()` e `trigger_weekly_summary()`
   - 2 job pg_cron: daily 19:00 UTC (≈21:00 IT) + weekly Sunday 20:00 UTC
3. **Edge Function `send-push.ts`** (NUOVO): Web Push singolo invio.
   Riceve `{user_id|user_ids, title, body}`, invia a tutte le subs dell'utente
   via libreria `web-push` su Deno, auto-pulisce le subs 404/410 scadute.
4. **Edge Function `cron-digest.ts`** (NUOVO): chiamata da pg_cron via pg_net.
   `kind=daily` → per ogni utente subscritto, conta tasks/eventi domani
   e invia "🌙 Pronto per domani?" (skip se totale 0 → no spam).
   `kind=weekly` → conta tasks done settimana + eventi prossima settimana
   e invia "✨ Riepilogo della settimana".
5. **Frontend `.env`**: aggiunto `VITE_VAPID_PUBLIC_KEY`. Hook
   `usePushSubscription.js` (già esistente) ora funziona end-to-end.
6. **Service Worker push handler** già presente in `public/sw.js`.

### Family Memories
- **`FamilyMemoriesCard.jsx`** (NUOVO): galleria mensile auto-aggregata.
  Query: `task_attachments` + `event_attachments` JOIN su family_id,
  filtro per mese (created_at). Lightbox con navigazione ← →,
  emoji stagionale per ogni mese (❄️💝🌷🌸🌺☀️🏖️🌻🍂🎃🍁🎄),
  signed URLs su bucket privati, supporto navigazione mese precedente/futuro.
- Integrata in **ProfileTab** come prima sezione dopo profile info.

### Documentazione (`_dashboard_standalone/README.md`)
Aggiornato con sezione completa "Push notifications ad app chiusa — setup":
step A (VAPID), B (Vercel env), C (Supabase Secrets), D (deploy via Management
API), E (SQL), F (config insert), G (test curl).

## Iterazione 7 (15 maggio 2026, fine giornata) — Polish UX + Event detail + filtri Agenda

### Polish UX
1. **Errore AI 503/429/network friendly** in `WeeklySummaryCard.jsx`:
   detect raw error, mostra messaggio user-friendly (no più JSON crudo) + bottone "Riprova".
   Nuove i18n keys: `ai_err_generic`, `ai_err_busy`, `ai_err_quota`, `ai_err_network`, `retry` (IT/EN).
2. **Pull-to-refresh** via nuovo hook `usePullToRefresh.jsx`: tira giù in cima a
   qualunque tab → re-fetch completo. Spinner animato 36px in cima. Su mobile
   touch-only, soglia 70px, dedupe con lock di 600ms post-refresh.
3. **UpdateBanner** ora è un **toast compatto in basso** (era un mega blocco
   in cima che mangiava lo schermo). Auto-dismiss e tap per ricaricare.

### Agenda — filtri + dettaglio eventi
4. **Toggle "👤 Solo a me"** sopra al calendario: filtra eventi (via
   `event_assignees` o `created_by == me`) e task (via `assigned_to` o
   `author_id == me`). Mostra il count dei risultati quando attivo.
5. **EventDetailModal** nuovo componente: click su una event card → apre
   modale con data+ora, luogo, descrizione, **lista assegnatari** con avatar +
   **galleria foto** con signed URL (bucket privato `event-attachments`) +
   lightbox click-to-zoom. Eliminazione solo per il creator.
6. **Notifica push "Sei stato assegnato a un evento"**: listener realtime su
   INSERT in `event_assignees`, risolve `member_id → user_id`, notifica se
   è me e l'autore dell'evento è diverso (no auto-notifica).

## Iterazione 6 (15 maggio 2026 sera++) — Unificazione modali Task/Event + nuovi campi

### Refactor frontend
- **AddTaskModal**: da wizard 3-step → **single-page scrollabile** (stesso layout di AddEventModal). 741 → ~610 righe, tutta la logica preservata (assegnatari multi-famiglia, "Solo per me", ricorrenza con scope thisMonth/forever, calendario mensile, AI hint, foto multiple).
- **AddTaskModal**: aggiunti i campi **ORA** (`due_time` HH:MM) e **LUOGO** (`location`).
- **AddEventModal**: aggiunti **ASSEGNATARI** (accordion per famiglia con "Solo per me" e "Seleziona tutti") e **FOTO** (allega/scatta multipla con preview).
- Entrambe le modali ora hanno data-testid uniformi su tutti gli elementi interattivi.
- Aggiornati i call site di AddEventModal (HomeScreen.jsx, AgendaTab.jsx) per passare `families` + `members`.
- Display dei nuovi campi: TaskDetailModal (`📅 data · 🕐 ora` + `📍 luogo`), BachecaTab card (idem inline).
- AI tool-calling esteso: `[[ACTION:create_task|...]]` ora accetta anche `due_time` e `location`. Il parser frontend (HomeScreen) passa i nuovi prefill al modale.
- Edge function `ai-chat.ts` (sorgente `_dashboard_standalone/`) aggiornata con istruzioni per estrarre ora/luogo dal messaggio utente (estrazione "alle 16:30", "dal panificio", "all'ospedale").

### DB Migration (`fammy-unify-task-event-schema.sql`)
File SQL idempotente che aggiunge:
- `tasks.due_time text` + `tasks.location text`
- Tabella `event_assignees(event_id, member_id)` + RLS + indici
- Tabella `event_attachments(id, event_id, file_path, file_name, created_at)` + RLS
- Storage bucket `event-attachments` + policy
- Add to realtime publication

### i18n
4 nuove key tradotte in IT/EN/FR/DE: `addtask_time_label`, `addtask_loc_label`, `addtask_loc_ph`.

## Iterazione 5 (15 maggio 2026 notte+) — Daily Digest 21:00 + Realtime commenti

### Cosa è stato aggiunto
1. **Digest serale alle 21:00** in `useEventNotifications.jsx`:
   - Scheduler giornaliero che, alle 21:00 locale dell'utente, conta i task con
     `due_date` = domani (status ≠ 'done') e gli eventi con `starts_at` di
     domani, poi mostra una notifica "🌙 Pronto per domani? Domani ti aspettano
     X incarichi e Y eventi. Buona serata!"
   - **No-spam**: se domani non hai nulla, la notifica NON parte.
   - **Dedupe per giornata**: key `fammy_daily_digest_notified_YYYY-MM-DD` in
     localStorage → max una notifica al giorno.
   - Re-arm automatico quando `tasks`/`events` cambiano (la notifica usa
     sempre il conteggio più aggiornato al momento del fire).
   - Disattivabile con il toggle globale "Notifiche" che già esiste.
2. **Pass-through `tasks`** all'hook `useEventNotifications` da `HomeScreen.jsx`.
3. **`fammy-enable-realtime.sql`** (nuovo): garantisce che la publication
   `supabase_realtime` includa `task_responses` (+ tasks/events/expenses/
   task_assignees). Senza questo, il listener `postgres_changes` su
   `task_responses` non riceve gli INSERT e le notifiche "💬 Nuovo commento"
   non scattano. Idempotente.

### Bug verificato (notifiche commenti)
La logica in `useEventNotifications.jsx` lines 171-204 era già corretta:
- skip system message, skip miei commenti, scope per famiglia
- notifica solo se autore/assegnatario/delegated_from
- usa `response.text` (campo corretto in `task_responses`)
Il sospetto principale di mancato funzionamento è che la publication realtime
non includa `task_responses` → fix con la SQL sopra.

## Iterazione 4 (15 maggio 2026 notte) — Fix 401 INVALID_CREDENTIALS Edge Functions

### Problema riscontrato
Dopo migrazione a Supabase Edge Functions (iter 3), le 4 funzioni AI rispondevano
sempre **401 `{"message":"Invalid credentials","code":"INVALID_CREDENTIALS"}`**
sul frontend (utente loggato con JWT ES256 valido).

### Root cause
Il Dashboard Supabase deploya le funzioni con `verify_jwt = true` di default e
l'opzione **non è esposta nella UI** (mostra solo il toggle "Verify JWT with
legacy secret"). Anche dopo aver disabilitato il legacy toggle, il gateway
Supabase continuava a rifiutare con 401. La metadata `verify_jwt=false` via
Management API non veniva applicata al runtime: solo un NUOVO DEPLOY con il
flag esplicito risolve.

### Fix applicato
Re-deploy delle 4 funzioni AI via Supabase Management API con
`verify_jwt: false` esplicito nel multipart metadata, usando un PAT temporaneo
dell'utente (poi revocato).

Stato finale:
- `ai-chat`            v2  verify_jwt=false  ACTIVE ✅
- `ai-weekly-summary`  v2  verify_jwt=false  ACTIVE ✅
- `ai-suggest-task`    v2  verify_jwt=false  ACTIVE ✅
- `ai-gift-ideas`      v2  verify_jwt=false  ACTIVE ✅

Smoke test eseguito da curl: tutte le funzioni rispondono con output JSON
strutturato da Gemini 2.5 Flash. Frontend pronto al test utente.

### Documentazione aggiornata
`/app/frontend/supabase/_dashboard_standalone/README.md` ora include la procedura
Management API per i futuri redeploy + warning sul fatto di NON ri-deployare
dal Dashboard UI (resetterebbe `verify_jwt` a true).

## Iterazione 3 (15 maggio 2026 sera) — GDPR / Compliance UE

1. **Cookie consent banner** (`CookieConsentBanner.jsx`) — primo accesso, persiste in localStorage `fammy_consent` ("all" | "essential"), riapribile via custom event. Blocca `<Analytics />` finché l'utente non clicca "Accetta tutto".
2. **Privacy Policy modal** completa in IT/EN/FR/DE (chi siamo, dati raccolti, base giuridica, sub-processori Supabase/Vercel/Anthropic/Google, retention, diritti GDPR Art. 15-21, cookie, minori).
3. **DataPrivacyScreen** dentro Profilo: 📦 esporta JSON, 🗑️ cancella account, 🍪 rivedi consenso cookie.
4. **SQL RPC `delete_my_account()`** (`frontend/fammy-gdpr-delete.sql`) — `SECURITY DEFINER`, cancella in una transazione famiglie create + propri membri da famiglie altrui + push subs + profile + auth.users.
5. **Bug CSS**: fixate 2 incongruenze di parsing in `styles.css` (regola `.ai-drawer-avatar` non chiusa + `}` orfana) che impedivano al banner di posizionarsi fixed.

### 🎯 Risultati verificati con Playwright
- ✅ Banner cookie compare al primo accesso (no consenso) — position fixed bottom, lingua browser
- ✅ "Accept all" → consent="all" → banner sparisce → Analytics si attiva
- ✅ "Essential only" → consent="essential" → Analytics NON caricato
- ✅ Privacy Policy modal apre dal footer Login con tipografia editorial

## ⚠️ Azione richiesta dall'utente su Supabase
Prima di testare i fix sopra, esegui sul tuo Supabase queste 2 cose:
1. **Authentication → URL Configuration**
   - Site URL: `https://e1a8db2a-a625-4bd8-ad0d-2f9110b01597.preview.emergentagent.com`
   - Redirect URL: la stessa
2. **SQL Editor**: incolla il contenuto di `frontend/fammy-add-birthdate.sql` e clicca Run. Questo aggiunge la colonna `birth_date` ai membri. Senza questa migration, i compleanni non funzionano (ma adesso almeno non rompe più la modifica del membro grazie al fallback).
3. **SQL Editor (GDPR)**: incolla `frontend/fammy-gdpr-delete.sql` e premi Run. Installa la function `delete_my_account()` necessaria per la cancellazione GDPR Art. 17.

## Backlog Prioritizzato

### P0 (bloccanti per testing completo)
- Niente — backend verificato, frontend rendering verificato

### P1 (importanti)
- Aggiungere bottone "Magic Link" sul Login (oltre a Google OAuth) — utente l'ha richiesto
- Mostrare lingua italiana di default nella login screen (attualmente parte in inglese se browser non è italiano — il rilevamento c'è ma per testing automatico mostra English)
- Test manuale end-to-end del flusso Google login → onboarding → AI features (richiede account Google reale)

### P2 (nice-to-have)
- DRY backend: extract helper `run_llm_json(system, user_text)` per dedurre boilerplate dei 3 endpoint single-shot
- Aggiungere `asyncio.wait_for` timeout su `LlmChat.send_message` per evitare worker hang
- Estrazione JSON più robusta (brace-balancing parser invece di regex)
- CORS strict (origin del frontend Vercel + preview emergent) quando si esce da `allow_credentials=False`
- Restituire "AI service temporarily unavailable" generico invece di leak della stack trace

### Future / non in scope
- Sostituire Supabase con FastAPI + MongoDB (richiede riscrittura di 15+ SQL files + RLS + queries)
- Integrare Emergent-managed Google Auth (incompatibile con auth Supabase senza riscrittura)
- Notifiche push via web push (la struttura c'è già nel codebase: `usePushSubscription.js`)

## Setup variabili d'ambiente

### `/app/frontend/.env`
- `VITE_SUPABASE_URL` — URL del progetto Supabase
- `VITE_SUPABASE_ANON_KEY` — chiave anon Supabase
- `VITE_BACKEND_URL` / `REACT_APP_BACKEND_URL` — URL preview emergent per chiamate AI

### `/app/backend/.env`
- `MONGO_URL`, `DB_NAME` — locale, per cronologia chat AI
- `EMERGENT_LLM_KEY` — universal key Emergent (Claude/OpenAI/Gemini)
- `CORS_ORIGINS=*`

## Comandi rapidi
```bash
# Restart services
sudo supervisorctl restart backend frontend

# Run backend tests
/root/.venv/bin/python -m pytest /app/backend/tests/test_ai_endpoints.py -q

# Health check
curl https://<preview>.preview.emergentagent.com/api/health
```
