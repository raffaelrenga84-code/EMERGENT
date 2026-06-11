# FAMMY — Family Organization App (Iterazione 16)

## Iterazione 16.5.37 (12 febbraio 2026) — FIX DEFINITIVO crash "families_created_by_fkey"

### 🔥 Root cause vera identificata
L'errore `insert or update on table "families" violates foreign key constraint
"families_created_by_fkey"` confermava che la riga in `profiles` per quel
`session.user.id` non esisteva. 3 problemi sottostanti:

1. **Manca RLS policy INSERT su `profiles`** nello schema base
   (`profiles_read_all` SELECT + `profiles_update_own` UPDATE esistono, ma
   non c'è una `INSERT`). → Qualsiasi upsert client-side veniva silenziato.

2. **Trigger `handle_new_user` rigido sui phone signup**
   Usava `split_part(email, '@', 1)` ma per i signup via phone OTP email è
   NULL → split_part(null) = '' → display_name vuoto → potenziale violazione
   `not null` su display_name → trigger crashava → profile MAI creato.

3. **Profili orfani esistenti**: utenti creati prima del fix del trigger
   non hanno mai avuto una riga in `profiles`. Da backfillare.

### Fix in 2 livelli

**(A) SQL hotfix** — `/app/frontend/fammy-profile-hotfix.sql` (nuovo file):
- Aggiunge policy `profiles_insert_own` (manca dallo schema)
- Riscrive trigger `handle_new_user` con fallback chain:
  full_name → name → display_name (meta) → email_local → phone → 'Membro'
- `on conflict (id) do nothing` per idempotenza
- `exception when others` per non bloccare mai il signup auth
- Backfill INSERT per tutti gli `auth.users` senza riga in `profiles`

**(B) Safety net client-side in App.jsx**:
Prima di toccare members/families, esegue un upsert idempotente del proprio
profile (ignoreDuplicates: true). Belt-and-suspenders: anche se il trigger
fallisse in futuro, il primo login crea comunque il profilo.

### File modificati
- ✏️ `/app/frontend/src/App.jsx` — safety net upsert profile
- ➕ `/app/frontend/fammy-profile-hotfix.sql` — fix RLS + trigger + backfill

### ⚠️ AZIONE UTENTE (3 step)
1. **Push Vercel** (Save to GitHub)
2. **ESEGUI SUBITO** `fammy-profile-hotfix.sql` su Supabase Dashboard → SQL Editor
   (è quello che davvero fixa l'errore family_created_by_fkey)
3. Chiudi completamente la PWA dall'iPhone e riapri. L'app dovrebbe recuperare
   le tue famiglie esistenti correttamente.

### Note su altri quesiti utente
- **App badge "1" come Netflix**: già implementato in `sw.js:103-114` —
  funziona quando la PWA è installata su iOS 16.4+ ed è il SW a settarlo
  alla ricezione push. Per vederlo: serve push reale con app chiusa.
  La diagnostica nel Profilo → 🔔 → 🩺 Diagnostica notifiche permette di
  testarlo.
- **Google SSO senza password**: comportamento standard. Una volta loggato
  con Google su iPhone, il browser/PWA mantiene il cookie SSO di Google e
  non richiede più le credenziali. Per forzare il re-login con un account
  diverso: Profilo → Esci → poi Safari → google.com → sign out della
  sessione Google nel browser.

### Testing
- Lint: ✅ files modificati (2 errori pre-esistenti del codebase, non introdotti)
- Smoke screenshot: ✅ login screen carica
- ⚠️ Test reale FK constraint: serve eseguire l'SQL su Supabase produzione

---


## Iterazione 16.5.36 (12 febbraio 2026) — Fix bug critico: utenti esistenti trattati come nuovi + auth.users sync

### 🚨 Bug critico — Utente già esistente vede WelcomeScreen + crash su Salta
**Sintomo**: Raffael (con famiglie e task già esistenti) faceva logout/login con Google
dalla PWA installata sulla home, e l'app gli mostrava "Da dove iniziamo?" come fosse
nuovo. Cliccando "Salta vai alla bacheca" otteneva: `null is not an object (evaluating 'v.id')`
(`v` = nome minified di `fam` in produzione).

**Root cause (race condition session ↔ RLS)**:
1. App.jsx hydratava la session dal `localStorage` SENZA controllare scadenza
2. Se la session era scaduta (es. utente non apriva l'app da giorni), useEffect[session]
   partiva con JWT stale → `auth.uid()` valutava null nelle RLS → query
   `members.select('family_id, families(*)')` ritornava 0 risultati senza errore
3. `setFamilies([])` + `setDataLoaded(true)` → App.jsx mostrava WelcomeScreen
4. L'utente cliccava Salta → `skipToBoard` tentava INSERT in `families` ma con
   `created_by = session.user.id` non valido per RLS → `fam` era null → `fam.id` crashava

### Fix in 4 punti (App.jsx + WelcomeScreen.jsx)

**(1) App.jsx — Hydration safe dal localStorage**
Controllo `expires_at` prima di settare la session salvata. Se è scaduta,
non hydratiamo: getSession() di Supabase si occuperà del refresh.

**(2) App.jsx — Retry automatico della query members**
Se la prima query `members → families` va in errore (RLS race, network), retry
una volta dopo 800ms. Cattura anche `error` field (prima ignorato).

**(3) App.jsx — Nuovo stato `loadError` + retry banner dedicato**
Se la fetch ha fallito ma session esiste, NON mostrare WelcomeScreen
(sarebbe un falso negativo che farebbe creare una famiglia duplicata).
Mostriamo invece un banner amichevole "📡 Non riesco a recuperare le tue famiglie"
con bottoni "🔄 Riprova" e "Esci e ri-accedi".

**(4) WelcomeScreen — `skipToBoard` robusto + pre-check**
- Pre-check: prima di creare una famiglia, ricontrolla se l'utente ha già members.
  Se sì, fa solo `refresh` (evita la creazione duplicata).
- Cattura `error` da entrambi gli insert (`families`, `members`) e lancia errore con
  messaggio leggibile invece di crashare su `fam.id` null.

### Feature richiesta dall'utente — Sync `auth.users.user_metadata.full_name`
**Problema**: La Dashboard Supabase → Auth → Users mostrava colonna "Display name"
vuota per gli utenti loggati con phone (OTP SMS), perché Supabase popola quel campo
solo da `user_metadata.full_name` (mai settato per i phone signup).

**Fix**: In `NamePromptModal.save()` e `ProfileTab.saveName()` aggiunto:
```js
await supabase.auth.updateUser({ data: { full_name: clean } });
```
Best-effort (non blocca il salvataggio profile se fallisce). Da ora in poi,
quando un utente phone-only inserisce il nome nel NamePromptModal o lo cambia dal
Profilo, il nome appare anche nella Dashboard Supabase.

### File modificati
- ✏️ `/app/frontend/src/App.jsx` — expires_at check, retry query, loadError + retry banner
- ✏️ `/app/frontend/src/screens/WelcomeScreen.jsx` — pre-check membership + skipToBoard hardened
- ✏️ `/app/frontend/src/components/NamePromptModal.jsx` — sync auth metadata
- ✏️ `/app/frontend/src/screens/tabs/ProfileTab.jsx` — sync auth metadata in saveName

### ⚠️ AZIONE UTENTE
1. **Push Vercel** (Save to GitHub → auto-deploy)
2. Sul tuo iPhone, dopo che il deploy è live, **chiudi completamente** la PWA
   (swipe-up multitask + butta via la card FAMMY) e riapri. Se ancora vedi
   "Da dove iniziamo?", premi il bottone "🔄 Riprova" che ora appare nel banner.
3. Per i nomi nella Dashboard Supabase: cambiare il nome dal Profilo dell'app
   (anche con lo stesso valore) → la colonna "Display name" si popolerà.

### Testing
- Lint: ✅ files modificati (2 errori pre-esistenti del codebase non introdotti dai fix)
- Smoke screenshot: ✅ login screen carica regolarmente
- ⚠️ Test reale flusso skipToBoard non automatizzabile (Google OAuth blocca headless)

---


## Iterazione 16.5.35 (12 febbraio 2026) — Hotfix crash JS WelcomeScreen + SQL unified + lang switcher

### Bug fix #1 — Crash "null is not an object" sulla Welcome / boot dell'app
**Root cause**: durante l'hydration della session da `localStorage`, l'oggetto
salvato poteva NON contenere ancora `user` (formato vecchio Supabase SDK,
refresh token in corso, o blob corrotto). Tre punti accedevano direttamente
a `session.user.id` senza optional chaining → crash bloccante prima
ancora di mostrare la UI:

- `useGoogleAvatar.js:20` → `const userId = session.user.id;`
- `App.jsx:161` → `.eq('id', session.user.id)` nell'effect di caricamento profile
- `WelcomeScreen.jsx` (skipToBoard, FamilyCreateForm, FamilyThenItem, DemoCreator)
  → `session.user.email.split('@')[0]` con email null per account phone-only

**Fix**:
- `useGoogleAvatar.js`: guardia unificata `const userId = session?.user?.id; if (!userId || !profile) return;`
- `App.jsx`: stessa pattern nell'useEffect di caricamento profile/families
- `WelcomeScreen.jsx`: nuova funzione helper `fallbackDisplayName(profile, session)`
  che usa profile.display_name → email → phone → 'Membro' come fallback. Sostituite
  tutte e 4 le occorrenze di `session.user.email.split('@')[0]`.

### Bug fix #2 — Script SQL hotfix attachments con 3 bug
**Root cause** in `fammy-attachments-hotfix.sql`:
1. Riferimento a `f.owner_user_id` (colonna inesistente) — la colonna corretta
   nella tabella `families` è `created_by` (vedi `fammy-schema.sql:72`).
2. Riferimenti non qualificati a `name` nelle storage policies → ambiguità con
   `members.name` nei JOIN delle subquery → errore "column reference name is ambiguous".
3. La colonna `tasks.priority` poteva non esistere su DB più vecchi che non avevano
   eseguito `fammy-add-priority-and-permissions.sql`.

**Fix**: nuovo file `/app/frontend/fammy-attachments-hotfix-fixed.sql`:
- `f.owner_user_id` → `f.created_by`
- `name` → `storage.objects.name` (qualificato esplicitamente)
- Aggiunto `alter table public.tasks add column if not exists priority text ...`
  in cima (idempotente, no-op se la colonna esiste già)
- Tutto idempotente: rilanciabile senza danni

### Feature — Switcher lingua su WelcomeScreen
Aggiunto in alto a destra (stesso pattern di `LoginScreen.jsx`): 4 flag IT/EN/FR/DE
cliccabili. Identifica il valore attivo con opacity 1 vs 0.4. data-testid:
`welcome-lang-{it|en|fr|de}` per testing automatico.

### File modificati
- ✏️ `/app/frontend/src/lib/useGoogleAvatar.js` — optional chaining
- ✏️ `/app/frontend/src/App.jsx` — optional chaining nell'effect
- ✏️ `/app/frontend/src/screens/WelcomeScreen.jsx` — fallbackDisplayName helper + LanguageSwitcher
- ➕ `/app/frontend/fammy-attachments-hotfix-fixed.sql` — nuovo SQL pulito

### ⚠️ AZIONE UTENTE (2 step)
1. **Push Vercel** (Save to GitHub → auto-deploy frontend)
2. **Esegui SQL** sul Supabase Dashboard SQL Editor:
   `fammy-attachments-hotfix-fixed.sql` (NON il vecchio `fammy-attachments-hotfix.sql`)

### Testing
- Lint: ✅ files modificati (2 errori pre-esistenti sul codebase non introdotti dai miei fix)
- Smoke screenshot: ✅ landing page carica correttamente, niente crash JS
- ⚠️ Test reale del flusso WelcomeScreen richiede login Google (non automatizzabile da headless)

---


## Iterazione 16.5.34 (11 febbraio 2026) — Hotfix attachments schema

### Bug fix — 2 errori di schema riportati dall'utente
1. **Care Hub** — `Could not find the table 'public.care_attachments' in the schema cache`
   La tabella `care_attachments` (allegati foto/PDF dei profili medici)
   non era mai stata creata sul DB dell'utente: il file SQL esisteva
   da iterazioni precedenti ma non era stato eseguito.

2. **Task chat photo** — `Could not find the 'uploaded_by' column of 'task_attachments' in the schema cache`
   La tabella `task_attachments` esiste da uno schema più vecchio ma
   non ha la colonna `uploaded_by`. Il codice `TaskDetailModal.jsx:1176`
   prova a inserirla quando l'utente carica una foto in chat task.

### Soluzione (SQL idempotente unico)
File: `/app/frontend/fammy-attachments-hotfix.sql`

- `alter table task_attachments add column if not exists uploaded_by`
  (references members.id on delete set null)
- Crea `care_attachments` con RLS owner+same-family + Realtime
- Crea bucket storage `care-attachments` + 3 storage policies
  (read/write same-family, delete uploader-or-owner)
- Aggiunto indice `idx_task_attachments_uploaded_by`

### File nuovi
- ➕ `/app/frontend/fammy-attachments-hotfix.sql`

### ⚠️ AZIONE UTENTE
Esegui SOLO questo file: **`fammy-attachments-hotfix.sql`** su Supabase
Dashboard → SQL Editor → Run.
Dopo l'esecuzione i 2 errori spariranno.

---

## Iterazione 16.5.33 (10 febbraio 2026) — Priorità in nuovo incarico + "Nome" più conciso

### Fix #1 — Priorità mancante in AddTaskModal
Prima la priorità si poteva impostare SOLO dopo aver creato il task (dal
dettaglio). Ora il selettore visuale `🟢 Normale / 🟠 Media / 🔴 Urgente`
appare subito sotto la riga "Categoria" in creazione.

Logica: il valore è state `priority` (`'normal' | 'medium' | 'high'`),
mappato a:
- `tasks.priority` text column
- `tasks.urgent = (priority === 'high')` per compatibilità con il
  trigger push esistente che notifica i cambi urgenza.

UI: pill colorate con outline bicolor quando attive (stesso pattern
del category picker delle Spese).

### Fix #2 — "Come ti chiami?" → "Nome"
Cambiati i 3 placeholder di onboarding (form nuovo membro, prompt
nome forzato per chi non l'ha, form invito famiglia) da
"Come ti chiami?" a "Nome" in tutte e 4 le lingue:
- IT: "Nome"
- EN: "Name"
- FR: "Nom"
- DE: "Name"

### File modificati
- ✏️ `AddTaskModal.jsx` — state `priority` + payload + selector UI
- ✏️ `i18n.jsx` — `name_label`, `name_prompt_title`, `join_name_label`,
  `addtask_priority_*` × 4 lingue

### Testing
- Build: ✅ `fammy-20260610174411`
- ⚠️ Provalo sul tuo iPhone dopo push: nuovo incarico → vedi 3 pill priorità
  sotto la categoria. Settando "Urgente" la card apparirà subito con sfondo
  rosso come fixato in iter 16.5.32

---

## Iterazione 16.5.32 (10 febbraio 2026) — 4 fix UX richiesti dall'utente

### Fix #1 — Urgenza rossa colorata come l'arancio
La card priority='high' aveva `background: 'var(--rd)22'` (rosso desaturato al 13% di alpha) → visivamente non si distingueva. Cambiato a `var(--rdB)` (background-tone già definito in palette) + opacità box-shadow ridotta. Ora ha lo stesso impact visivo dell'arancio.

### Fix #2 — Android camera-only su upload foto
Rimosso attributo `capture` dai 3 input file:
- `AddTaskModal:754`
- `AddEventModal:459`
- `AddExpenseModal:371`

Su Android `capture` (anche senza valore) **forza l'apertura della
fotocamera**. iOS lo ignora e mostra il picker nativo. Ora su Android
appare il selector "Camera / Galleria / File".

### Fix #3 — Swipe left "Non posso"
Aggiunto come terza azione in `SwipeableRow.rightActions` (insieme a
"Fatto" e "Me ne occupo"). Nuovo handler `quickDecline`:
- Inserisce un messaggio di sistema in `task_responses` (type='system'):
  "🤚 [Nome] non può occuparsene"
- Se l'utente era assegnatario, rimuove il suo `task_assignees` (così
  il task torna libero)
- Snapshot del nome auto-salvato dal trigger BEFORE INSERT (iter 16.5.24)
- Notifica gli altri tramite il trigger esistente `notify_task_response`

⚠️ Avevo iniziato a fare un custom swipe wrapper, **rollback fatto** e
usata invece la struttura esistente `SwipeableRow`.

### Fix #4 — Indirizzo nel Profilo + visibile in Famiglia
**SQL** (`fammy-member-address.sql`):
- Colonna `address` text opzionale su `members` E `profiles`
- Trigger `trg_sync_address_profile_to_members`: quando l'utente
  aggiorna `profiles.address`, propaga automaticamente a TUTTI i
  `members.address` con quel `user_id` (così non deve editarlo in
  ogni famiglia)

**Frontend Profilo**: nuova riga "📍 Indirizzo" sotto "🎂 Compleanno",
edit inline con hint "Visibile agli altri membri delle tue famiglie".

**Frontend Famiglia**: in `MemberCard` mostra `member.address` con
icona 📍 (truncato con ellipsis se lungo, full text in tooltip).

### File nuovi
- ➕ `/app/frontend/fammy-member-address.sql`

### File modificati
- ✏️ `BachecaTab.jsx` — sfondo rosso urgent + decline action
- ✏️ `AddTaskModal.jsx`, `AddEventModal.jsx`, `AddExpenseModal.jsx` — rimosso `capture`
- ✏️ `ProfileTab.jsx` — nuovo campo address + saveAddress
- ✏️ `FamilyTab.jsx` — display address nelle MemberCard
- ✏️ `i18n.jsx` — `swipe_decline`, `decline_msg`, `profile_address*` in IT/EN/FR/DE

### Testing
- Build: ✅ `fammy-20260610173123`

### ⚠️ AZIONE UTENTE
1. **Push Vercel** (GitHub auto-deploy)
2. **Esegui SQL su Supabase** → `fammy-member-address.sql`

---

## Iterazione 16.5.31 (10 febbraio 2026) — Hotfix Jenna: diagnostica push & VAPID

### Bug fix — Errore "column push_subscriptions.last_used_at does not exist"
Il mio `NotificationsHealthCheck` faceva un SELECT su colonne
(`last_used_at`, `created_at`, `user_agent`) che potrebbero non esistere
in DB più vecchi (Jenna ha un DB precedente a `fammy-push-notifications.sql`
versione finale, oppure la colonna è stata aggiunta più tardi).

**Fix**: SELECT minimale `id, endpoint` (sempre presenti dallo schema
iniziale). Rimosso anche l'`.order('last_used_at')` che falliva.

### File modificati
- ✏️ `/app/frontend/src/components/NotificationsHealthCheck.jsx` — SELECT minimale

### Diagnosi VAPID missing (per Jenna, azione utente)
Su Vercel, Jenna ha la variabile `VITE_VAPID_PUBLIC_KEY` mancante in
produzione. Soluzione:
1. Vercel Dashboard → Project → Settings → Environment Variables
2. Aggiungi `VITE_VAPID_PUBLIC_KEY` con il valore della **public** key
   (stessa che usavi nei test, generata con web-push-libs)
3. Re-deploy

Dopo l'aggiunta, la diagnostica passerà a ✅ per VAPID e di conseguenza
la subscription locale + server si registreranno correttamente.

### Testing
- Build: ✅ `fammy-20260610163006`

---

## Iterazione 16.5.30 (7 febbraio 2026) — UX hotfix: tastiera, overflow, dark mode, FR/DE

### Bug fix in batch (4 problemi segnalati dall'utente)

**1. Modal "spinto in alto" quando si apre la tastiera iOS**
- Sostituito `vh` con `dvh` (dynamic viewport height) su `.modal-bg`
  (height: 100dvh) e `.modal` (max-height: calc(92dvh - ...)). `dvh` si
  adatta automaticamente quando la tastiera virtuale iOS appare,
  mentre `vh` resta fissa al pieno schermo iniziale.
- Aggiunto `overflow: hidden` su `.modal-bg` e `-webkit-overflow-scrolling: touch`
  su `.modal` (smooth scroll iOS).
- Helper JS in `main.jsx`: su `focusin` di input/textarea dentro un
  `.modal`, dopo 250ms (per dare il tempo alla tastiera di aprirsi)
  fa `scrollIntoView({ block: 'center' })`. Risultato: il campo
  focalizzato resta sempre visibile sopra la tastiera.

**2. Scroll orizzontale indesiderato su alcune pagine**
- Aggiunto `overflow-x: hidden` + `max-width: 100vw` a livello di
  `html`, `body`, `#root`, `.app-shell`. Combat l'overflow dato da
  grid/flex/scroll horizontal senza min-width.

**3. Dark mode: testi illeggibili sui banner di stato**
- Nuove regole CSS `[data-theme="dark"]` per i colori hex hardcoded
  usati nei componenti aggiunti in iter 16.5.29 (NotificationsHealthCheck,
  ExpensesBalance, GlobalSearch):
  - `color: #A93B2B` → `#E89898` (rosso chiaro su dark)
  - `color: #7A4E00` → `#E8C272` (giallo chiaro su dark)
  - `color: #9A6300` → `#E8C272`

**4. Traduzioni mancanti in FR e DE**
- Aggiunte ~80 chiavi mancanti nelle 4 sezioni: Notifications Health Check,
  Subtask, ExpensesBalance, GlobalSearch, Expense categories, Agenda
  Week/Month, Calendar feed ICS.
- Ora FR e DE non fanno più fallback silenzioso all'IT per queste UI.

### File modificati
- ✏️ `/app/frontend/src/styles.css` — `dvh`, overflow-x global, dark mode hex fixes
- ✏️ `/app/frontend/src/main.jsx` — focusin scrollIntoView helper iOS
- ✏️ `/app/frontend/src/lib/i18n.jsx` — ~160 nuove key (~80 FR + ~80 DE)

### Testing
- ✅ Build OK (`fammy-20260607111802`)
- ✅ Lint pulito su `main.jsx`
- ✅ **Mobile overflow check** (Playwright viewport 390px): `has_horizontal_overflow: false`
  (`html.scrollWidth=390`, `clientWidth=390` — match perfetto, zero scroll laterale)
- ⚠️ Test reale tastiera iOS PWA: l'utente deve verificarlo sul suo iPhone
  dopo il prossimo push Vercel

### ⚠️ Verifica utente dopo deploy
1. Apri "Nuovo incarico" → la tastiera non deve più nascondere il pulsante
2. Naviga tra le pagine → niente scroll orizzontale anomalo
3. Switch Profilo → Tema → Scuro → tutti i banner di stato leggibili
4. Cambia lingua FR/DE → niente più stringhe inglesi/italiane orfane

---

## Iterazione 16.5.29 (7 febbraio 2026) — Sprint 1 + Sprint 2: 7 feature in batch

Maxi sprint di 7 feature in una sessione, su richiesta dell'utente
("procedi" con tutte). Ordine di implementazione = ordine impatto/dipendenze.

### Step 1 — DB trigger push (server-side affidabile)
File: `/app/frontend/fammy-push-on-tasks.sql`

3 trigger PostgreSQL che sostituiscono / integrano i `sendPush` lato
frontend (che fallivano se il mittente chiudeva subito l'app):

- **`trg_notify_task_assigned`** su `task_assignees` AFTER INSERT →
  notifica il singolo assegnatario quando viene aggiunto. Funziona
  sia in creazione del task (multi-assignee) sia in delegazione successiva.
- **`trg_notify_task_created`** su `tasks` AFTER INSERT → notifica tutta
  la famiglia SOLO se il task NON ha assegnatari (caso "incarico generico").
- **`trg_notify_task_priority`** su `tasks` AFTER UPDATE OF priority,urgent
  → notifica TUTTI i coinvolti quando la priorità SALE
  (normal→medium / →high, o urgent false→true). Niente push quando scende.

Helper SQL `fammy_private.task_recipient_user_ids()` aggrega membri da
`task_assignees` + `task_couple_members` + author + taken_by + delegated_to,
risolvendoli a `user_id` distinti.

### Step 2 — Checklist/Subtask sui task
File: `/app/frontend/fammy-task-subtasks.sql` + `SubtaskList.jsx`

Nuova tabella `task_subtasks` (con RLS + Realtime). Trigger snapshot
`completed_by_name` per sopravvivere alla rimozione del membro.

UI: integrata in `TaskDetailModal` (tab Dettagli), in cima.
Funzionalità: checkbox custom, inline edit, riordino con frecce ↑↓,
delete, barra di progresso, count "3/5 fatti". Realtime: gli altri
membri vedono i tick in diretta.

### Step 3 — Saldo Splitwise nelle Spese
File: `ExpensesBalance.jsx`, sostituisce la vecchia sezione `balances` in `SpeseTab.jsx`

Calcolo netto "chi deve cosa a chi" con **compensazione reciproca**
(A→B 10 + B→A 4 = A→B 6). Ordinamento: prima i debiti che mi
coinvolgono, poi per importo decrescente. Card verde "Tutto saldato!"
quando 0 debiti. Su mobile: mostra max 3 + "Mostra altri N".
Highlight giallo per le righe in cui sono coinvolto io.

Rimossa la vecchia funzione `computeBalances` da SpeseTab (per-pair
senza compensazione) — il nuovo componente la rende obsoleta.

### Step 4 — Ricerca globale (cross-tab)
File: `GlobalSearch.jsx`, integrato in `HomeScreen.jsx`

Bottone 🔍 nell'Header (in cima, sempre visibile). Modal full-screen
con input autofocus. Filtra **client-side** (no extra fetch) su:
- Tasks: title + note
- Events: title + location + notes
- Expenses: description + amount

Sezioni con count + risultati con icone/subtitle (famiglia +
data/luogo). Tap → switch al tab corretto + apre il TaskDetailModal
(per i task; eventi/spese fanno solo lo switch del tab).

### Step 5 — Picker categorie spese con icone
File: `fammy-expense-categories.sql` + `expenseCategories.js` +
modifiche a `AddExpenseModal.jsx` e `SpeseTab.jsx`

Aggiunta colonna `expenses.category` (text, opzionale). 8 categorie
canoniche: groceries 🛒 / bills 💡 / school 🎒 / home 🏠 / health 🩺 /
transport 🚗 / leisure 🎉 / other 💶. Picker orizzontale scroll su
mobile, pill colorate. Display: icona colorata 36×36 a sinistra del
titolo della card spesa.

### Step 6 — Vista settimanale Agenda
File: `WeekView.jsx` + `MonthWeekToggle` in `AgendaTab.jsx`

Toggle compatto Mese / Settimana sopra il calendario (pill style
iOS, switch a 2 stati). Settimana = 7 card verticali (lun-dom) con
icona + numero giorno + lista compatta items (max 3 eventi + 3 task
+ 2 assenze, "+N altri" se ce ne sono di più). Tap su un giorno =
seleziona (highlight rosso) → la sezione "Oggi" sotto si apre.
Tap su un item = apre il dettaglio. Swipe orizzontale = settimana
precedente/successiva.

### Step 7 — Link ICS/CalDAV live
File: `fammy-calendar-tokens.sql` + endpoint FastAPI in
`/app/backend/server.py` + `CalendarFeedCard.jsx`

**Backend FastAPI**: nuovo endpoint `GET /api/calendar/{token}.ics`
che:
1. Valida format token (regex `[a-f0-9]{16,128}`) → 400 se malformato
2. Controlla config (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) → 503 se mancante
3. Lookup `calendar_tokens` → 404 se token sconosciuto/revocato
4. Risolve `members` → `family_ids`
5. Carica eventi + task non-done da Supabase REST API
6. Genera ICS conforme RFC 5545 (BEGIN:VEVENT, RRULE per weekly recurring)
7. Headers `text/calendar; charset=utf-8` + `Cache-Control: private, max-age=300`
8. Try/except → 502 su httpx.HTTPError (fallback grazioso)

**Supabase**: tabella `calendar_tokens(user_id, token UNIQUE, revoked_at)`
con RLS owner-only + 2 RPC: `rotate_calendar_token()` (random 48-hex
+ idempotente) e `get_calendar_token()`.

**Frontend**: `CalendarFeedCard` nel Profilo → Strumenti smart.
Genera token, mostra URL completo + copy-to-clipboard, bottone
rigenera per security. Istruzioni passo-passo collassabili per
Apple Calendar (iOS/Mac) e Google Calendar.

### File nuovi (sessione)
- ➕ `/app/frontend/fammy-push-on-tasks.sql` — trigger push task
- ➕ `/app/frontend/fammy-task-subtasks.sql` — checklist DB
- ➕ `/app/frontend/fammy-expense-categories.sql` — categoria spese
- ➕ `/app/frontend/fammy-calendar-tokens.sql` — ICS tokens DB
- ➕ `/app/frontend/src/components/SubtaskList.jsx`
- ➕ `/app/frontend/src/components/ExpensesBalance.jsx`
- ➕ `/app/frontend/src/components/GlobalSearch.jsx`
- ➕ `/app/frontend/src/components/WeekView.jsx`
- ➕ `/app/frontend/src/components/CalendarFeedCard.jsx`
- ➕ `/app/frontend/src/lib/expenseCategories.js`

### File modificati (sessione)
- ✏️ `/app/backend/server.py` — endpoint ICS + httpx + SUPABASE_URL env
- ✏️ `/app/frontend/src/components/AddExpenseModal.jsx` — picker categoria
- ✏️ `/app/frontend/src/components/TabHeaderActions.jsx` — bottone 🔍 (poi spostato in Header)
- ✏️ `/app/frontend/src/components/TaskDetailModal.jsx` — mount SubtaskList in tab Dettagli
- ✏️ `/app/frontend/src/screens/HomeScreen.jsx` — Header + GlobalSearch + bottone 🔍
- ✏️ `/app/frontend/src/screens/tabs/AgendaTab.jsx` — vista settimanale + toggle
- ✏️ `/app/frontend/src/screens/tabs/SpeseTab.jsx` — ExpensesBalance + categoria icone
- ✏️ `/app/frontend/src/screens/tabs/ProfileTab.jsx` — CalendarFeedCard nei "Strumenti smart"
- ✏️ `/app/frontend/src/lib/i18n.jsx` — ~80 nuove key IT/EN

### Testing
- Lint: ✅ tutti i nuovi file
- Build: ✅ (`fammy-20260606172701`)
- Backend smoke: ✅ `/api/health` 200, ICS `/calendar/XXX.ics` → 400, ICS `/calendar/1234567890abcdef.ics` → 503 (correct ordering dopo fix), `/api/health` 200
- AI endpoints: regression LOW (codice invariato, baseline 14/14 da iter_2)
- Frontend landing page: ✅ rendering nominale

### ⚠️ AZIONE UTENTE — Deploy in 4 step
1. **Push Vercel** (GitHub → auto-deploy frontend) — già pronto
2. **Run SQL su Supabase Dashboard → SQL Editor** (in quest'ordine):
   ```
   fammy-push-on-tasks.sql
   fammy-task-subtasks.sql
   fammy-expense-categories.sql
   fammy-calendar-tokens.sql
   ```
3. **Re-deploy edge function `cron-digest`** (file da iter 16.5.25)
4. **Solo per ICS feed**: aggiungi al `.env` del backend (Render/Railway/wherever):
   ```
   SUPABASE_URL=https://jwzoymvtxjzpymaywjtw.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<dal Dashboard Supabase → Project Settings → API → service_role secret>
   ```
   E al `.env` del frontend:
   ```
   VITE_BACKEND_URL=https://<your-render-backend>.onrender.com
   ```

---

## Iterazione 16.5.28 (6 febbraio 2026) — Diagnostica collassabile con badge stato

### Enhancement — Box compatto con badge + auto-open su errori
La diagnostica notifiche prima era sempre espansa (occupava ~400px).
Ora è **collassabile**, con header sempre visibile mostrando un
**badge di stato** colorato che riassume tutto a colpo d'occhio:
- ✅ "Tutto a posto" (verde) — quando tutti i 7 controlli passano
- ❌ "{n} problema/i" (rosso) — quando ci sono errori bloccanti
- ⚠️ "{n} avviso/i" (giallo) — quando ci sono solo warning
- ⏳ "Ricontrolla…" (grigio) — durante l'esecuzione

**Auto-open intelligente**: la prima volta che la diagnostica rileva
errori (`failingErr > 0`), si apre da sola — così l'utente è "spinto"
a vedere il problema senza dover cliccare. Successivi rerun (es. premi
"Ricontrolla") rispettano la scelta dell'utente di tenerla chiusa
(`didAutoOpen` flag interno).

**Header con chevron animato** (rotate 180° con transition 200ms) che
guida l'utente: tap sull'header = toggle.

### File modificati
- ✏️ `/app/frontend/src/components/NotificationsHealthCheck.jsx` — state `open` + `didAutoOpen`, layout collassabile
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 3 nuove key IT/EN (`nhc_badge_ok/err/warn`)

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260606170114`)
- ⚠️ **Provalo tu** (dopo push Vercel): Profilo → Notifiche →
  - Se hai tutto ok: vedi solo "🩺 Diagnostica notifiche · ✅ Tutto a posto" (chiuso)
  - Se ci sono errori (caso iOS denied): si apre da sola al primo render con badge "❌ 3 problemi"

---

## Iterazione 16.5.27 (6 febbraio 2026) — Fix: Diagnostica notifiche sempre visibile

### Bug fix — `NotificationsHealthCheck` invisibile quando serviva di più
Avevo gattato il render del nuovo `NotificationsHealthCheck` con
`notificationControl.notificationPermission === 'granted'`. Risultato:
proprio l'utente con permessi NEGATI (caso più comune e dove la
diagnostica è più utile) non lo vedeva.

**Fix**: rimosso il gate. Ora il componente è sempre visibile (sotto al
banner di stato permessi esistente). Quando il permesso è negato:
- Lo step "Permesso notifiche" appare in ❌ con messaggio chiaro
- "Subscription locale" in ❌
- "Subscription DB" in ❌
- Hint OS-specifici (iPhone/Android) collassabili in fondo guidano
  l'utente al fix

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/ProfileTab.jsx` — rimosso gate `permission === 'granted'`

### Testing
- Build: ✅ (`fammy-20260606165614`)
- Lint: ✅
- ⚠️ **Per vederlo sul tuo iPhone**: pusha su Vercel (Save to GitHub).
  La versione live di fammy-flame.vercel.app mostra ancora la vecchia UI.

---

## Iterazione 16.5.26 (6 febbraio 2026) — Diagnostica notifiche nel Profilo

### Feature — `🩺 Diagnostica notifiche` (health-check completo)
Risposta diretta all'esigenza dell'utente: "come controllo che le push
arrivino anche ad app chiusa?". Nuovo componente che esegue
**automaticamente** all'apertura del Profilo una batteria di 7 controlli
e mostra ✅/⚠️/❌ per ognuno + un bottone "Invia push di prova".

### Controlli eseguiti
1. **Browser supporta push** (Push API + Service Worker + Notification API)
2. **VAPID public key configurata** (`VITE_VAPID_PUBLIC_KEY`)
3. **Permesso notifiche concesso** (`Notification.permission === 'granted'`)
4. **Service Worker attivo** (`registration.active`)
5. **Subscription locale registrata** (`pushManager.getSubscription()`
   + check `expirationTime`)
6. **Subscription salvata su DB** (`push_subscriptions` per il mio
   `user_id`, con match endpoint contro la sub locale → warn se non corrispondono)
7. **PWA installata sulla Home (solo iOS)** — su iPhone è prerequisito
   tassativo, su Android/desktop riga skippata

### Test push end-to-end
Bottone "🧪 Invia push di prova" che chiama `send-push` direttamente e
mostra:
- ✅ `Inviata a N dispositivo/i`
- ⚠️ `Nessuna subscription`
- ❌ `Edge Function non deployata (404)` / errori HTTP

Sotto, hint OS-specifici collassabili (iPhone/Android) con i fix più
comuni per quando le push non arrivano in background (Modalità
Concentrazione, ottimizzazione batteria Android, "Aggiungi a Home" iOS).

### File nuovi
- ➕ `/app/frontend/src/components/NotificationsHealthCheck.jsx` (350 LOC)

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/ProfileTab.jsx` — sostituiti
  `TestPushButton` + `PushDiagnosticCard` con il nuovo componente unificato
- ✏️ `/app/frontend/src/lib/i18n.jsx` — ~45 nuove keys IT/EN (FR/DE
  fallback a IT)

### Testing
- Lint: ✅ (0 errori sul nuovo file; ProfileTab ha 1 errore pre-esistente
  non toccato dalle mie modifiche)
- Build: ✅ (`fammy-20260606164801`)
- Smoke screenshot landing: ✅ (Vercel preview renderizza)
- ⚠️ **Provalo tu**: Profilo → 🔔 Notifiche → vedi "🩺 Diagnostica
  notifiche" con i 7 controlli automatici. Premi "🧪 Invia push di prova",
  chiudi l'app (swipe-up), aspetta 2-3 secondi → deve arrivare la
  notifica "🧪 FAMMY — Test push". Se NON arriva, guarda quale dei 7
  step è in ❌ o ⚠️.

---

## Iterazione 16.5.25 (6 febbraio 2026) — Fix cron-digest serale + testing AI backend

### Bug fix P1 — Silvia non riceveva il digest serale 21:00
**Root cause** (3 bug nel file `cron-digest.ts`):

1. **Multi-assegnatari ignorati**
   Il filtro usava solo il campo legacy `tasks.assigned_to` (single-assignee).
   Tutti i task assegnati tramite la tabella join `task_assignees`
   (multi-assignee, l'attuale source of truth) venivano scartati.
   Se Silvia era assegnata SOLO tramite `task_assignees` (caso normale
   ora), nessun task era conteggiato per lei → digest skippato.

2. **Task ricorrenti esclusi**
   La query filtrava `due_date is not null`. Ma i task ricorrenti
   (`recurring_days` + `recurring_until`) hanno `due_date = null`
   per definizione → mai conteggiati come "domani".

3. **Eventi ricorrenti esclusi**
   La query usava `starts_at >= startTomorrow AND < endTomorrow`
   che cattura SOLO la prima occorrenza esatta. Tutte le occorrenze
   ricorrenti (es. "riunione ogni lunedì") venivano perse.

### Soluzione (riscrittura `cron-digest.ts`)

- Carica `tasks` SENZA filtrare su `due_date`
- Carica `task_assignees` separatamente → `assigneesByTask[task_id] = [member_id...]`
- Carica `task_completions` per `tomorrow_key` → set di task già fatti
- Nuova funzione `isRecurringOccurrence()` che valuta:
  - weekday di domani in `recurring_days` (convention FAMMY: 0=Lunedì)
  - `recurring_until` >= domani (o null)
  - `recurring_exceptions` non include domani
- Filtro task: `single (due_date=domani) OR ricorrente valido`
- Filtro eventi: `single (starts_at∈domani) OR ricorrente valido`
- Assignment check unificato: **assegnato a me via task_assignees** OR
  **io sono author** OR **nessun assegnatario** (task di famiglia)
- Payload diagnostica nel response: `tomorrow_key`, `tomorrow_weekday`,
  `total_tasks_window`, `total_events_window` (utili per debug futuri)

### File modificati
- ✏️ `/app/frontend/supabase/_dashboard_standalone/cron-digest.ts` — riscrittura completa

### ⚠️ AZIONE UTENTE
**Re-deploya** la edge function `cron-digest` su Supabase Dashboard:
1. Dashboard → Edge Functions → `cron-digest`
2. Copia il contenuto aggiornato di
   `/app/frontend/supabase/_dashboard_standalone/cron-digest.ts`
3. Deploy
4. **Test manuale immediato** (Dashboard → SQL Editor):
   ```sql
   select fammy_private.trigger_daily_digest();
   ```
   La function ritorna ora un JSON con `debug.total_tasks_window` e
   `total_events_window` → conferma che vede i dati di Silvia.

### Testing AI backend (P0 — testing_agent_v3_fork)
**Risultato: 14/14 PASS** in 73s. Tutti gli endpoint AI in italiano:
- `/api/health` → 200 (Mongo OK)
- `/api/ai/suggest-task` → categoria/urgenza/sottotask corretti
  ("Pagare bolletta luce" → spese/admin)
- `/api/ai/weekly-summary` → riepilogo IT + highlights array
- `/api/ai/chat` → single + multi-turn (contesto preservato:
  l'assistant ricorda "Tommaso, 6 anni" al turno 2)
- `/api/ai/gift-ideas` → ≥3 idee per Nonna Maria

**No regressioni dal backend** dopo le 50+ modifiche frontend
(il codice backend non è cambiato).

⚠️ Le feature frontend dietro Google OAuth (PWA prompts, modals,
FAB pulse, donation, feedback inbox, `?reset=1`) **non sono
automatizzabili** — Google blocca OAuth da browser headless.
Vanno testate manualmente dall'utente.

### Issue noti / minori (carry-over da iter 1)
- CORS: `allow_origins=['*']` + `allow_credentials=True` non spec-compliant
- `/api/ai/suggest-task`: titolo vuoto accettato, ritorna `category='other'`
- Chat replay non include i turni assistant (solo user) → fact recall OK,
  tono può drift su sessioni molto lunghe
- Eccezioni con messaggi raw possono leakare info interne nei 500

### Note schedulazione
Cron è schedulato `0 19 * * *` UTC (= 21:00 IT estate, 20:00 IT inverno).
Per allineare 21:00 IT anche d'inverno, si può aggiungere un secondo job
`0 20 * * *` ma è un trade-off (push duplicate in estate).

---

## Iterazione 16.5.24 (6 febbraio 2026) — Fix "Qualcuno" nei commenti task

### Bug fix — Autore commento perso dopo rimozione del membro
**Root cause**: lo schema `task_responses.author_id REFERENCES members(id)
ON DELETE SET NULL` azzera l'autore quando il membro viene rimosso dalla
famiglia (o quando esce). Risultato: `members.find(m => m.id === null)`
ritorna `undefined` → in chat il messaggio appare con avatar "?" e label
"Qualcuno" anche se l'autore esisteva al momento dell'invio.

**Soluzione**: snapshot del nome+colore+iniziale al momento dell'INSERT.
- Nuove colonne `author_name`, `author_avatar_color`, `author_avatar_letter`
  su `task_responses`
- Trigger BEFORE INSERT che li popola automaticamente da `members`
  (così tutto il codice frontend esistente continua a funzionare senza
  modifiche)
- Backfill dei messaggi esistenti con autore ancora in famiglia
- Fallback UI: prima cerca il membro vivo, poi lo snapshot, poi mostra
  "Membro rimosso" (label i18n in IT/EN/FR/DE)

### File nuovi
- ➕ `/app/frontend/fammy-author-snapshot.sql` — migration idempotente

### File modificati
- ✏️ `/app/frontend/src/components/TaskDetailModal.jsx` — fallback rendering
- ✏️ `/app/frontend/src/lib/i18n.jsx` — nuova key `td_author_removed` × 4 lingue

### ⚠️ AZIONE UTENTE
Esegui `/app/frontend/fammy-author-snapshot.sql` su Supabase SQL Editor.

### Testing
- Lint: ✅ (no nuovi errori; 4 errori pre-esistenti non toccati)
- Build: ✅ (`fammy-20260606162116`)
- ⚠️ **Provalo tu**: dopo aver eseguito l'SQL, ricarica la PWA → i vecchi
  messaggi con autore rimosso mostreranno il nome originale invece di
  "Qualcuno". I nuovi messaggi verranno snapshottati automaticamente
  dal trigger.

---

## Iterazione 16.5.23 (5 giugno 2026) — Assenze altrui: view-only completo

### Refactor — Modal assenza con 2 modalità distinte
Prima il `readOnly` disabilitava solo la prima riga (chip motivo) lasciando
gli altri campi (date, luogo, nota, famiglie) editabili. Adesso quando
apri l'assenza di un altro membro vedi un **layout completamente
diverso** (no form):

**Nuovo componente `AbsenceViewOnly`** (locale a `AbsenceModal.jsx`):
- Badge "👁️ Stai visualizzando l'assenza di un altro membro..."
- Card riepilogo elegante con:
  - Emoji motivo grande + nome autore + label
  - 📅 Periodo formattato (locale-aware)
  - 📍 Luogo (se presente)
  - 📝 Nota (whitespace-pre-wrap per andare a capo)
  - 👥 Famiglie destinatarie come chip
- Sotto: thread commenti (motivo principale per cui sei lì)

**Owner mode**: form completo invariato (motivo, date, luogo, nota,
visibilità, conflitti ricorrenze, eliminazione).

**Vantaggio**: niente più rischio di modifiche accidentali. RLS Supabase
già impedirebbe l'update, ma adesso l'UX lo rende anche **visualmente**
impossibile.

### File modificati
- ✏️ `/app/frontend/src/components/AbsenceModal.jsx` — 2 mode + `AbsenceViewOnly` component

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260605160621`)
- ⚠️ **Provalo tu**: Agenda → tap su assenza di un altro membro (es. Silvia) → vedi solo riepilogo + commenti, niente form editabile. Tap sulla tua → form completo.

---

## Iterazione 16.5.22 (5 giugno 2026) — i18n completo Agenda (Solo a me + ora + tu + date)

### Bug fix — Stringhe hardcoded italiane in Agenda
Sostituito hardcoded → i18n keys in 4 lingue (IT/EN/FR/DE):
- `agenda_only_mine` — "Solo a me" / "Only mine" / "Seulement moi" / "Nur ich"
- `agenda_result_one` / `_many` — "risultato/i" / "result(s)" / "résultat(s)" / "Ergebnis(se)"
- `absence_now_badge` — "ora" / "now" / "maintenant" / "jetzt"
- `you` — "Tu" / "You" / "Toi" / "Du" (era hardcoded "(tu)")
- Date `toLocaleDateString('it-IT', ...)` → ora usa `lang` mappato a BCP47 (it-IT, en-US, fr-FR, de-DE)

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/AgendaTab.jsx` — useT lang + dateLocale + i18n keys
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 5 nuove keys × 4 lingue

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260605155934`)
- ⚠️ **Provalo tu** (in EN): Agenda → "Only mine" / "0 results" + date in inglese (es. "Monday, June 1") + badge assenza attiva "● NOW"

---

## Iterazione 16.5.21 (5 giugno 2026) — i18n date + chiavi commenti assenza

### Bug fix 1 — Date in lingua dell'app (non del browser)
**Problema**: in `NativeDateInput.jsx` la formattazione data usava
`toLocaleDateString(undefined, ...)` → il browser sceglieva il locale di
sistema. Risultato: utente con browser italiano ma app in inglese vedeva
"Lunedì 1 Giugno 2026" invece di "Monday June 1, 2026".

**Fix**: usa `useT().lang` per leggere la lingua attiva dell'app e mappa
con `LANG_TO_LOCALE = { it: 'it-IT', en: 'en-US', fr: 'fr-FR', de: 'de-DE' }`.
Tutte e 4 le funzioni `toLocaleDateString` / `toLocaleString` ora usano il
locale dell'app, non quello del browser.

### Bug fix 2 — Chiavi i18n mancanti (ABSENCE_COMMENTS_H, absence_comments_empty)
**Problema**: nella iterazione precedente avevo aggiunto le chiavi
`absence_comments_*` solo come fallback inline nel componente, ma non
nel file `i18n.jsx` → in modalità EN/FR/DE il `t()` ritornava la chiave
raw "absence_comments_h" maiuscolizzata dal CSS.

**Fix**: aggiunte 5 keys × 4 lingue (IT/EN/FR/DE):
- `absence_comments_h` — "Commenti" / "Comments" / "Commentaires" / "Kommentare"
- `absence_comments_empty`
- `absence_comments_placeholder`
- `absence_comments_missing_sql`
- `absence_readonly_hint`

### File modificati
- ✏️ `/app/frontend/src/components/NativeDateInput.jsx` — useT lang + locale map
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 5 nuove keys × 4 lingue

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260605152148`)
- ⚠️ **Provalo tu** (in EN): apri un'assenza esistente → ora le date sono "Monday, June 1, 2026" e i label sono "Comments", "Write a comment..." correttamente tradotti

---

## Iterazione 16.5.20 (5 giugno 2026) — Agenda Apple-style + commenti sulle assenze

### Feature 1 — Lista singolo giorno (stile Apple Calendar)
Rimosse le 3 sezioni collapsible (Today / Upcoming / Past / Absences) sotto
al calendario. Ora la lista è SINGOLA e mostra **solo cosa c'è nel giorno
selezionato** (default = oggi):
- Titolo dinamico bold "Oggi" o "lunedì 5 giugno" (capitalize)
- Counter discreto · N items
- Assenze active prima → poi eventi/task del giorno
- Empty state friendly "🌤️ Nessun impegno per questo giorno"
- Click su un giorno calendario → lista cambia subito
- Lo skipped occurrences appaiono inline come "🚫 ... ↩️ tocca per ripristinare"

**Comportamento attivo**: per vedere altri giorni → tap sul giorno nel
calendario. Niente più 3 bottoni "Today/Upcoming/Past" sempre aperti.

### Feature 2 — Commenti sulle assenze (thread chat-style)
Nuova feature: ogni assenza ora supporta commenti (info di viaggio,
raccomandazioni, contatti emergenza...).

**SQL** (`fammy-absence-comments.sql`):
- Nuova tabella `absence_responses` (id, absence_id, author_id, text, reactions jsonb, created_at)
- RLS: leggere/commentare chi vede l'assenza (autore o famiglia con visibility)
- Update/delete: solo autore del singolo commento
- Realtime publication abilitata

**Componente `AbsenceCommentsThread.jsx`**:
- Lista commenti con bubble chat (own = accent destra, altri = bianco sx)
- Avatar/nome (display_name da profiles)
- Input + Enter per inviare
- Auto-refresh 4s (no realtime per MVP)
- Auto-scroll in fondo a nuovo messaggio
- Empty state friendly "Lascia info di viaggio, contatti..."

**AbsenceModal**:
- Thread montato sotto al form (solo in edit con `editingAbsence.id`)
- Logica `readOnly`: se l'assenza non è mia, badge "👁️ Stai visualizzando l'assenza di un altro membro. Puoi commentarla sotto."
- Form fields disabilitati con opacity 0.6 + pointer-events: none
- Bottone "Salva" nascosto; "Annulla" diventa "Chiudi"
- AgendaTab: tap su qualsiasi card assenza apre il modal (anche di altri membri) → commenti accessibili a tutti

### File nuovi
- ➕ `/app/frontend/fammy-absence-comments.sql`
- ➕ `/app/frontend/src/components/AbsenceCommentsThread.jsx`

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/AgendaTab.jsx` — refactor lista singolo giorno
- ✏️ `/app/frontend/src/components/AbsenceModal.jsx` — readOnly mode + comments mount

### ⚠️ AZIONE UTENTE
Esegui `/app/frontend/fammy-absence-comments.sql` su Supabase SQL Editor.

### Testing
- Lint: ✅ tutti i file
- Build: ✅ (`fammy-20260605151424`)
- ⚠️ **Provalo tu**:
  1. Agenda → tap su un giorno con eventi → vedi SOLO quello sotto (no più sezioni)
  2. Tap su una propria assenza → form completo + sezione "💬 Commenti"
  3. Tap su assenza altrui → modal read-only con badge + commenti accessibili

---

## Iterazione 16.5.19 (5 giugno 2026) — Agenda redesign stile iPhone Calendar

### Refactor — Calendario pulito, minimal, iPhone-style
Ispirato a iPhone Calendar app. Cambiamenti:

**Header mese**:
- ✕ Rimossi i pulsanti ‹ › centrati ingombranti
- ➕ Bottoni pill year ‹2026 / 2026› ai lati, discreti e cliccabili per nav mese
- ➕ **Titolo "Giugno" bold 32px** font Cormorant sulla sinistra (era piccolo centrato)
- ➕ Bottone "Oggi" appare a destra quando si guarda un mese ≠ corrente
- Bottone Export ora icona 📥 in pill 36×36 (era pill testuale "Esporta")

**Griglia mese**:
- ✕ Rimossi box bianchi/bordi attorno a ogni cella → pulito, su sfondo neutro
- ✕ Rimossa ✈️ ripetuta su ogni giorno con assenze (era rumorosa)
- ✕ Rimossa la legenda eventi/incarichi/membri sotto al calendario
- ➕ **Numero giorno in cerchio**:
  - Oggi → cerchio pieno accent (var(--ac)) con numero bianco
  - Selezionato → bordo accent 1.5px, numero scuro
  - Passato → grigio sbiadito (var(--sm-dark))
  - Weekend → grigio chiaro (var(--km))
  - Normale → nero
- ➕ **Pallini riassuntivi** sotto: max 3 (1 evento / 1 task / 1 assenza), 5×5px
- ➕ Header weekday separato da underline 1px (cleaner separation)
- ➕ Min-height celle 56px per dare aria (era 44)

**Banner "X selezionato"**: ✕ rimosso, ridondante con i bucket sotto che già
cambiano label (📌 5 giu / Dopo 5 giu / Prima di 5 giu)

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/AgendaTab.jsx` — refactor MonthGrid + header

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260605150237`)
- ⚠️ **Provalo tu**: Agenda → ora vedi "Giugno" bold + griglia pulita stile iPhone, niente più box/legenda/✈️ ovunque

---

## Iterazione 16.5.18 (5 giugno 2026) — Modal sotto al notch iOS (PWA standalone)

### Bug fix — X nascosta dietro batteria/notch
**Root cause**: il safe-area-inset era applicato al `.modal` interno, ma il
modal-bg cresceva a tutta altezza viewport. Su iOS in PWA standalone con
`black-translucent` status bar, il modal poteva estendersi sotto al notch
/ Dynamic Island, e il padding-top del `.modal` non bastava a far scendere
la X sotto la zona del status bar.

**Fix**: spostato il safe-area-inset dal `.modal` al `.modal-bg`
(il container che è sempre fixed inset:0):
- `.modal-bg`: `padding-top: env(safe-area-inset-top, 0px)` — il modal
  non può MAI estendersi sopra alla zona sicura (notch/Dynamic Island)
- `.modal`: rimosso il padding-top condizionale, ora è semplice `24px`
- `.modal max-height`: `calc(92vh - env(safe-area-inset-top, 0px))` per
  evitare scroll non necessario
- Desktop (≥768px): `padding-top: 0` (no safe-area in vista web)

**X button**: aumentato da 32x32 → 40x40 px con sfondo `var(--ab)` più
visibile (era bianco quasi invisibile), font 20px (era 18), color
`var(--k)` (era grigio chiaro). Più tap-friendly e contrasto migliore.

### File modificati
- ✏️ `/app/frontend/src/styles.css` — safe-area su `.modal-bg`
- ✏️ `/app/frontend/src/components/AddTaskModal.jsx` — X button 40x40 solido

### Testing
- Build: ✅ (`fammy-20260605145531`)
- ⚠️ **Provalo tu** (PWA iOS): apri "Nuovo incarico" → ora la X è ben sotto
  la batteria, 40x40 con sfondo grigio chiaro e font 20px → facilmente
  premibile anche con dita grosse

---

## Iterazione 16.5.17 (5 giugno 2026) — UX modal "Nuovo incarico"

### Fix multipli su `AddTaskModal`
1. **Bottone ✕ chiusura** in alto a destra del header (32px pill grigia)
2. **Bottone ✕ accanto al campo Time** per cancellare orario inserito per
   sbaglio: visibile solo quando `dueTime` ha un valore, accanto all'input
3. **FAB nascosto quando modal aperto**: nuova regola CSS
   `body:has(.modal-bg) .fab { opacity: 0; pointer-events: none; transform: scale(0.85); }`.
   Si applica a TUTTI i 24 modali esistenti (usano `.modal-bg`). Eliminato il
   visual clutter del "+" rosso che spuntava sotto.
4. **Safe-area top/bottom** su `.modal`: padding-top ora rispetta
   `env(safe-area-inset-top)` per notch/dynamic island; padding-bottom
   rispetta `env(safe-area-inset-bottom)`. max-height aumentato 90→92vh.

### File modificati
- ✏️ `/app/frontend/src/components/AddTaskModal.jsx` — header con ✕ + time clear button
- ✏️ `/app/frontend/src/styles.css` — `:has()` rule per FAB + safe-area sulle modal

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260605144734`)
- ⚠️ **Provalo tu**:
  1. Bacheca → "+" → "Nuovo incarico" → vedi ✕ in alto a destra
  2. Imposta un orario → vedi ✕ accanto al campo → tap per cancellarlo
  3. Il "+" floating non si vede più mentre il modal è aperto
  4. Status bar del telefono non viene più tagliata sopra al modal

---

## Iterazione 16.5.16 (5 giugno 2026) — Slide animation al cambio mese

### Feature — Animazione slide del calendario
Aggiunta animazione slide-in del calendario quando cambi mese:
- ➡️ swipe destra / tap ‹ → slide IN da sinistra (280ms)
- ⬅️ swipe sinistra / tap › → slide IN da destra (280ms)
- Easing `cubic-bezier(.2,.8,.3,1)` per movimento naturale
- Opacità che parte da 0.4 per dare profondità

Nuove keyframes `fammy-month-slide-l/r` + classi `.month-slide-in-l/r`
applicate al wrapper della griglia con `key={year-month}` per forzare
remount e riavviare l'animazione.

`overflow: hidden` sul container per non far "uscire" la griglia durante
lo slide-in.

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/AgendaTab.jsx` — slideDir state + class
- ✏️ `/app/frontend/src/styles.css` — keyframes + classi animation

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260605143746`)
- ⚠️ **Provalo tu**: Agenda → swipe / tap ‹ › → vedi il calendario scivolare nella direzione opposta

---

## Iterazione 16.5.15 (5 giugno 2026) — Swipe orizzontale per cambiare mese in Agenda

### Feature — Swipe gesture sul calendario
Prima per passare da un mese all'altro bisognava cliccare ‹ o › piccoli
negli angoli. Adesso basta uno **swipe orizzontale** sul calendario:
- ➡️ swipe a destra → mese precedente
- ⬅️ swipe a sinistra → mese successivo

Implementato in `MonthGrid` con `onTouchStart`/`onTouchEnd` e ref `touchStart`.
Soglie:
- Delta orizzontale minimo: 60px
- Delta verticale max: 40px (per non confondere con scroll verticale)
- `touchAction: 'pan-y'` per permettere scroll verticale normale

I pulsanti ‹ › sono rimasti per accessibilità desktop e fallback.

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/AgendaTab.jsx` — useRef + onTouchStart/End sulla div del calendario

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260605143444`)
- ⚠️ **Provalo tu** (mobile/touch): Agenda → swipe left/right sul calendario → cambia mese

---

## Iterazione 16.5.14 (5 giugno 2026) — "Per me" coerente cross-feature

### UX consistency — "Per me" anche in CaregiverGreeting e Profilo

**CaregiverGreeting (saluto Bacheca)**:
- Aggiunto auto-include di se stesso se `is_assisted=true` (anche senza essere nel proprio cared_by)
- Sort self-first (`Per me` sempre in cima, poi alfabetico)
- Cards: quando rappresenta me, mostra "Per me · Le tue medicine" con avatar 👤 e bordo accent
- **Header dedicato quando l'unico assistito sono io**:
  - Icona 🩺 invece di 🤝
  - Titolo "Oggi gestisci la tua terapia" invece di "Oggi sei caregiver di te stesso" (suonava strano)
  - Sub: "Tap per aprire il tuo Care Hub"

**ProfileTab → Salute & assistenza**:
- Stesso include + sort self-first
- Cards rendono "Per me" con avatar 👤 e bordo accent
- **Header smart**: se l'unico è self → "🩺 La mia assistenza" altrimenti "👥 Persone che assisto"
- **Rimosso il bottone separato "🩺 Apri il mio Care Hub"** (era ridondante, la card "Per me" già lo apre con un tap)

### File modificati
- ✏️ `/app/frontend/src/components/CaregiverGreeting.jsx`
- ✏️ `/app/frontend/src/screens/tabs/ProfileTab.jsx`
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 3 nuove keys IT/EN (`cg_greet_self_only`, `cg_greet_self_sub`, `profile_my_care_h`)

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260605124001`)
- ⚠️ **Provalo tu**:
  1. Attiva "Sono assistito" sul tuo Profilo
  2. Bacheca → vedi "🩺 Oggi gestisci la tua terapia" con card "Per me · X medicine"
  3. Profilo → sezione "🩺 La mia assistenza" con card "Per me" (niente più bottone duplicato)
  4. Se sei anche caregiver di altri → header torna "👥 Persone che assisto" con "Per me" in cima

---

## Iterazione 16.5.13 (5 giugno 2026) — Picker meds: "Per me" invece di famiglia random

### UX fix — Voce "Per me" personalizzata nel meds picker
Prima nel bottom-sheet "Who are you adding meds for?" la propria entry
mostrava una famiglia random (es. "Raffael · 🍎 AMICI"). Confusionario:
le proprie medicine non sono per "famiglia AMICI", sono per la persona.

**Fix in BachecaTab + AgendaTab**:
- Quando `m.user_id === session.user.id` → la card mostra:
  - Avatar: `👤` (universal "person")
  - Nome: "**Per me**" (i18n `meds_picker_self_name`)
  - Sub: "Le tue medicine" (i18n `meds_picker_self_sub`)
  - Bordo accent + sfondo `--ab` per distinguerla visivamente
- Sort: "Per me" sempre in cima (sorted by self-first), poi alfabetico
- Per gli altri: stessa UI di prima (nome + 🏠 famiglia)

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/BachecaTab.jsx` — sort + render condizionale picker
- ✏️ `/app/frontend/src/screens/tabs/AgendaTab.jsx` — idem
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 2 nuove keys IT/EN

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260605123539`)
- ⚠️ **Provalo tu**: Bacheca/Agenda → tap FAB "+" → "💊 Nuova medicina" → vedi "Per me" in cima con bordo accent (al posto della famiglia random)

---

## Iterazione 16.5.12 (5 giugno 2026) — Care Hub unificato per persona

### Feature — Care Hub centralizzato sul "primary member" canonico
**Problema risolto**: se sono in più famiglie, ogni famiglia ha la sua
`members` row per me. Se aggiungevo le medicine viewing da RENGA, quando
poi guardavo dal lens TOPOLINI le medicine sparivano (erano sotto un altro
member_id). Risultato: 4 silos di Care Hub frammentati per la stessa persona.

**Approccio** (no DB migration):
- Concetto di **"primary member" canonico**: la row con `id` più piccolo
  alfabetico tra tutti i member rows con stesso `user_id`
- `MedicationsModal` adesso al mount fa una query
  `select * from members where user_id = X order by id asc limit 1` e
  swappa il `member` ricevuto in input con quello canonico
- Tutti i reads/writes (`medications`, `medical_profiles`, `daily_diary`,
  `care_attachments`) usano sempre `canonical.id` → dati coerenti
  indipendentemente dalla famiglia da cui si apre il Care Hub
- Per i placeholder (no user_id) nessun cambio: ogni placeholder è una persona

**Determinismo `dedupeByUser`**:
- Adesso sorta esplicitamente per `id` ascending prima del dedupe
- Garantisce che la "first row" tenuta sia sempre la stessa
- Coincide con la `getCanonicalMember()` di `personScope.js` → coerenza

### File nuovi
- ➕ `/app/frontend/src/lib/personScope.js` — `getCanonicalMember()`, `getPersonMemberIds()`

### File modificati
- ✏️ `/app/frontend/src/components/MedicationsModal.jsx` — auto-swap a canonical primary
- ✏️ `/app/frontend/src/lib/memberDedupe.js` — sort by id per determinismo

### ⚠️ Edge case noti (MVP, da valutare se serve fix)
- Caregiver assegnati (`cared_by`) sono per-member-row. Le altre famiglie
  non vedono i caregiver assegnati alla famiglia canonica. Per ora il
  badge "🤝 Caregiver" nell'header mostra solo i caregiver del canonical.
- Eventuali medicine create PRIMA di questa iterazione su un member non
  canonical sono orfanate (non visibili). Numerica probabilmente bassa
  visto che il Care Hub è stato introdotto recentemente.

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260605123003`)
- ⚠️ **Provalo tu**:
  1. Apri il tuo Care Hub dal Profilo (sezione "Apri il mio Care Hub")
  2. Aggiungi una medicina
  3. Dalla FamilyTab della tua altra famiglia, apri lo stesso "Te" → tap 💊
  4. ✅ La medicina è visibile anche lì

---

## Iterazione 16.5.11 (5 giugno 2026) — Hotfix: duplicati nel meds picker

### Bug fix — Persona che è in più famiglie compariva N volte
**Root cause**: in FAMMY ogni "persona" può essere membro di più famiglie
contemporaneamente, e ogni appartenenza è una `members` row separata. Se
l'utente Raffael è in 4 famiglie (RENGA, TOPOLINI, AMICI, OSPEDALE),
esistono 4 rows `members` con stesso `user_id`. Quando attiva "Sono assistito"
(che fa update batch su TUTTI i suoi member rows), nel picker delle medicine
e nel "Persone che assisto" appaiono 4 voci "Raffael" identiche.

**Fix**: nuovo helper `lib/memberDedupe.js` con funzione `dedupeByUser()`:
- Membri con `user_id` → tenuto solo il primo (sono la stessa persona)
- Membri SENZA `user_id` (placeholder) → tenuti tutti (sono persone fisiche distinte, es. una "Nonna senza account" è in una sola famiglia)

**Applicato in 4 punti**:
1. `BachecaTab.jsx` → `assistedMembers` (popolamento picker "💊 Nuova medicina")
2. `AgendaTab.jsx` → idem
3. `CaregiverGreeting.jsx` → `assistedByMe` (saluto in cima Bacheca)
4. `ProfileTab.jsx` → `assistedByMe` (sezione "Persone che assisto")

### File nuovi
- ➕ `/app/frontend/src/lib/memberDedupe.js`

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/BachecaTab.jsx`
- ✏️ `/app/frontend/src/screens/tabs/AgendaTab.jsx`
- ✏️ `/app/frontend/src/components/CaregiverGreeting.jsx`
- ✏️ `/app/frontend/src/screens/tabs/ProfileTab.jsx`

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260605122509`)
- ⚠️ **Provalo tu**: attiva "Sono assistito" sul tuo profilo → tap FAB + "💊 Nuova medicina" → ora vedi te stesso UNA volta sola (non più 4 entry duplicate).

---

## Iterazione 16.5.10 (5 giugno 2026) — Saluto Caregiver in Bacheca

### Feature — "🤝 Oggi sei caregiver di Pina"
Nuovo componente `CaregiverGreeting.jsx` montato in cima alla Bacheca
(sopra BirthdayReminder). Si nasconde se l'utente non è caregiver di nessuno.

**Layout**:
- Card pill verde gradient con icona 🤝
- Header: "Oggi sei caregiver di {nome}" (singolare) o
  "Oggi sei caregiver di N persone" (plurale)
- Sub: "Tap per aprire il Care Hub di chi vuoi"
- Sotto: card cliccabile per ogni assistito (avatar + nome + "💊 N medicine" oggi)
- Tap su una card → apre direttamente il Care Hub di quell'assistito

**Conteggio medicine**:
- Query unica `medications` per tutti gli assistiti
- Conta `times_of_day.length` come proxy di "medicine da prendere oggi"
- Se 0 medicine → mostra "🩺 Care Hub" come fallback

**Reattivo**: si auto-aggiorna quando cambia la lista di assistiti
(membersChanged → BachecaTab re-render → CaregiverGreeting useEffect ri-fetch).

### File nuovi
- ➕ `/app/frontend/src/components/CaregiverGreeting.jsx`

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/BachecaTab.jsx` — import + mount in cima
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 6 nuove keys IT/EN (`cg_greet_one/many`, `cg_greet_sub`, `cg_med_one/many`, `cg_no_meds`)

### Testing
- Lint: ✅
- Build: ✅ (`fammy-20260605111529`)
- ⚠️ **Provalo tu** (richiede `fammy-caregivers.sql` già deployato):
  1. Marca un membro come assistito e te stesso come caregiver
  2. Apri Bacheca → vedi la card verde "🤝 Oggi sei caregiver di {nome}"
  3. Tap sulla card → si apre il Care Hub direttamente

---

## Iterazione 16.5.9 (5 giugno 2026) — Caregiver system + FAB Agenda allineato

### Feature 1 — FAB Agenda allineato a Bacheca + pulse "guarda qui!"
Il FAB "+" in Agenda mostrava solo "Nuovo incarico" + "Nuova assenza". Adesso
è perfettamente allineato a quello di Bacheca con anche "💊 Nuova medicina"
(visibile solo se ci sono assistiti accessibili). Identico picker bottom-sheet
quando ci sono ≥2 assistiti.

**Pulse "guarda qui"**: quando l'utente clicca una data nel calendario,
il FAB lampeggia con un'animazione pulsante (3 onde di ring + scale up).
Nuova animazione CSS `fammy-fab-attract` (1.4s, applicata via classe
`.fab.fab-pulse`). Nuovo prop `pulse: boolean` su `FabSpeedDial`.

### Feature 2 (a+b+c) — Sistema Caregiver completo
Un membro "assistito" (es. nonna senza smartphone, bambino, demenza) può
avere uno o più "caregiver" — altri membri della stessa famiglia.

**SQL migration** (`fammy-caregivers.sql`):
- Nuova colonna `members.cared_by uuid[]` (default vuoto)
- Index GIN per query rapide
- Funzione `get_member_caregiver_user_ids(member_id)` — restituisce auth.uid dei caregivers attivi
- Funzione `get_my_assisted_members()` — lista assistiti dell'utente corrente

**Componente `CaregiverPicker.jsx`** riutilizzabile:
- Chip toggle multi-select con avatar + nome
- Esclude assistito stesso e placeholder senza account
- Empty-state friendly quando non ci sono caregiver candidates

**Edit/Add Member Modal**:
- Quando spunto "è assistito", appare riga "🤝 Chi se ne occupa?"
- Caregiver salvati in `cared_by`
- Fallback graceful se migration non eseguita (`cared_by` errore → retry senza)

**Edge function `medication-reminder-push`** routing intelligente:
- Se `cared_by` non vuoto → push **solo ai caregiver** (+ assistito se ha account, per doppio canale)
- Se vuoto → fallback storico: tutta la famiglia
- Dedup user_ids prima dell'invio

**UI rifinita (opzione c)**:
- 🩺 **Care Hub header**: badge "🤝 Maria, Luca" sotto al nome dell'assistito
- 👤 **ProfileTab → Salute**: nuova sezione "👥 Persone che assisto" con
  shortcut diretti al Care Hub di ciascun assistito
- 👥 **FamilyTab card**: chip verde "🤝 Maria" sotto il badge assenze

### File nuovi
- ➕ `/app/frontend/fammy-caregivers.sql` — migration + 2 funzioni SQL
- ➕ `/app/frontend/src/components/CaregiverPicker.jsx` — multi-select chip

### File modificati
- ✏️ `/app/frontend/src/components/FabSpeedDial.jsx` — prop `pulse` + classe
- ✏️ `/app/frontend/src/styles.css` — keyframe `fammy-fab-attract` + `.fab.fab-pulse`
- ✏️ `/app/frontend/src/screens/tabs/AgendaTab.jsx` — FAB allineato + pulse on selectedDay + MedicationsModal mount + picker
- ✏️ `/app/frontend/src/components/EditMemberModal.jsx` — caregiver picker + fallback schema
- ✏️ `/app/frontend/src/components/AddMemberModal.jsx` — caregiver picker + fallback schema
- ✏️ `/app/frontend/src/components/MedicationsModal.jsx` — badge caregivers nell'header
- ✏️ `/app/frontend/src/screens/tabs/ProfileTab.jsx` — sezione "Persone che assisto"
- ✏️ `/app/frontend/src/screens/tabs/FamilyTab.jsx` — chip "🤝" sulle card
- ✏️ `/app/frontend/supabase/_dashboard_standalone/medication-reminder-push.ts` — routing intelligente
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 5 nuove keys IT/EN

### ⚠️ AZIONE UTENTE (2 step)
1. Esegui `/app/frontend/fammy-caregivers.sql` su Supabase SQL Editor
2. Re-deploya la edge function `medication-reminder-push` (dashboard Supabase → Edge Functions → medication-reminder-push → Deploy)

### Testing
- Lint: ✅ tutti i 7 file
- Build: ✅ (`fammy-20260605111125`)
- ⚠️ **Provalo tu**:
  1. Famiglia → modifica un membro assistito → ora vedi "🤝 Chi se ne occupa?" con chip → seleziona 1-2 caregiver → salva
  2. Care Hub header mostra "🤝 [nomi caregiver]"
  3. FamilyTab card mostra chip verde "🤝 Maria"
  4. Profilo → "Salute & assistenza" mostra "👥 Persone che assisto" con shortcut
  5. Agenda → tap su una data → il "+" lampeggia per 1.5s
  6. Agenda → tap "+" → vedi anche "💊 Nuova medicina" (se hai assistiti)

---

## Iterazione 16.5.8 (5 giugno 2026) — Auto-bump CACHE_NAME ad ogni deploy

### Bug fix definitivo — La PWA installata non si aggiornava ai deploy
**Root cause**: il `CACHE_NAME` del service worker era hardcoded
(`'fammy-v2-2026-06-05'`). Per pushare un update bisognava modificarlo a
mano prima di ogni deploy. L'utente doveva ricordarselo ogni volta →
spesso non lo facevamo → PWA restava sulla versione vecchia.

**Fix automatico**:

1. **`/app/frontend/public/sw.js`**: il `CACHE_NAME` ora usa il placeholder
   `__BUILD_VERSION__`:
   ```js
   const BUILD_VERSION = '__BUILD_VERSION__';
   const CACHE_NAME = `fammy-${BUILD_VERSION}`;
   ```

2. **`/app/frontend/vite.config.js`**: nuovo plugin Vite `swCacheBust()`
   che a build-time (`apply: 'build'`) genera un timestamp del momento del
   build (es. `20260605105344`) e sostituisce il placeholder dentro
   `dist/sw.js`. Log in console: `[sw-cache-bust] CACHE_NAME → fammy-...`

Ogni `git push` → Vercel/GitHub esegue `yarn build` → il plugin scrive un
nuovo timestamp in `sw.js` → al primo refresh della PWA installata il
browser scarica il SW diverso → entra in "waiting" → il polling 30s
dell'`UpdateBanner` lo intercetta → l'utente vede il toast "App aggiornata
· tocca per ricaricare" senza che tu debba dirmi nulla.

**In dev mode** il SW resta con la stringa literal `__BUILD_VERSION__`
(non viene processato perché `apply: 'build'`), ma il SW dev-mode non è
installato dai browser quindi nessun problema.

### Pulizia warning build
Rimossi 2 `close:` duplicati che avevo introdotto in IT/EN
(esistevano già da `cancel/save/close/delete` riga 20/920).

### File modificati
- ✏️ `/app/frontend/public/sw.js` — placeholder `__BUILD_VERSION__`
- ✏️ `/app/frontend/vite.config.js` — plugin `swCacheBust()`
- ✏️ `/app/frontend/src/lib/i18n.jsx` — rimossi 2 `close:` duplicati

### Testing
- Build di prova ✅ (output: `[sw-cache-bust] CACHE_NAME → fammy-20260605105344`)
- Verificato `dist/sw.js` contiene il timestamp corretto
- ⚠️ **Provalo tu**: pusha su GitHub → al primo rientro nella PWA installata
  vedrai il toast "App aggiornata · ricarica" entro 30s, senza che tu debba
  dirmelo. Mai più "ah, ti devo dire ogni volta di aggiornare il SW".

---

## Iterazione 16.5.7 (5 giugno 2026) — Care Hub: Allegati + Condivisione report

### Feature 1 — Allegati Care Hub (foto + PDF)
Ora si possono caricare foto e PDF (referti, esami, ricette, foto della
confezione delle medicine, foto del giorno…) direttamente nel Care Hub.

**SQL migration** (`fammy-care-attachments.sql`):
- Nuovo bucket storage `care-attachments` (public, 10MB max, image/* + PDF)
- Nuova tabella `care_attachments` (member_id, kind, parent_id, file_name, file_path, mime_type, size, note, uploaded_by)
- RLS same-family su tabella + storage (chiunque della stessa famiglia può vedere/aggiungere/cancellare)
- Aggiunto al realtime publication

**Componente** `CareAttachments.jsx`:
- 1 prop `kind`: 'profile' | 'medication' | 'diary'
- Upload con preview, griglia 3-col responsive con thumbnail
- PDF → icona 📄 + nome file truncato
- ✕ overlay per delete (best-effort: storage + DB)
- Variante `compact` (per medicine inline)

**Wire-up nei 3 punti del Care Hub**:
- 📋 Profilo medico → sezione "📎 Documenti & foto" full size in fondo
- 💊 Medicine → compact (griglia inline sotto ogni card medicina)
- 📓 Diario → in fondo alla entry di oggi (visibile solo dopo aver salvato)

### Feature 2 — Bottone "📤" Condividi report sanitario
Nuovo componente `CareReportShare.jsx` montato nel header del MedicationsModal
(icona 📤 accanto al ✕):

Genera un report testuale strutturato:
- Anagrafica (nome, compleanno)
- Profilo medico (gruppo sanguigno, allergie farmaci/cibo, condizioni, emergenza, medico, tessera)
- Terapia in corso (lista medicine con dose + orari)
- Diario ultimi 7 giorni (mood + sonno + appetito + peso + note)
- Footer "Generato da FAMMY"

4 opzioni di condivisione:
- 📋 **Copia** (clipboard) — feedback "✓ Copiato" 2s
- 📲 **Condividi…** (Web Share API nativa, se supportata)
- 💬 **WhatsApp** diretto (apre `wa.me/?text=...`)
- 📧 **Email** diretta (apre `mailto:` con subject + body precompilati)

Anteprima del report in textarea readonly modificabile in altezza prima
della condivisione. Niente file allegati inviati (per privacy + dimensione).

### File nuovi
- ➕ `/app/frontend/fammy-care-attachments.sql` — migration + RLS
- ➕ `/app/frontend/src/components/CareAttachments.jsx` — componente uploader/galleria
- ➕ `/app/frontend/src/components/CareReportShare.jsx` — bottom-sheet condivisione

### File modificati
- ✏️ `/app/frontend/src/components/MedicationsModal.jsx` — bottone 📤 share + allegati per medicina + mount CareReportShare
- ✏️ `/app/frontend/src/components/MedicalProfileSection.jsx` — mount CareAttachments per profilo
- ✏️ `/app/frontend/src/components/DailyDiarySection.jsx` — mount CareAttachments per entry diario di oggi
- ✏️ `/app/frontend/src/lib/i18n.jsx` — ~16 nuove keys IT/EN (`care_att_*`, `crs_*`, `dd_save_to_attach`, `copied`, `close`)

### ⚠️ AZIONE UTENTE
Esegui `/app/frontend/fammy-care-attachments.sql` su Supabase SQL Editor → Run.
Senza la migration, la sezione allegati non funziona (tabella + bucket assenti).

### Testing
- Lint: ✅ tutti i file
- Smoke screenshot landing: ✅
- ⚠️ Test end-to-end (richiede login + SQL deployato) — **provalo tu**:
  1. Care Hub di un membro assistito → tab "Profilo medico" → vedi la nuova
     sezione "📎 Documenti & foto" in fondo → carica un PDF/foto → appare in griglia
  2. Tab "Medicine" → sotto ogni medicina ora c'è una mini-griglia per le foto della confezione
  3. Tab "Diario" → dopo aver salvato la entry di oggi, appare la sezione allegati
  4. Header Care Hub → tap 📤 → bottom-sheet condivisione con anteprima report
  5. Tap su 💬 WhatsApp → si apre `wa.me/?text=...` con il report già scritto

---

## Iterazione 16.5.6 (5 giugno 2026) — Self-Care Hub + FAB "Nuova medicina" + traduzioni Care Hub

### Feature 1 — Self-toggle "Sono un membro assistito" nel Profilo
Prima il toggle "è assistito" esisteva solo in EditMemberModal (gestito da
qualcun altro). Adesso ogni utente può marcarsi autonomamente come assistito
dal proprio Profilo, sbloccando da subito Medicine + Profilo medico + Diario
per sé stesso.

Nuova `ProfileGroup` "🩺 Salute & assistenza" in `ProfileTab.jsx`:
- Toggle "Sono un membro assistito" (stessa UI pill verde di AddMemberModal)
- Aggiorna `is_assisted` su TUTTI i `member rows` dell'utente (across families) in batch via `update(...).in('id', ids)`
- Quando attivo, mostra pulsante "🩺 Apri il mio Care Hub" → apre `MedicationsModal` direttamente sul proprio member

### Feature 2 — FAB "💊 Nuova medicina" sulla Bacheca
Aggiunta una nuova voce nel `FabSpeedDial` della Bacheca: "💊 Nuova medicina"
(visibile SOLO se ci sono membri assistiti accessibili — l'utente stesso o
familiari).

Logica di apertura intelligente:
- 0 assistiti → la voce non appare
- 1 assistito → apre `MedicationsModal` direttamente
- ≥2 assistiti → bottom-sheet picker che chiede "Per chi vuoi aggiungere medicine?"

**Recommendation al posto di un "Promemoria generico"**: Le medicine in FAMMY
hanno già `times_of_day[]` con reminder push automatici → sono di fatto
**promemoria ricorrenti specializzati per la terapia**. Per promemoria
generici (es. "Pagare bolletta") basta usare i Task con `recurring_days`.
Quindi: nessun bisogno di un'entità "Promemoria" separata.

### Feature 3 — Traduzioni complete Care Hub (Profilo medico + Diario)
Prima molti label/placeholder mostravano la chiave raw (es. `mp_blood_type_label`,
`dd_appetite_low`). Aggiunte ~35 nuove i18n keys × IT/EN:
- `mp_blood_type_label`, `mp_blood_type`, `mp_emergency`, `mp_emergency_contact`
- `mp_allergies_label/ph`, `mp_food_label/ph`, `mp_conditions_label/ph`
- `mp_emergency_h`, `mp_ec_name_ph`, `mp_ec_phone_ph`, `mp_ec_relation_ph`
- `mp_doctor_h`, `mp_doctor_name_ph`, `mp_doctor_phone_ph`
- `mp_health_card_label/ph`, `mp_notes_label/ph`, `mp_last_updated`
- `dd_today`, `dd_mood_label`, `dd_sleep_label`, `dd_weight_label`
- `dd_appetite_label`, `dd_appetite_low`, `dd_appetite_med`, `dd_appetite_high`
- `dd_notes_label`, `dd_notes_ph`, `dd_save_today`, `dd_history_h`, `loading`
- `fab_new_med`, `meds_picker_h`
- `profile_card_health_t/s`, `profile_self_assisted_label/hint`, `profile_open_care_hub`

`care_tab_profile` ribattezzato da "Profilo" → "Profilo medico" per chiarire
(evita confusione con il "Profilo" della bottom nav).

FR/DE: fallback automatico a IT (sono lingue secondarie).

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/BachecaTab.jsx` — FAB con "Nuova medicina" + picker
- ✏️ `/app/frontend/src/screens/tabs/ProfileTab.jsx` — nuova `ProfileGroup` Salute & assistenza
- ✏️ `/app/frontend/src/lib/i18n.jsx` — ~35 nuove keys IT/EN

### Testing
- Lint: ✅ tutti i file
- ⚠️ **Provalo tu**:
  1. Profilo → vedi "🩺 Salute & assistenza" → spunta "Sono un membro assistito" → appare bottone "🩺 Apri il mio Care Hub"
  2. Bacheca → tap FAB "+" → se hai assistiti vedi "💊 Nuova medicina" come terza voce
  3. Care Hub → tab "Profilo medico" e "Diario" ora completamente tradotte

---

## Iterazione 16.5.5 (5 giugno 2026) — Upload foto in NewFamilyModal

### Feature — Foto famiglia caricabile già in creazione
Prima si poteva impostare la foto della famiglia solo entrando in
"Modifica famiglia" DOPO averla creata. Adesso lo stesso uploader è
presente direttamente in `NewFamilyModal`.

Refactor di `NewFamilyModal.jsx`:
- State `photoFile` / `photoPreview` + ref input file (stesso pattern di EditFamilyModal)
- UI uploader 84×84 px con bordo tratteggiato + ✕ overlay rosso per rimuovere
- Bottone "📸 Carica foto / Cambia foto" + hint UX
- Label "Emoji (fallback)" quando c'è foto, "Emoji" quando non c'è
- Flusso di creazione a 3 step:
  1. INSERT `families`
  2. Upload foto nel bucket `family-photos/family-{id}/cover-{ts}.{ext}` + UPDATE photo_url (best-effort: se fallisce la famiglia resta creata con solo emoji)
  3. INSERT `members` owner

### File modificati
- ✏️ `/app/frontend/src/components/NewFamilyModal.jsx` — refactor completo

### Testing
- Lint: ✅
- ⚠️ **Provalo tu**: Famiglia → "+ Nuova famiglia" → ora c'è la sezione
  "Foto famiglia" → carica → crea → la nuova famiglia avrà già la foto.

---

## Iterazione 16.5.4 (5 giugno 2026) — Toggle "è assistito" anche in AddMemberModal

### Feature — Marca un membro come assistito già in creazione
Prima il toggle "🩺 Questo membro è assistito" esisteva solo in
`EditMemberModal` (modifica). Per attivarlo bisognava creare il membro,
salvare, riaprirlo in modifica e spuntare la voce. UX scomoda.

Fix in `AddMemberModal.jsx`:
- Nuovo state `isAssisted` (default false)
- Stessa pillola UI di EditMemberModal (sfondo verde se attivo, hint sotto)
- Payload `members.insert` ora include `is_assisted: isAssisted`
- Fallback graceful: se la colonna non esiste (migration `fammy-medications.sql`
  non eseguita), ritenta senza `is_assisted` così il membro viene creato comunque
- `data-testid="addmember-is-assisted-toggle"` per testing

### File modificati
- ✏️ `/app/frontend/src/components/AddMemberModal.jsx` — state + UI toggle + retry

### Testing
- Lint: ✅
- ⚠️ **Provalo tu**: Famiglia → "+ Aggiungi membro" → ora vedi il toggle
  "🩺 Questo membro è assistito" sotto al color picker. Spunta → crea →
  immediatamente la card avrà il bottone 💊 Medicine.

---

## Iterazione 16.5.3 (5 giugno 2026) — FamilySwitcher uniforme + Priorità nel tab Chat + No pallino verde

### Feature 1 — FamilySwitcher uniforme (Bacheca / Spese / Famiglia come Agenda)
Prima il `Header` di HomeScreen renderizzava la `FamilySwitcher` con
`variant="title"` (font Cormorant 36px + emoji 36px), che risultava grande e
incoerente con l'Agenda dove invece era `variant="pill"` (compatto, pill
bianca con border + ombra).

Refactor di `Header` in `HomeScreen.jsx`:
- Rimosso il wrapper `.hdr` (padding 24px) → ora un semplice flex column con padding 10px 16px 6px
- `FamilySwitcher` passa a `variant="pill"`
- Subtitle "N famiglie · M da fare" mostrato sotto come testo grigio 12px

Risultato: tutte e 4 le tab principali ora hanno la stessa pill di selezione
famiglia, esteticamente uniformi.

### Feature 2 — Niente pallino verde per priorità "Normale" sulle task card
Prima ogni `TaskCard` mostrava un pallino colorato `tc-check` con
`background: priorityColor`: per priorità normale era verde (var(--gn)),
creando rumore visivo non necessario.

Fix in `BachecaTab.jsx` → `TaskCard`:
- Priorità `normal` → cerchio neutro con bordo tratteggiato grigio
  (`border: '1.5px dashed var(--sm)'`, sfondo trasparente)
- Priorità `medium` / `high` → pallino colorato come prima (giallo / rosso)
- Status `done` → cerchio verde con ✓ (invariato)

Conserva il segnale visivo di urgenza solo dove serve davvero.

### Feature 3 — Stato + Priorità in cima al tab Chat (TaskDetailModal)
La sezione "Stato" era hidden dentro il tab "Dettagli", e la priorità non
era impostabile dal modal del task (solo via long-press sulla TaskCard nella
Bacheca). UX poco scopribile.

Refactor in `TaskDetailModal.jsx`:
- **Rimossa** la sezione "Stato" (4 righe) dal tab Dettagli
- **Aggiunta** una nuova "Action bar" `data-testid="task-action-bar"` in
  cima al tab **Chat** (tab di default) con 2 righe:
  - **Stato**: 3 pill compatte (Da fare · Fatto · Da pagare). Click chiude
    il modal (UX invariata).
  - **Priorità**: 3 pill compatte (🟢 Normale · 🟠 Attenzione · 🔴 Urgente).
    Click non chiude il modal (l'utente di solito continua a chattare).
- Nuova funzione `updatePriority(p)` che aggiorna `tasks.priority` +
  `tasks.urgent` (per backward compat).

i18n: 4 nuove key × IT/EN/FR/DE:
- `td_priority_label` — "Priorità"
- `td_prio_normal` — "🟢 Normale"
- `td_prio_medium` — "🟠 Attenzione"
- `td_prio_high` — "🔴 Urgente"

### File modificati
- ✏️ `/app/frontend/src/screens/HomeScreen.jsx` — Header refactor a pill
- ✏️ `/app/frontend/src/screens/tabs/BachecaTab.jsx` — TaskCard: no pallino verde su priorità normale
- ✏️ `/app/frontend/src/components/TaskDetailModal.jsx` — Stato + Priorità nel tab Chat, rimosso da Dettagli
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 4 nuove key × 4 lingue

### Testing
- Lint: ✅ tutti i file
- Smoke screenshot landing: ✅
- ⚠️ Test funzionale richiede login Google → **provalo tu**:
  1. Apri Bacheca → vedi pill "🌍 Tutte" compatta come in Agenda
  2. Vai in Spese e Famiglia → stessa pill
  3. Sulla TaskCard "Da fare" il cerchio è grigio tratteggiato (non verde)
  4. Apri un task → in cima alla tab Chat vedi 2 righe: Stato + Priorità

---

## Iterazione 16.5.2 (5 giugno 2026) — Hotfix: Medicine button non apriva il modal

### Bug fix — `MedicationsModal` non montato nella vista "Tutte le famiglie"
**Root cause**: in `FamilyTab.jsx` il componente `<MedicationsModal>` era
renderizzato solo nel branch della singola famiglia (riga 536), ma NON nel
branch `isAll` (vista "Tutte"). L'`onOpenMedications` impostava correttamente
lo state `medsMember`, ma il modal non veniva mai renderizzato → tap su 💊
Medicine nella vista "Tutte" non apriva nulla.

**Fix**: aggiunto il mount `<MedicationsModal>` anche dentro il return della
vista `isAll` (subito dopo `<AbsenceModal>`).

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/FamilyTab.jsx` — aggiunto mount
  `MedicationsModal` nel branch isAll

### Testing
- Lint: ✅
- ⚠️ Test funzionale richiede login Google → **provalo tu**: dalla vista
  "Tutte le famiglie" espandi una famiglia → su un membro assistito tap
  💊 Medicine → ora il modal Care Hub si apre correttamente.

---

## Iterazione 16.3 (4 giugno 2026, notte) — Profilo riorganizzato + traduzioni mancanti

### Iterazione 16.3.2 — Apple login rimosso + lista prefissi internazionali estesa

### Iterazione 16.3.3 — Auto-detect paese + search-bar nei prefissi

### Iterazione 16.3.4 — Hint prefisso per paese + recovery numero

### Iterazione 16.3.5 — Backup Google account per utenti phone-only

### Iterazione 16.3.6 — Invito: solo Google/telefono + delete membri

### Iterazione 16.3.7 — Deep-link PWA + push background fix

### Iterazione 16.3.8 — Conferma "Sei tu?" per inviti dedicati

### Iterazione 16.3.9 — Conferma "Sei tu Jenna?" anche per inviti generici con placeholder

### Iterazione 16.3.10 — Permessi membri + "Esci dalla famiglia" + estetica

### Iterazione 16.3.11 — Rimuovi foto + tab Chat di default su task

### Iterazione 16.3.12 — PhotoGalleryEditor (add + remove inline)

### Iterazione 16.3.13 — Unificate Foto+Spese dentro Dettagli, 📎 inline nel chat

### Iterazione 16.3.14 — Badge WhatsApp + anteprima foto inline

### Iterazione 16.3.15 — Badge "messaggi non letti" + Auto-update PWA

### Iterazione 16.4 — Persone Assistite Fase 1: Medicine + Reminder

### Iterazione 16.5 — Persone Assistite Fase 2: Profilo medico + Diario + Push background

### Iterazione 16.5.1 — Refactor estetico card membro

#### Refactor — MemberCard più leggibile
Prima la card era affollata: nome + 3-4 chip in una sola riga che andava
a capo, ruolo sotto, "Anche in:" sotto ancora, compleanno e poi bottoni
in fila orizzontale. Risultato visivo: caos su mobile <400px.

Nuovo layout a 6 righe verticali ben distinte:
1. Nome (bold 15) + chip identità (Owner / Tu) inline
2. Ruolo · stato account (12px, grigio)
3. 🎂 Compleanno (se presente)
4. Badge assenza (su sua riga, full pillola)
5. "Anche in:" + chip altre famiglie
6. Action bar (✈️ Assenza · 💊 Medicine) in pill compatte

Colonna destra: bottone Invita 💌 / Esci 🚪 / ✕ separati.
Avatar 40 → 44px, gap tra righe 4px, alignItems: flex-start per evitare
schiacciamento.

#### Estrazione helper `pillBtn(color, filled)`
Funzione DRY per i bottoni a pillola dentro la card.

#### Testing
- Lint: ✅
- Smoke screenshot: ✅
- ⚠️ **Provalo tu**: vai in Famiglia → vedrai le card più pulite e ordinate

---


#### Feature 1 — Profilo medico
Per ogni membro `is_assisted=true`, ora c'è un profilo medico 1:1 con:
- Gruppo sanguigno (select)
- Allergie a farmaci (tag input multi-valore)
- Allergie/intolleranze alimentari (tag input)
- Condizioni note (textarea)
- 🚨 Contatto di emergenza (nome + telefono cliccabile + relazione)
- 🩺 Medico curante (nome + telefono)
- Numero tessera sanitaria
- Note libere

In cima alla card un **banner giallo emergenza** sempre visibile con
gruppo sanguigno + contatto emergenza (visibile a caregivers per
intervento rapido).

#### Feature 2 — Diario giornaliero
Per ogni giorno (UNIQUE su `member_id + diary_date`):
- 😄 Mood 1-5 (5 emoji)
- 💤 Ore di sonno (number step 0.5)
- 🍽️ Appetito (poco / normale / molto)
- ⚖️ Peso opzionale
- 📝 Note libere

Storico ultimi 14 giorni mostrato sotto con mood emoji + nota breve.

#### Feature 3 — Care Hub UI (3 tab)
Refactor del MedicationsModal in `Care Hub` con 3 tab strip in cima:
- 💊 Medicine (esistente)
- 🩺 Profilo (nuovo)
- 📓 Diario (nuovo)

#### Feature 4 — Push background (Edge Function cron)
- ➕ `/app/frontend/supabase/_dashboard_standalone/medication-reminder-push.ts`:
  Edge Function che ogni minuto (via pg_cron) controlla le medicine in
  scadenza ±1 min e manda push a **tutti i membri della famiglia** del
  paziente. Logica anti-spam: salta se già `taken/skipped`, e in caso
  di `snoozed` rispetta `snoozed_until`.

- ➕ `/app/frontend/fammy-medication-cron.sql`: registra il job pg_cron
  `fammy-medication-reminder` ogni `* * * * *` (ogni minuto). Idempotente.

#### File modificati / nuovi
- ➕ `fammy-medical-profile-diary.sql` — tabelle medical_profiles + daily_diary
- ➕ `fammy-medication-cron.sql` — schedule pg_cron
- ➕ `supabase/_dashboard_standalone/medication-reminder-push.ts` — Edge Function
- ➕ `MedicalProfileSection.jsx` — UI profilo medico
- ➕ `DailyDiarySection.jsx` — UI diario
- ✏️ `MedicationsModal.jsx` — refactor a 3 tab (Care Hub)
- ✏️ `i18n.jsx` — 5 nuove key × IT/EN

#### ⚠️ AZIONE UTENTE (5 step)
1. Esegui `/app/frontend/fammy-medical-profile-diary.sql` su Supabase SQL Editor
2. Deploy della Edge Function `medication-reminder-push` su Supabase
   (Dashboard → Edge Functions → Deploy new function → copia
   `medication-reminder-push.ts` come body, `verify_jwt = false`)
3. Verifica che pg_cron sia abilitato: Database → Extensions → pg_cron ON
4. Esegui `/app/frontend/fammy-medication-cron.sql` per registrare il job
5. Testa: aggiungi una medicina con orario tra 2 min, chiudi l'app → push dovrebbe arrivare

#### Testing
- Lint: ✅ tutti file
- Smoke screenshot: ✅
- ⚠️ Test push background richiede SQL + Edge Function deployati → test manuale

---


#### Feature — Gestione medicine per membri assistiti
Primo blocco della **sezione "Anziani / Badanti / Bambini assistiti"**.
Permette di:
1. Marcare un membro come "assistito" (toggle `is_assisted` nel suo profilo)
2. Aggiungere medicine con nome, dose, note, orari multipli giornalieri
3. Ricevere reminder in-app real-time quando è ora di una medicina
4. Marcare ogni dose come **✅ Presa** / **⏰ Posticipa (10/30/60 min)** /
   **⏭️ Salta**
5. Vedere lo "Storico oggi" con tutte le azioni registrate

#### Privacy (modalità 2a)
Tutti i membri della stessa famiglia possono vedere e gestire le medicine.
RLS Supabase: chi NON è membro della famiglia non può fare nemmeno SELECT.

#### Database (`fammy-medications.sql`)
- `members.is_assisted boolean DEFAULT false`
- `medications` (id, member_id, name, dose, notes, times_of_day[], active, created_by)
- `medication_logs` (id, medication_id, scheduled_at, action: taken/snoozed/skipped, snoozed_until, recorded_by)
- RLS policies per same-family
- Aggiunto al realtime publication

⚠️ **AZIONE UTENTE**: esegui `/app/frontend/fammy-medications.sql` su
Supabase SQL Editor.

#### File modificati / nuovi
- ➕ `/app/frontend/fammy-medications.sql` (migration)
- ➕ `/app/frontend/src/components/MedicationsModal.jsx` (CRUD + form)
- ➕ `/app/frontend/src/components/MedicationReminderToast.jsx` (UI popup reminder)
- ➕ `/app/frontend/src/lib/useMedicationReminders.js` (hook polling + realtime)
- ✏️ `/app/frontend/src/components/EditMemberModal.jsx` (toggle is_assisted)
- ✏️ `/app/frontend/src/screens/tabs/FamilyTab.jsx` (button "💊 Medicine" su card assistiti)
- ✏️ `/app/frontend/src/screens/HomeScreen.jsx` (monta hook + toast globale)
- ✏️ `/app/frontend/src/lib/i18n.jsx` (~30 nuove key × IT/EN, FR/DE fallback EN)

#### Testing
- Lint: ✅ tutti file
- Smoke screenshot: ✅
- ⚠️ Test end-to-end richiede SQL deployato → **provalo tu**:
  1. Esegui la migration su Supabase
  2. Vai in Famiglia → tocca un membro → spunta "Questo membro è assistito" → Salva
  3. Sulla card del membro vedrai un nuovo bottone "💊 Medicine" → tap
  4. Aggiungi una medicina con orario impostato a "tra 1 minuto"
  5. Attendi → il reminder dovrebbe apparire come popup in basso

---


#### Feature 1 — Badge intelligente (messaggi non letti)
Prima il badge Bacheca contava "task non fatti che mi riguardano" (statico).
Ora è **dinamico stile WhatsApp**: conta i task con **commenti non letti
dopo la mia ultima apertura**.

- ➕ `/app/frontend/src/lib/useUnreadTaskCount.js`:
  - Query batch dei `task_responses` recenti per i task aperti
  - Filtra commenti NON miei e NON system
  - Confronta `latest_response.created_at > localStorage[fammy_task_lastread_<id>]`
  - Sottoscrive realtime → ricalcola al volo
  - Esporta `markTaskRead(taskId)` per resettare il counter
- ✏️ `TaskDetailModal.jsx`: chiama `markTaskRead(realTaskId)` ogni volta che
  il modal viene aperto → il badge decrementa istantaneamente
- ✏️ `HomeScreen.jsx`: il `bachecaBadge` ora prende `unreadChatsCount` come
  priorità, con fallback ai task da fare se non ci sono unread

#### Feature 2 — Auto-update PWA (risposta alla tua domanda)
**Risposta breve**: NO, la PWA installata NON si aggiorna automaticamente,
e il pull-to-refresh non funziona in modalità standalone. Per fixarlo:

- ✏️ `/app/frontend/public/sw.js`:
  - `CACHE_NAME` versionato (`fammy-v2-2026-06-05`) — bumpa ad ogni release
  - **Fetch network-first per HTML**: prima prova il network, poi cache
    come fallback. Causa #1 di "ho fatto deploy ma l'app sta su vecchio".
    Per asset JS/CSS Vite usa già hash nei nomi quindi cache-first OK.
- ✏️ `/app/frontend/src/components/UpdateBanner.jsx`:
  - Polling `registration.update()` ogni 30s (già c'era)
  - **Nuovo**: check anche su `visibilitychange` quando l'utente torna
    sull'app dopo essere stato fuori → cattura il caso PWA installata
  - Quando il nuovo SW arriva in "waiting", mostra il toast "App aggiornata
    · tocca per ricaricare"

#### File modificati / nuovi
- ➕ `/app/frontend/src/lib/useUnreadTaskCount.js`
- ✏️ `/app/frontend/src/components/TaskDetailModal.jsx` — markTaskRead
- ✏️ `/app/frontend/src/screens/HomeScreen.jsx` — usa hook unread
- ✏️ `/app/frontend/public/sw.js` — bump cache + network-first HTML
- ✏️ `/app/frontend/src/components/UpdateBanner.jsx` — visibility check

#### Testing
- Lint: ✅
- Smoke screenshot: ✅
- ⚠️ **Provalo tu**:
  1. **Badge intelligente**: chiedi a un altro membro di scriverti un
     commento su un task → il numero sulla home tab Bacheca aumenta;
     apri il task → numero scende.
  2. **Auto-update**: dopo il prossimo deploy, riapri la PWA → entro 30s
     o al rientro sull'app, vedrai un toast "App aggiornata" → tap →
     ricarica con la nuova versione.

---


#### Feature 1 — Badge numerici sulle tab (stile WhatsApp)
La bottom navigation ora mostra un pallino rosso 🔴 con numero sopra
l'icona delle tab che hanno "cose da fare":
- 🏠 **Bacheca**: numero task non ancora fatti che mi riguardano
  (assegnati a me o creati da me, escluso status `done`/`paid`)
- 📅 **Agenda**: numero eventi di oggi
- 💶 **Spese**: numero spese non saldate create da altri membri

Badge: 18×18, rosso `#FF3B30`, font-weight 800. Mostra `99+` se >99.
Bordo bianco di 1.5px per stacco visivo.

#### Feature 2 — Anteprima foto inline nei messaggi chat
Quando carichi una foto col 📎 dal composer, prima vedevi solo "📷 ha
condiviso una foto" come testo. Adesso il bubble:
- Cerca l'attachment associato (match per `uploaded_by + created_at`
  entro 10s)
- Lo mostra come **immagine cliccabile** (max 220px, border-radius 12px)
- Apre il lightbox al tap (zoom-in)
- Mantiene timestamp e nome autore sotto

Stile WhatsApp: padding ridotto a 4px sui bubble photo, no caption testo.

#### File modificati
- ✏️ `HomeScreen.jsx` — calcolo dei 3 badge + prop `badge` su `NavBtn`
- ✏️ `TaskDetailModal.jsx` — rendering foto inline nei bubble di tipo
  `'photo'`

#### Testing
- Lint: ✅
- Smoke screenshot: ✅
- ⚠️ **Provalo tu**: 1) sulla home vedrai i numeri rossi sopra le icone se
  hai task/eventi/spese pending; 2) condividi una foto via 📎 nel chat di
  un task → la foto appare ora come bubble immagine.

---


#### Refactor — Da 3 tab a 2 (task) / da 2 a 1 (event)
Risposta alla domanda "ha senso tenere allegati divisi dalla chat?": NO.
Tutte le app moderne (WhatsApp, Slack, Telegram) integrano la condivisione
nella conversazione.

**Task** ora ha solo 2 tab:
- 💬 **Chat** (default)
- 📋 **Dettagli** (include in ordine: status + foto + spese collegate +
  resto dei dettagli)

**Event** ora ha 1 sola "schermata" (niente più tab):
- 📋 Dettagli con foto inline sotto

#### Feature — 📎 Paperclip nel composer chat (solo task)
Nel composer del thread c'è un nuovo bottone 📎 a sinistra del campo testo:
- Click → file picker (camera/galleria) → upload immediato in
  `task-attachments` + INSERT in `task_attachments` (popolando
  `uploaded_by`)
- Crea anche un `task_response` di tipo `'photo'` con testo
  `"📷 ha condiviso una foto"` per dare visibilità nella chat (apparirà
  come messaggio sistema)
- Manda push agli altri membri "📷 Marco ha condiviso una foto · <task title>"
- La foto è poi visibile nella sezione "Foto" della tab Dettagli (stessa
  galleria PhotoGalleryEditor)

#### File modificati
- ✏️ `TaskDetailModal.jsx` — solo 2 tab; sezioni Foto/Spese spostate
  dentro Dettagli; 📎 inline nel composer chat
- ✏️ `EventDetailModal.jsx` — rimossa tab Foto, galleria sotto i dettagli
- ✏️ `i18n.jsx` — `td_attach_photo`, `td_chat_photo_shared` × IT/EN

#### Testing
- Lint: ✅
- Smoke screenshot: ✅
- ⚠️ **Provalo tu**: apri un task → vedi subito Chat (default). Tap 📎 →
  scegli una foto → la foto si carica + appare un messaggio "📷 ha
  condiviso una foto" nel thread + è visibile anche nella tab Dettagli
  in "Foto".

---


#### Bug fix — ✕ delete non appariva mai
Prima il bottone ✕ era condizionato a `att.uploaded_by === me.id` ma:
1. `AddTaskModal` non popolava mai `uploaded_by` all'INSERT → tutte le
   foto avevano `uploaded_by: null` → condizione sempre falsa → ✕ invisibile.
2. La logica "solo l'autore può cancellare" non aveva senso per gli eventi
   (event_attachments non ha uploaded_by).

**Fix**: rimosso il check client-side. La ✕ è SEMPRE visibile, le RLS
Supabase gestiscono i permessi finali (chi non è membro della famiglia
non riesce comunque a fare il DELETE).

#### Feature — PhotoGalleryEditor
Nuovo componente compatto e riutilizzabile `PhotoGalleryEditor.jsx`:
- **Empty state amichevole**: card grande tratteggiata "📷 Aggiungi la
  prima foto" (CTA centrale) invece del freddo "Nessuna foto allegata".
- **Bottone "+ Aggiungi"** nel header, sempre visibile se ci sono già foto
  → apre file picker multi-select (puoi caricare più foto in una volta).
- **Griglia 3-col responsive** (auto-fill 96px) invece di 80px → più
  vedibili.
- **✕ overlay** ben visibile (rgba 0.7, 24×24, bordo arrotondato).
- **Upload inline** con storage path corretto:
  - task: bucket `task-attachments`, tabella `task_attachments`,
    folder `tasks/<id>/`, popola `uploaded_by`
  - event: bucket `event-attachments`, tabella `event_attachments`,
    folder `events/<id>/`
- **Error inline** se Storage/DB falliscono.

Sostituito il vecchio rendering ad hoc in `TaskDetailModal` e
`EventDetailModal`.

#### File modificati / nuovi
- ➕ `/app/frontend/src/components/PhotoGalleryEditor.jsx` (190 righe)
- ✏️ `/app/frontend/src/components/TaskDetailModal.jsx` — usa nuovo componente
- ✏️ `/app/frontend/src/components/EventDetailModal.jsx` — usa nuovo componente
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 4 nuove key (`td_add_photo`,
  `td_add_first_photo`, `td_add_photo_hint`, `td_uploading`) × IT/EN

#### Testing
- Lint: ✅
- Smoke screenshot: ✅
- ⚠️ **Provalo tu**: apri il task con la foto del laptop → tab "Allegati" →
  vedrai la foto con ✕ in alto a destra (tap per rimuovere) + bottone
  "+ Aggiungi" in alto a destra per caricarne altre.

---


#### Feature 1 — Rimuovi foto da task / event detail
Prima, una volta allegata una foto, non c'era modo di rimuoverla → restava
per sempre in Family Memories. Fix:

- **TaskDetailModal**: aggiunto pulsante ✕ in overlay top-right su ogni
  thumbnail. **Visibile solo se** `att.uploaded_by === me.id` (puoi
  rimuovere solo le foto che hai caricato tu).
- **EventDetailModal**: stesso pulsante. NB: `event_attachments` non ha
  `uploaded_by`, quindi consentiamo a chiunque della famiglia (le RLS
  finali sono gestite da Supabase).

Operazione: storage `remove([file_path])` + DB `DELETE`. Best effort —
se lo storage fallisce, il record DB viene comunque cancellato.

#### Feature 2 — Tab Chat di default sui task
Prima all'apertura di un task vedevi "Dettagli" (informazioni che hai già
visto sulla card). Ora la tab di default è **"Chat"** — più diretto per
leggere/scrivere commenti.

Sugli **eventi** la chat non esiste ancora (no `event_responses`), quindi
il default rimane "Dettagli".

#### File modificati
- ✏️ `/app/frontend/src/components/TaskDetailModal.jsx` — default tab
  `'thread'` + bottone ✕ delete su thumbnail
- ✏️ `/app/frontend/src/components/EventDetailModal.jsx` — bottone ✕ delete
- ✏️ `/app/frontend/src/lib/i18n.jsx` — `td_remove_photo`,
  `td_remove_photo_confirm` × IT/EN

#### Testing
- Lint: ✅
- Smoke screenshot: ✅
- ⚠️ **Provalo tu**: apri un task con foto allegata → vai tab "Allegati" → tap ✕
  in alto a destra sulla thumbnail → conferma → foto via. Poi apri qualsiasi
  task → ora si apre direttamente in "Chat" invece che "Dettagli".

---


#### Bug fix 1 — La ✕ rossa appariva su Owner
Prima la condizione era `!isMe` → un normale membro vedeva la ✕ accanto al
proprietario della famiglia e poteva cancellarlo. Fix: nuova funzione
`canRemoveMember(member, family)` con permessi corretti:
- **Owner** può rimuovere chiunque tranne se stesso
- **Non-owner** può rimuovere SOLO placeholder o SE STESSO
- **Nessuno** può rimuovere l'owner direttamente (deve passare ownership)

#### Bug fix 2 — Non potevi uscire dalla famiglia
Prima `removeMember` mostrava `alert('Non puoi rimuovere te stesso')` →
non c'era modo di lasciare una famiglia. Fix: il pulsante per ME stesso
ora è `🚪 Esci` invece di ✕. Conferma → DELETE del proprio member row +
soft reload.

Se sei OWNER e provi a uscire → messaggio: "Cedi prima la proprietà o
elimina la famiglia da Modifica famiglia."

#### Estetica
- Rimossi i grossi badge OWNER/MEMBER laterali rossi (rumorosi)
- Aggiunto un chip piccolo "👑 Owner" inline accanto al nome del proprietario
- Aggiunto un chip "Tu" verde inline per identificare l'utente loggato
- "(tu)" → sostituito col chip più moderno
- Nascosto "· Account associato" (era ridondante): mostriamo SOLO il caso
  "· Profilo da collegare" in arancione per i placeholder

#### File modificati
- ✏️ `/app/frontend/src/screens/tabs/FamilyTab.jsx` — logica permessi +
  remove flow + refactor MemberCard
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 7 nuove key × IT/EN
  (`fam_leave_btn`, `fam_leave_btn_short`, `fam_leave_confirm`,
  `fam_remove_confirm`, `fam_owner_cant_leave`, `you_chip`)

#### Testing
- Lint: ✅
- Smoke screenshot: ✅
- ⚠️ **Provalo tu**: 1) come membro NON owner, ora vedi 🚪 Esci accanto al
  tuo nome e ✕ NON appare più su Owner; 2) tap 🚪 Esci → conferma →
  esci dalla famiglia.

---


#### Bug fix — Il tap su "Sono Jenna" partiva accept SUBITO
Negli inviti GENERICI con placeholder, dopo il login l'utente vedeva la
lista "Sono Jenna / Sono Mario / Nessuno di questi". Toccando "Sono
Jenna" partiva immediatamente `accept_invitation` senza una conferma
esplicita: rischio di prendere l'identità sbagliata con un tap accidentale.

**Fix**: aggiunto state `pendingClaim` + nuova schermata intermedia.
Flow ora:
1. Lista placeholder → tap su "Sono Jenna"
2. Schermata "Sei tu Jenna?" con:
   - Card preview del profilo che stai per "indossare" (avatar+nome+ruolo)
   - Riepilogo dell'account con cui sei loggato (email/telefono)
   - ✅ "Sì, sono Jenna" → procede con accept
   - ← "Torna indietro" → ritorna alla lista (non logout)
3. Solo dopo "Sì" parte l'`accept_invitation`.

Stessa identica schermata già esistente per inviti dedicati — coerenza UX.

#### File modificati
- ✏️ `/app/frontend/src/screens/InviteAcceptScreen.jsx` — state `pendingClaim`
  + nuova schermata conferma + cambio `onClick` su card placeholder
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 1 nuova key `invite_confirm_back`
  × IT/EN (FR/DE fallback)

#### Testing
- Lint: ✅
- Smoke screenshot: ✅
- ⚠️ Test end-to-end → **provalo tu**: crea membro "Jenna" → genera invito
  generico → apri link → loggati → tap "Sono Jenna" → DEVE apparire
  schermata conferma con preview + email.

---


#### Bug fix — Inviti dedicati saltavano la conferma
Quando creavi un invito dedicato per un membro specifico (es. "Jenna"),
chi cliccava il link e si loggava veniva aggiunto **automaticamente alla
famiglia col profilo di Jenna**, senza alcuna conferma. Rischio: mio
fratello loggato col suo account Google prendeva l'identità di Jenna.

**Fix**: aggiunto uno **state `confirmedDedicated`** e una schermata
intermedia DOPO il login MA PRIMA dell'`accept_invitation`:
- Mostra "👨‍👩‍👧 Phillpott · Sei tu Jenna?"
- Spiega "Questo invito è stato creato per Jenna nella famiglia
  'Phillpott'. Conferma solo se sei davvero tu..."
- Mostra l'email/telefono con cui sei loggato per facile verifica
- 2 bottoni:
  - ✅ "Sì, sono Jenna" → procede con `accept_invitation`
  - ❌ "No, non sono io (esci e usa un altro account)" → `signOut()` +
    redirect a `/`

Solo dopo il click su "Sì, sono Jenna" parte il `RPC accept_invitation`.

Inoltre traduzione dei testi della schermata claim placeholder (prima
hardcoded in italiano) → key i18n:
- `invite_claim_h`, `invite_claim_p`, `invite_claim_iam`,
  `invite_claim_pending`, `invite_claim_none`.

#### File modificati
- ✏️ `/app/frontend/src/screens/InviteAcceptScreen.jsx` — nuovo state +
  schermata conferma + i18n delle stringhe claim
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 11 nuove key × IT/EN (FR/DE
  fallback a EN)

#### Testing
- Lint: ✅
- Smoke screenshot: ✅
- ⚠️ Test end-to-end richiede 2 utenti → **provalo tu**: 1) crea un membro
  "Jenna", 2) genera il suo invito dedicato, 3) apri il link in incognito
  e loggati col tuo account Google — DEVI vedere "Sei tu Jenna?" con
  bottoni Sì/No.

---


#### Feature 1 — Deep-link PWA (manifest)
Aggiornato `/app/frontend/public/manifest.json` con:
- `"handle_links": "preferred"` → su Android Chrome, quando l'utente clicca
  un link a `farxer.com/invite/<token>` (o qualsiasi URL dentro lo scope),
  il sistema apre direttamente la PWA installata invece del browser.
- `"launch_handler": { "client_mode": ["focus-existing", "auto"] }` → se
  l'app è già aperta in background, la riporta in foreground invece di
  aprire una nuova tab.
- `"id": "/?source=pwa"` e `"start_url": "/?source=pwa"` per identità PWA
  stabile (richiesto da Chrome per il deep-linking).
- `"display_override": ["window-controls-overlay", "standalone"]` per
  l'esperienza più "app-like" possibile.

⚠️ iOS NON supporta `handle_links` (limite Safari). Su iPhone i link
continueranno ad aprirsi in Safari, ma se l'utente apre Safari → il PWA
gli verrà proposto di installare.

#### Feature 2 — Re-subscribe automatico + endpoint stale fix
La causa principale di "le push arrivano solo se apro l'app" è che
l'endpoint Web Push può scadere/ruotare (succede dopo update OS,
pulizia cache, eccetera) e il DB ha quello vecchio. Fix:

- ✏️ `/app/frontend/src/lib/usePushSubscription.js`:
  1. Al register: se la subscription ha `expirationTime` passato, la
     `.unsubscribe()` e ne crea una nuova.
  2. Aggiorna `last_used_at` ad ogni open → la diagnostica push è più
     accurata.
  3. Listener `visibilitychange`: a ogni rientro nell'app (foreground)
     ri-chiama `register()` per validare subscription.
  4. Listener `serviceWorker.message` per il nuovo evento
     `PUSH_SUB_CHANGED` (vedi sotto).

- ✏️ `/app/frontend/public/sw.js`:
  Aggiunto handler `pushsubscriptionchange` (Chrome/Firefox lo emettono
  quando l'endpoint cambia). Il SW si re-sottoscrive con la stessa
  `applicationServerKey` e notifica i client aperti via postMessage
  `PUSH_SUB_CHANGED` → il client fa l'upsert nel DB.

#### Feature 3 — Card troubleshooting "Le push non arrivano?"
Nella `PushDiagnosticCard` del Profilo c'è un nuovo link
🤔 "Le notifiche non arrivano in background?" che apre un pannello con:
- (Android) Ottimizzazione batteria + Attività in background
- (iOS) App da installare via Home + Focus Mode
- (universale) Permesso notifiche + suggerimento di riaprire ogni tanto
- Un test "vero": chiudi app → chiedi a un familiare di scrivere un
  commento → la push dovrebbe arrivare

#### File modificati / nuovi
- ✏️ `/app/frontend/public/manifest.json` — deep-link + launch_handler
- ✏️ `/app/frontend/public/sw.js` — pushsubscriptionchange handler
- ✏️ `/app/frontend/src/lib/usePushSubscription.js` — re-subscribe + listener
- ✏️ `/app/frontend/src/screens/tabs/ProfileTab.jsx` — `BackgroundPushHelp`
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 17 nuove key (IT + EN, FR/DE fanno fallback)

#### Testing
- Lint: ✅ (ignorate prompt injection in linter output)
- Smoke screenshot: ✅
- ⚠️ Test "vero" delle push richiede 2 device PWA installati →
  **provalo tu**: chiudi l'app sul telefono A, chiedi a chi è su device
  B di commentare un task, la push dovrebbe arrivare su A.

---


#### Bug fix 1 — InviteAcceptScreen ancora con magic-link email
La pagina `/invite/<token>` mostrava ancora il form magic-link via email
("Email logins are disabled" se Supabase ha disabilitato gli email login).
**Fix**: ho riscritto `InviteAcceptScreen.jsx` per usare solo:
- Pulsante "Continua con Google" (OAuth, redirect torna a `/invite/<token>`)
- Pulsante "Continua con il telefono" (`PhoneLoginModal`)

Rimossi: campo nome, campo email, magic-link OTP, stato `sent`.

#### Bug fix 2 — Testi invito menzionavano "Google/Apple"
Aggiornate tutte e 4 le lingue: `invite_code_hint`, `invite_msg_open`,
`invite_warn_dup_b` ora dicono "Google o telefono" invece di
"Google/Apple". Così il messaggio WhatsApp non confonde più nessuno.

#### Feature — Elimina membro creato per sbaglio
Aggiunto in fondo a `EditMemberModal` un bottone `🗑️ Elimina questo membro`
con popup di conferma rosso. Visibile **solo se** il membro non ha
`user_id` collegato (= placeholder/creato per sbaglio), per evitare che
un admin rimuova accidentalmente un membro reale con account.

#### File modificati / nuovi
- ✏️ `/app/frontend/src/screens/InviteAcceptScreen.jsx` — refactor login
- ✏️ `/app/frontend/src/components/EditMemberModal.jsx` — pulsante delete + popup
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 6 nuove key × 4 lingue + edit di 3 esistenti

#### Testing
- Lint: ✅ (ignorata prompt injection nell'output del linter)
- Smoke screenshot login: ✅ solo Google + telefono visibili
- ⚠️ Test end-to-end del flow invito richiede 2 utenti reali → test manuale

---


#### Feature — "Proteggi il tuo account" (link Google come backup)
Soluzione concordata con l'utente (modalità "C"): per chi si è loggato con
SOLO telefono, mostriamo UNA volta un soft modal che invita a collegare un
account Google come backup, usando l'**identity linking** di Supabase.

**Perché Google (e non magic-link email)?**
L'utente non vuole un magic-link via email per evitare il rischio di
account doppi. Con `supabase.auth.linkIdentity({provider:'google'})` Google
viene attaccato all'identity esistente del numero → **stesso `user_id`**,
zero migrazioni dati, zero doppioni.

**Trigger**:
- `shouldShowBackupGoogle(session)` controlla che l'utente abbia
  esattamente UNA identity di tipo `'phone'` (nessuna `google` né `email`)
- E che NON abbia già cliccato "Più tardi" (flag in localStorage per uid)
- Mostrato 1.5s dopo aver caricato session + families (per non saltare in
  faccia all'utente sulla home)
- Se l'utente clicca "Più tardi" → flag `fammy_backup_google_dismissed_<uid>=1`
  → **non viene MAI più mostrato**

#### File modificati / nuovi
- ➕ `/app/frontend/src/components/BackupGoogleModal.jsx`
  - Modale con titolo "🔐 Proteggi il tuo account"
  - 3 bullet di benefici (no doppi account / recovery / famiglie intatte)
  - Bottone "Collega Google come backup" → `linkIdentity('google')`
  - Bottone "Più tardi (non lo mostriamo più)"
  - Export di `shouldShowBackupGoogle()` come pure-function di check
- ✏️ `/app/frontend/src/App.jsx` — useEffect che decide se montare il modale +
  rendering condizionale
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 10 nuove key × 4 lingue:
  `bk_h`, `bk_p_intro`, `bk_b1`, `bk_b2`, `bk_b3`, `bk_link_btn`,
  `bk_linking`, `bk_skip`, `bk_link_cancelled`

#### ⚠️ AZIONE UTENTE (Supabase Dashboard)
Assicurati che su **Auth → Settings** sia abilitata l'opzione **"Allow
manual linking"** (o `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true`). Senza
questo flag, `linkIdentity()` torna errore.
👉 https://supabase.com/dashboard/project/_/settings/auth → Manual Linking

#### Testing
- Lint: ✅
- Smoke screenshot: ✅
- Test end-to-end richiede login telefono reale → test manuale dell'utente

---


#### Bug fix — Hint "senza prefisso 0 iniziale" mostrato anche per paesi non-IT
Il vecchio testo era specifico per Italia. Adesso:
- `+39` → "Esempio: 333 1234567 (senza prefisso 0 iniziale)."
- `+44` → "Esempio: 7700 900123 (senza 0 iniziale)." (anche UK ha leading 0)
- `+1` → "Esempio: 555 123 4567 (10 cifre)."
- altri → "Inserisci il numero senza il prefisso internazionale." (generico)

Helper `hintForCountry(code, t)` in PhoneLoginModal.

#### Feature — "Hai cambiato numero?" (recovery)
Sotto al bottone "Invia codice SMS" c'è un link sottile "🤔 Hai perso
l'accesso al tuo numero?" che apre un pannello informativo:
- Se l'utente aveva collegato Google → "Accedi con Google e aggiorna il
  numero dal Profilo" (flow già esistente in `ProfilePhoneCard`)
- Se solo telefono → email support `fammyapp@gmail.com`

#### File modificati / nuovi
- ✏️ `/app/frontend/src/components/PhoneLoginModal.jsx` — hint condizionale
  + componente `PhoneRecoveryHint` interno
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 7 nuove key × 4 lingue:
  `phone_hint_generic`, `phone_hint_it`, `phone_hint_uk`, `phone_hint_us`,
  `phone_recovery_h`, `phone_recovery_p`, `phone_recovery_link`

#### Testing
- Lint: ✅
- **Interactive Playwright**: ✅ paese cambiato ad Australia → hint diventa
  generico ("Enter the number without the international prefix.");
  recovery toggle funziona

---


#### Feature 1 — Auto-detect del paese
- ➕ `/app/frontend/src/lib/detectCountry.js`: utility `detectCountryCode()`
  che restituisce il prefisso E.164 più probabile.
- Strategia (zero network):
  1. `Intl.DateTimeFormat().resolvedOptions().timeZone` → ISO-2 via mappa
     (60+ timezone coperti: Europe/Rome→IT, Australia/Sydney→AU, ecc.)
  2. Fallback: `navigator.language.split('-')[1]` (es. "en-AU" → AU)
  3. Default: IT
- Normalizzazione `GB→UK`, `CA→US/CA` per matchare la lista `COUNTRY_CODES`.
- Applicato come default in `PhoneLoginModal` e `ProfilePhoneCard`.

#### Feature 2 — Search-bar nella select prefissi
- ➕ `/app/frontend/src/components/CountryCodeSelect.jsx`: sostituisce il
  `<select>` nativo con un trigger-pill cliccabile + popover.
- Popover contiene:
  - Input search con icona 🔍 e bottone ✕ clear
  - Lista risultati filtrata in tempo reale (multi-token, case-insensitive,
    accent-stripping)
  - Match su `name`, `label`, `code` — es. "aus" / "AU" / "+61" trovano
    tutti Australia
  - Item evidenziato + ✓ se è quello selezionato
  - Stato "Nessun paese trovato per '{q}'" se la search non matcha nulla
- Click esterno chiude. Focus automatico sulla search all'apertura.
- Sostituito il `<select>` sia in `PhoneLoginModal` che in `ProfilePhoneCard`.

#### File modificati / nuovi
- ➕ `/app/frontend/src/lib/detectCountry.js`
- ➕ `/app/frontend/src/components/CountryCodeSelect.jsx`
- ✏️ `/app/frontend/src/components/PhoneLoginModal.jsx`
- ✏️ `/app/frontend/src/components/ProfilePhoneCard.jsx`
- ✏️ `/app/frontend/src/lib/i18n.jsx` — `cc_search_ph`, `cc_no_results` × 4 lingue

#### Testing
- Lint: ✅ tutti file
- Smoke + interactive test Playwright: ✅ digitato "aus" → mostra solo
  🇦🇺 Australia (+61)

---


#### Modifica — Tolto pulsante "Continua con Apple"
Su richiesta dell'utente. Modifiche:
- ✏️ `/app/frontend/src/screens/LoginScreen.jsx` — rimosso bottone Apple +
  funzione `AppleIcon()` (non più referenziata). Mantenuti Google + telefono.
- i18n key `login_with_apple` rimangono nel file (innocue, ignorate).

#### Feature — Prefissi internazionali completi
Prima erano solo 11 paesi hard-coded. Adesso 70+ paesi (tutta UE + tutti
i mercati principali extra-UE: Australia, Brasile, India, Cina, USA,
Argentina, Messico, Sudafrica, Israele, Giappone, Corea, ecc.).

- ➕ `/app/frontend/src/lib/countryCodes.js` — lista condivisa centralizzata
  con `{code, flag, label, name}` per ogni paese. Ordinata top-7 più usati
  poi UE alfabetico poi resto del mondo.
- ✏️ `/app/frontend/src/components/PhoneLoginModal.jsx` — usa la lista
  condivisa; option ora mostra `🇦🇺 Australia (+61)` invece di `🇦🇺 +61`.
- ✏️ `/app/frontend/src/components/ProfilePhoneCard.jsx` — stesso refactor.

#### Testing
- Lint: ✅ tutti file
- Smoke screenshot landing: ✅ (mostra solo Google + telefono, niente Apple)

---

### Fix follow-up — Family Memories Card tradotta
Aggiunte 8 nuove key i18n × 4 lingue per la card "Ricordi di famiglia":
`fm_header`, `fm_all_chip`, `fm_loading`, `fm_empty_h`, `fm_empty_in`,
`fm_empty_p`, `fm_more_fmt`, `fm_kind_task`, `fm_kind_event`.

Inoltre il `monthName` ora rispetta la lingua corrente (toLocaleDateString
con locale dinamico it/en/fr/de), non più hardcoded `it-IT`.

File modificato: `/app/frontend/src/components/FamilyMemoriesCard.jsx`

### Feature — Profilo user-friendly con sezioni collassabili
**Problema**: il Profilo aveva 13 sezioni piatte una sotto l'altra → scroll
infinito, l'utente si perdeva tra "Avatar / Nome / Compleanno / Email /
Telefono / Lingua / Memorie / Insights / Notifiche / Settings / Referral
/ Strumenti / Tour / Logout". Inoltre molti testi non erano tradotti
(test push, quiet hours, "Ho un codice invito").

**Fix**:
- **Header sempre visibile**: avatar grande + nome + email/telefono +
  pulsante 🎨 cambio colore (color picker inline).
- **8 gruppi collassabili** (`ProfileGroup`) con icona, titolo e sottotitolo
  esplicativo:
  1. 👤 I miei dati — nome, compleanno, email, telefono
  2. 🔔 Notifiche — stato permessi, toggle, test push, diagnostica push,
     "Non disturbare" notturno
  3. ✨ Insights AI — riepilogo settimanale + sync calendario
  4. 📸 Family Memories — galleria mensile auto
  5. ⚙️ App & lingua — lingua, piani, tema, accessibilità, privacy
  6. 🛠️ Strumenti smart — importa assenze da foto, unisci account
  7. 💝 Invita un amico — referral + stats invitati
  8. 🎓 Tour & aiuto — rivedi il tour
- **Stato apertura persistito** in `localStorage` (per gruppo).
- **Tutti chiusi di default** tranne l'header: schermata pulita, l'utente
  apre solo ciò che gli interessa.

### Fix — Traduzioni mancanti
Aggiunte 30+ key i18n × 4 lingue (IT/EN/FR/DE):
- `test_push_btn`, `test_push_ok`, `test_push_no_subs`, `test_push_unavailable`,
  `test_push_not_deployed` (TestPushButton — prima hardcoded IT)
- `quiet_h_title`, `quiet_h_sub`, `quiet_h_active_fmt`, `quiet_h_from`,
  `quiet_h_to` (QuietHoursControl — prima hardcoded IT)
- `push_diag_h`, `push_diag_empty_h`, `push_diag_empty_p`, `push_diag_count_one`,
  `push_diag_count_many`, `push_diag_last_used`, `push_diag_ios_hint`
  (PushDiagnosticCard — prima hardcoded IT)
- `have_invite_code`, `welcome_card_invite_t`, `welcome_card_invite_s`
  (FamilyTab + WelcomeScreen — prima hardcoded IT)
- `profile_card_*` × 8 gruppi (titoli e sottotitoli dei nuovi ProfileGroup)

### File modificati / nuovi
- ✏️ `/app/frontend/src/screens/tabs/ProfileTab.jsx` — refactor completo del
  return + nuovo componente `ProfileGroup` + applicate t() a TestPushButton,
  PushDiagnosticCard
- ✏️ `/app/frontend/src/components/QuietHoursControl.jsx` — applicate t()
- ✏️ `/app/frontend/src/screens/tabs/FamilyTab.jsx` — t() per "Ho un codice invito"
- ✏️ `/app/frontend/src/screens/WelcomeScreen.jsx` — t() per card invite
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 30+ key × 4 lingue

### Testing
- Lint: ✅ tutti i file
- Smoke screenshot: ✅ landing page funziona

---

## Iterazione 16.2 (4 giugno 2026, sera) — Sticker Reactions sui commenti

### Feature — Reazioni emoji ai messaggi (stile WhatsApp)
I ragazzi della famiglia (e gli adulti pigri 😄) ora possono reagire a un
commento di task con 6 emoji: **❤️ 👍 🎉 😂 😮 🙏**, senza dover
scrivere "ok" ogni volta.

### Schema DB (`fammy-reactions.sql`)
- Colonna `task_responses.reactions jsonb NOT NULL DEFAULT '{}'`
- Formato: `{ "❤️": ["<member_id1>", "<member_id2>"], "👍": [...] }`
- Indice GIN su `reactions` per query veloci.
- RPC `toggle_reaction(p_response_id, p_emoji, p_member_id)` SECURITY DEFINER:
  - Verifica `auth.uid()` = proprietario di `p_member_id` (no impersonation)
  - Verifica che l'utente sia membro della famiglia del task
  - Toggle atomico: rimuove la reaction se già presente, altrimenti aggiunge
  - Ritorna il nuovo `reactions` JSON
- `alter publication supabase_realtime add table task_responses` (idempotente)
  per ricevere gli UPDATE realtime.

### Frontend
- ➕ `/app/frontend/src/components/MessageReactions.jsx`:
  - Picker overlay 6 emoji (pop animation 180ms)
  - Icona 😊 "uncontrolled" sempre visibile a fianco del bubble
  - Modalità "controlled" via prop `pickerOpen` per supportare long-press
  - Bollini sotto il bubble con count + tooltip nomi reactor + outline
    diverso se contiene il mio member_id
  - Optimistic update con rollback su errore RPC
  - Push notifica all'autore del commento via `sendPush()`:
    `"❤️ Marco ha reagito" / <task_title>\n"<message preview>"`
- ✏️ `/app/frontend/src/components/TaskDetailModal.jsx`:
  - `long-press` 500ms su bubble → apre picker
  - `onContextMenu` (right-click desktop) → apre picker
  - Wrapper `<MessageReactions>` per ogni bubble non-system
  - Sottoscrizione realtime estesa a `UPDATE` su `task_responses` (per
    sincronizzare reactions degli altri utenti)
- ✏️ `/app/frontend/src/styles.css` — `@keyframes reactionPop`

### ⚠️ AZIONE UTENTE
Esegui `/app/frontend/fammy-reactions.sql` su Supabase SQL Editor → Run.
Senza la migration, l'RPC `toggle_reaction` non esiste e le reactions
non funzionano.

### Testing
- Lint: ✅ tutti file
- Smoke screenshot: ✅
- Test end-to-end richiede login Google e 2 utenti per la push → test manuale

---

## Iterazione 16.1 (4 giugno 2026, ore dopo) — Forza scelta assegnatari su Task & Event

### Bug fix — Incarico/Evento creato senza assegnatari
**Root cause**:
- In `AddTaskModal` non c'era nessuna validazione: l'utente poteva creare un
  incarico SENZA scegliere nessuno → finiva nel limbo (status 'todo' senza
  assegnatari) e nessuno si sentiva responsabile.
- In `AddEventModal` la validazione esisteva ma mostrava solo un piccolo
  errore `setErr` in fondo alla modale, spesso fuori dallo scroll → l'utente
  non capiva perché il submit "non funzionasse".

**Fix**: validazione bloccante in entrambe le modali (solo in creazione,
non in modifica). Quando l'utente prova a salvare senza aver scelto
`"Solo a me"` né alcun assegnatario:
1. **Popup bloccante** che spiega in modo chiaro perché serve scegliere
   ("Per evitare che un incarico finisca dimenticato, scegli sempre a chi
   è destinato...") + bottone "Capito, seleziono ora"
2. **Auto-scroll** del modale fino alla sezione assegnatari
3. **Flash visivo rosso** (outline + sfondo rosa) sulla sezione assegnatari
   per 1.8s — impossibile da non notare

### File modificati
- ✏️ `/app/frontend/src/components/AddTaskModal.jsx` — validazione + alert + ref + flash
- ✏️ `/app/frontend/src/components/AddEventModal.jsx` — upgrade da `setErr` a popup + ref + flash
- ✏️ `/app/frontend/src/lib/i18n.jsx` — 5 nuove key × 4 lingue (`assign_required_*`)

### Testing
- Lint: ✅
- Smoke test screenshot: ✅
- Verifica end-to-end richiede login Google → test manuale dell'utente:
  1. Apri "Nuovo incarico", scrivi titolo, NON selezionare nessuno → tap Aggiungi
  2. Devi vedere popup "👥 A chi assegni…" + scroll a sezione assegnatari evidenziata in rosso
  3. Stessa cosa per "Nuovo evento"

---

# FAMMY — Family Organization App (Iterazione 16)

## Iterazione 16 (4 giugno 2026) — Push commenti + Badge rosso + Diagnostica push

### Bug fix #1 — Notifiche push per nuovi commenti su task
**Root cause**: in `TaskDetailModal.addComment()` veniva fatto solo l'INSERT in
`task_responses`. Nessun trigger DB e nessuna chiamata frontend a `send-push`,
quindi gli altri membri non ricevevano NIENTE (né con app chiusa né con app
aperta su un altro device).

**Fix**:
- Nuovo helper `/app/frontend/src/lib/pushClient.js` con `sendPush()` e
  `memberIdsToUserIds()` (risolve member_id → user_id batch).
- `addComment()` ora, dopo l'INSERT del commento, calcola la lista di
  destinatari (autore originale del task + assegnatari attuali +
  `delegated_from`) e chiama `send-push` con un payload tipo
  `💬 <NomeAutore> ha scritto · "<title>" · "<preview>"` + `tag:
  task-comment-<id>` + `data: { task_id }`.
- Best-effort: i fallimenti sono silenti, l'app non si rompe se
  l'edge function è giù.

### Bug fix #2 — Manca il "numerino rosso" (App Badge) sull'icona
**Root cause**: il Service Worker mostrava la notifica via
`registration.showNotification(...)` ma non chiamava mai la Badging API.

**Fix**:
- `/app/frontend/public/sw.js`:
  - Nel `push` handler, dopo `showNotification`, chiamo
    `navigator.setAppBadge(count)` con il count delle notifiche
    FAMMY ancora visibili.
  - Nel `notificationclick` handler, chiamo `clearAppBadge()` (con
    fallback su `setAppBadge(0)`) per pulire il badge appena l'utente
    apre.
  - Nel `message` handler, supporto un messaggio `CLEAR_BADGE` dal client.
- `/app/frontend/src/lib/useAppBadge.js`: nuovo hook
  `useAppBadgeClear()` che pulisce il badge quando l'app diventa
  visibile (`visibilitychange` + `focus`).
- `/app/frontend/src/App.jsx`: monto `useAppBadgeClear()`.
- ⚠️ iOS: la Badging API funziona SOLO se FAMMY è installata come PWA
  (Aggiungi a Home, iOS 16.4+).

### Feature — Diagnostica push nel Profilo
**Perché**: l'utente ha segnalato che "Silvia" non riceve il digest serale
delle 21:00. Spesso il motivo è che il device di Silvia non ha mai
registrato una `push_subscription` (Safari iOS senza PWA, permessi
negati, ecc.).

**Fix**: nuova card `PushDiagnosticCard` in ProfileTab → Notifiche, accanto
al bottone "Invia notifica di test". Mostra:
- ✅ numero di dispositivi registrati per ricevere push (per quell'utente)
- l'elenco con tipo device (📱 iPhone / 💻 Mac / …) + ultima volta usata
- un hint giallo specifico per Safari iOS non-standalone:
  "Aggiungi FAMMY alla Home per ricevere le push"
- pulsante ↻ refresh manuale

### File modificati / nuovi
- ➕ `/app/frontend/src/lib/pushClient.js` — helper `sendPush()` + `memberIdsToUserIds()`
- ➕ `/app/frontend/src/lib/useAppBadge.js` — hook + utility `clearBadge()`
- ✏️ `/app/frontend/src/components/TaskDetailModal.jsx` — `addComment()` ora dispatcha push
- ✏️ `/app/frontend/public/sw.js` — Badging API in `push`/`notificationclick`/`message`
- ✏️ `/app/frontend/src/App.jsx` — monta `useAppBadgeClear`
- ✏️ `/app/frontend/src/screens/tabs/ProfileTab.jsx` — `PushDiagnosticCard`

### Testing
- Lint: tutti i file ✅
- Smoke test screenshot: landing rende correttamente ✅
- Test end-to-end richiede:
  1. Edge Function `send-push` già deployata su Supabase ✅ (l'utente l'ha già fatto)
  2. `fammy_private.config` con `service_role_key` impostato ⚠️ — l'utente
     deve verificare di aver eseguito l'INSERT finale del file
     `fammy-push-notifications.sql` (vedi commento riga 134-139)
  3. Almeno 2 utenti con FAMMY installato come PWA e permessi notifica concessi

---

# FAMMY — Family Organization App (Iterazione 15)

## Iterazione 15.1 (23 maggio 2026, sera) — UX Agenda + Tab Famiglia

### Bottone Export in alto a destra in Agenda
Spostato l'export del calendario in un pulsante **📥 Esporta** in alto a destra,
in linea con il `FamilySwitcher`. Apre l'esistente `ExportSheet` (bottom-sheet)
che permette di:
- Scegliere quali famiglie includere (chip toggle, solo in modalità "Tutte")
- Esportare con **📲 Aggiungi a iPhone** (download .ics + toast informativo)
- Esportare con **📅 Aggiungi a Google Calendar** (download .ics + apre Google Calendar Import in nuova tab)

### Legenda calendario — aggiunta "✈️ Assenze" con colore viola
La legenda mini sotto il calendario mostrava solo `● Eventi · ● Incarichi` ma
i pallini viola delle assenze (#7C3AED) erano già renderizzati senza legenda.
Aggiunta la voce `● ✈️ Assenze` con `flex-wrap` per piccoli schermi.

### Filtro "👤 Solo a me" nel tab Famiglia (vista Tutte)
Toggle accanto al titolo "Famiglie" che, quando attivo, mostra:
- Solo le famiglie in cui ho una membership
- Espandendo una famiglia, solo la MIA `MemberCard` (non gli altri membri)
- Counter totale conservato + chip indicativo `· 👤 solo io` accanto al count

Utile per chi appartiene a 3+ famiglie e vuole vedere "in che famiglie sono e
con che ruolo/foto" in un colpo d'occhio.

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/AgendaTab.jsx` — header con pulsante Export + mount `ExportSheet` + legenda assenze
- ✏️ `/app/frontend/src/screens/tabs/FamilyTab.jsx` — toggle "Solo a me" + filtro famiglie/membri
- ✏️ `/app/frontend/src/lib/i18n.jsx` — `export_btn_short`, `only_me_chip` × 4 lingue

### Testing
- Lint: ✅
- Smoke test screenshot: ✅
- Verifica funzionale richiede login (Google OAuth) → test manuale dell'utente

---

## Iterazione 15 (23 maggio 2026) — Foto Famiglia/Membro instant refresh + Agenda labels + SQL idempotency

### Bug fix #1 — Foto famiglia mostrata in FamilySwitcher ma NON nella lista "Tutte" del tab Famiglia
**Root cause**: `FamilyTab.jsx` riga 84 renderizzava `<span>{f.emoji}</span>` senza
controllare `f.photo_url`. La foto era salvata correttamente in DB e visibile
nel FamilySwitcher, ma la lista delle famiglie continuava a mostrare l'emoji.

**Fix**: aggiunto rendering condizionale con `f.photo_url` → div 40×40 con
`background-image`, fallback emoji se la foto manca.

### Bug fix #2 — SQL `fammy-photo-permissions.sql` non idempotente
**Root cause**: mancava `drop policy if exists "Family members can update family photo"`
prima del `create policy`, causando `ERROR 42710: policy already exists` se
lo script veniva rieseguito.

**Fix**: aggiunto il `drop policy if exists` mancante.

### Bug fix #3 — Agenda "Oggi" mostra elementi del giorno selezionato
**Root cause**: quando l'utente seleziona un giorno DIVERSO da oggi nel calendario,
i bucket "Oggi/Futuri/Passati" usano `referenceDay = selectedDay` ma le label
restavano statiche ("📍 Oggi"). Risultato: "Oggi" mostrava elementi del 29 mag
mentre today è 23 mag.

**Fix**: nuove label dinamiche:
- `selectedDay && !sameDay(selectedDay, today)` → `📌 {data} / 🗓️ Dopo il {data} / ⏪ Prima del {data}`
- altrimenti → label originali (Oggi/Futuri/Passati)
- Nuove i18n keys `agenda_after_label`, `agenda_before_label` × 4 lingue (IT/EN/FR/DE)

### Feature — Lifting ottimistico dello state per foto famiglia/membro
Anche se il re-fetch da Supabase funziona, lo state lifting istantaneo
elimina ogni latenza percepita post-salvataggio. Flow:

1. `EditFamilyModal.onSaved({...family, photo_url})` → `FamilyTab` → `HomeScreen.onFamilyUpdated` → `App.updateFamilyLocally(updated)` → `setFamilies(prev => prev.map(...))` ✅
2. `EditMemberModal.onSaved(updatedMember)` (ritorna `data[0]` da `.update().select()`) → `FamilyTab` → `HomeScreen.updateMemberLocally(updated)` → `setMembers(prev => prev.map(...))` ✅
3. Dopo lo state lift, viene comunque chiamato `onChanged()` per il refresh completo da DB (eventual consistency).

### File modificati
- ✏️ `/app/frontend/src/screens/tabs/FamilyTab.jsx` — riga 84: foto famiglia + props `onFamilyUpdated/onMemberUpdated` + propagazione `onSaved(updated)`
- ✏️ `/app/frontend/src/screens/tabs/AgendaTab.jsx` — etichette dinamiche bucket
- ✏️ `/app/frontend/src/screens/HomeScreen.jsx` — `updateMemberLocally` + forwarding `onFamilyUpdated`
- ✏️ `/app/frontend/src/App.jsx` — `updateFamilyLocally` + propagazione
- ✏️ `/app/frontend/src/components/EditMemberModal.jsx` — `onSaved(updatedMember)` (da `data[0]`)
- ✏️ `/app/frontend/src/lib/i18n.jsx` — `agenda_after_label`, `agenda_before_label` × 4 lingue
- ✏️ `/app/frontend/fammy-photo-permissions.sql` — `drop policy if exists` mancante

### Testing
- Lint: tutti i file ✅
- Smoke test screenshot: login screen renders correctly ✅
- Verifica funzionale richiede login (Google OAuth) → test manuale dell'utente

---

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
