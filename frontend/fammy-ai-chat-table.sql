-- =====================================================================
-- FAMMY — AI Chat History storage for Edge Functions
--
-- Run this once on Supabase → SQL Editor → New query → Paste → Run.
-- Creates the table the `ai-chat` Edge Function persists chat turns to,
-- plus a tight RLS policy so users can only read their own messages.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          bigserial PRIMARY KEY,
  session_id  text         NOT NULL,
  user_id     text         NOT NULL,
  role        text         NOT NULL CHECK (role IN ('user','assistant','system')),
  content     text         NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON public.chat_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user    ON public.chat_messages (user_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Authenticated users can SELECT only rows they own.
DROP POLICY IF EXISTS chat_messages_select_own ON public.chat_messages;
CREATE POLICY chat_messages_select_own ON public.chat_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

-- INSERT/UPDATE/DELETE are reserved for the service role (Edge Function).
DROP POLICY IF EXISTS chat_messages_block_writes ON public.chat_messages;
CREATE POLICY chat_messages_block_writes ON public.chat_messages
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

COMMENT ON TABLE public.chat_messages IS 'Multi-turn chat history written by the ai-chat Edge Function.';
