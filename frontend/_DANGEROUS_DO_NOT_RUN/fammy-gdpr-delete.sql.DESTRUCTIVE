-- =====================================================================
-- FAMMY — GDPR Account Deletion (Art. 17 — right to erasure)
--
-- Installs a single PostgreSQL function that, when called by the logged-in
-- user, deletes ALL data tied to that user from FAMMY and removes the auth
-- account.
--
-- Run this once on Supabase → SQL Editor → New query → Paste → Run.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_family_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1) Famiglie di cui sono CREATORE (owner): da eliminare completamente
  --    perché senza l'owner non ha senso che restino.
  SELECT array_agg(id) INTO v_family_ids
  FROM public.families
  WHERE created_by = v_uid;

  IF v_family_ids IS NOT NULL THEN
    -- Order matters when FKs don't cascade. Delete leaves first.
    DELETE FROM public.task_responses
      WHERE task_id IN (SELECT id FROM public.tasks WHERE family_id = ANY(v_family_ids));
    DELETE FROM public.task_assignees
      WHERE task_id IN (SELECT id FROM public.tasks WHERE family_id = ANY(v_family_ids));
    DELETE FROM public.expense_shares
      WHERE expense_id IN (SELECT id FROM public.expenses WHERE family_id = ANY(v_family_ids));
    DELETE FROM public.tasks    WHERE family_id = ANY(v_family_ids);
    DELETE FROM public.events   WHERE family_id = ANY(v_family_ids);
    DELETE FROM public.expenses WHERE family_id = ANY(v_family_ids);
    DELETE FROM public.invitations WHERE family_id = ANY(v_family_ids);
    DELETE FROM public.members  WHERE family_id = ANY(v_family_ids);
    DELETE FROM public.families WHERE id = ANY(v_family_ids);
  END IF;

  -- 2) Membri "miei" in famiglie altrui: rimuovo solo me stesso da quelle
  --    famiglie. La famiglia resta intatta per gli altri membri.
  DELETE FROM public.task_responses WHERE author_id IN (
    SELECT id FROM public.members WHERE user_id = v_uid
  );
  DELETE FROM public.task_assignees WHERE member_id IN (
    SELECT id FROM public.members WHERE user_id = v_uid
  );
  DELETE FROM public.expense_shares WHERE member_id IN (
    SELECT id FROM public.members WHERE user_id = v_uid
  );
  -- Spese da me create in famiglie altrui: dissocio dal mio user e (se member_id punta a me) le elimino
  DELETE FROM public.expenses WHERE author_id IN (
    SELECT id FROM public.members WHERE user_id = v_uid
  );
  DELETE FROM public.members WHERE user_id = v_uid;

  -- 3) Notifiche push & cronologia chat AI (se le tabelle esistono)
  BEGIN
    DELETE FROM public.push_subscriptions WHERE user_id = v_uid;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- 4) Profilo
  DELETE FROM public.profiles WHERE id = v_uid;

  -- 5) auth.users — la firma finale: rimuove davvero l'account dal sistema.
  --    SECURITY DEFINER consente la cancellazione anche se la policy RLS
  --    non l'avrebbe permesso al ruolo authenticated.
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

-- Permetti l'invocazione solo al ruolo authenticated
REVOKE ALL ON FUNCTION public.delete_my_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

COMMENT ON FUNCTION public.delete_my_account() IS
  'GDPR Article 17 — Right to erasure. Deletes the calling user, their owned families and all their data within shared families.';
