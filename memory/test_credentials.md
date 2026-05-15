# FAMMY Test Credentials

## Auth Provider
**FAMMY uses Supabase Google OAuth ONLY** (no email/password login).

The Supabase project is `jwzoymvtxjzpymaywjtw.supabase.co` (owned by the user).
Logging in requires a real Google account that has joined a family on
this Supabase project. **Automated browser-based login is NOT possible**
because Google blocks OAuth from headless/automated browsers.

## What CAN be tested without auth
- Login screen renders correctly (FAMMY branding, Google + Apple buttons, language switcher)
- Backend AI endpoints (curl-testable, no auth required):
  - `POST /api/ai/chat`
  - `POST /api/ai/weekly-summary`
  - `POST /api/ai/suggest-task`
  - `POST /api/ai/gift-ideas`
- Backend health check `GET /api/health`

## What CANNOT be tested via automation
- Family management, tasks, events, expenses (all gated behind Google OAuth)
- AI Chat drawer, Weekly Summary card, Smart Task suggestion, Gift Ideas modal
  inside the app — they require a logged-in session.
- These features must be tested manually by the user after Google sign-in.

## Backend AI endpoints — example payloads

```bash
BACKEND="$REACT_APP_BACKEND_URL"   # or https://<preview>.preview.emergentagent.com

# 1. suggest-task
curl -X POST "$BACKEND/api/ai/suggest-task" \
  -H "Content-Type: application/json" \
  -d '{"title":"Pagare bolletta luce","lang":"it"}'

# 2. weekly-summary
curl -X POST "$BACKEND/api/ai/weekly-summary" \
  -H "Content-Type: application/json" \
  -d '{"family_name":"Renga","completed_tasks":["Lavare i piatti"],"pending_tasks":["Pagare bolletta"],"upcoming_events":["Cena - 17 mag"],"total_expenses":142.5,"upcoming_birthdays":["Marco - 22 mag"],"lang":"it"}'

# 3. chat (multi-turn)
curl -X POST "$BACKEND/api/ai/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"Cosa devo fare oggi?","user_id":"test_user_1","family_context":{"family_name":"Renga","members":["Marco","Sara"],"today_tasks":["Lavare auto"]},"lang":"it"}'

# 4. gift-ideas
curl -X POST "$BACKEND/api/ai/gift-ideas" \
  -H "Content-Type: application/json" \
  -d '{"member_name":"Nonna Maria","member_role":"nonna","age":72,"interests":"lettura, giardinaggio","budget_min":25,"budget_max":80,"lang":"it"}'
```
