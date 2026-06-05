# FAMMY — Family Organization App (Iterazione 16)

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
