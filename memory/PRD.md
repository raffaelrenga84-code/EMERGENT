# FAMMY — Family Organization App (Iterazione 1)

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
