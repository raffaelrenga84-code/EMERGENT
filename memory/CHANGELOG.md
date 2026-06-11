# FAMMY — CHANGELOG

> Le voci più recenti in alto. Il PRD completo è in `/app/memory/PRD.md`.

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
