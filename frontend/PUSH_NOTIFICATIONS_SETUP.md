# Push Notifications — Setup

Le push notifications "tipo WhatsApp" (app chiusa → notifica al telefono) richiedono setup lato server. Questa guida ti accompagna passo passo.

## Cosa serve
- Account Supabase (già hai)
- Supabase CLI installato (`npm i -g supabase`)
- Una mail come "contact subject" per VAPID (es. la tua)

## 1. Generare le VAPID keys

VAPID = la coppia chiave pubblica/privata che identifica chi manda le push.

Apri PowerShell e installa `web-push` temporaneamente:

```powershell
npx web-push generate-vapid-keys
```

Copia l'output. Sarà tipo:
```
Public Key:  BNxxxxx...
Private Key: yyyyyy...
```

## 2. Applicare la SQL su Supabase

Nel SQL Editor di Supabase incolla il contenuto di `sql/fammy-add-push-subscriptions.sql` ed esegui.

## 3. Configurare Vite env

Crea (o aggiungi a) `.env.local` nella root del progetto:
```
VITE_VAPID_PUBLIC_KEY=BNxxxxx... (la PUBLIC key dal punto 1)
```

E aggiungi la stessa env var anche su **Vercel Dashboard** → progetto fammy → Settings → Environment Variables.

## 4. Deploy della Edge Function

Da PowerShell, nella cartella del progetto:

```powershell
# Login (una volta)
supabase login

# Collegamento al progetto (una volta)
supabase link --project-ref jwzoymvtxjzpymaywjtw

# Imposta i secrets della Edge Function
supabase secrets set VAPID_PUBLIC_KEY=BNxxxxx... VAPID_PRIVATE_KEY=yyyyyy... VAPID_SUBJECT=mailto:raffael.renga84@gmail.com

# Deploy della funzione
supabase functions deploy send-push --no-verify-jwt
```

L'URL della funzione sarà: `https://jwzoymvtxjzpymaywjtw.supabase.co/functions/v1/send-push`

## 5. Configurare i Database Webhooks

Sul Supabase Dashboard:
1. **Database → Webhooks** → "Create a new hook"
2. Nome: `tasks-push`
   - Table: `tasks`
   - Events: ✅ Insert ✅ Update
   - Type: HTTP Request
   - HTTP method: POST
   - URL: `https://jwzoymvtxjzpymaywjtw.supabase.co/functions/v1/send-push`
   - HTTP Headers: aggiungi `Content-Type: application/json`
3. Salva
4. Ripeti per la tabella `events` (nome `events-push`, stessa URL)

## 6. Test

1. Deploy il codice frontend con `git push` (così l'hook `usePushSubscription` registra l'endpoint)
2. Apri FAMMY su un browser (concedi i permessi notifiche)
3. Da Supabase Dashboard → Table Editor → `push_subscriptions` → verifica che ci sia una riga con il tuo `user_id`
4. Crea un nuovo task in un'altra famiglia, o cambia priority='high' su un task esistente
5. Sul tuo dispositivo arriverà la notifica anche se l'app è in background o chiusa

## Note iOS

- iOS 16.4+ supporta Web Push **solo se l'app è installata come PWA** (aggiunta alla schermata Home)
- Dopo il deploy, sul tuo iPhone vai su Safari → fammy-flame.vercel.app → tasto Condividi → "Aggiungi alla schermata Home"
- Apri l'app dalla home screen (non più da Safari) e accetta i permessi notifiche

## Troubleshooting

**"Push subscription failed"** in console:
- Verifica che `VITE_VAPID_PUBLIC_KEY` sia configurata correttamente (su Vercel e in `.env.local`)
- Verifica che l'app sia servita via HTTPS (Vercel lo fa)
- Sul iPhone, l'app deve essere installata come PWA

**Le notifiche non arrivano**:
- Controlla i log della Edge Function: `supabase functions logs send-push`
- Verifica che la riga in `push_subscriptions` non sia stata cancellata (endpoint scaduti vengono puliti)
- Verifica che il database webhook stia chiamando la funzione (Dashboard → Database → Webhooks → vedi "Last triggered")

## Costi

- Web Push API: gratuita
- Supabase Edge Functions: gratis fino a 500K invocazioni/mese sul piano Free
- Vercel: gratis

Per ora costo zero.
