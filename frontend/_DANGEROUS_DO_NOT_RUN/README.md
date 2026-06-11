# ⚠️ DANGEROUS — DO NOT EXECUTE THESE FILES ⚠️

## What's in here

- **fammy-schema.sql.DESTRUCTIVE** — Pristine schema with `drop table ... cascade` at the top.
  Designed for FIRST-EVER initialization of an empty database. If executed on a populated
  DB, IT WIPES ALL TABLES AND DATA. Caused total data loss in production on 2026-06-11.
  
- **fammy-gdpr-delete.sql.DESTRUCTIVE** — Installs `delete_my_account()` RPC function
  that deletes ALL families owned by the calling user + cascade. Used by the "Delete account"
  button in Profile → Privacy. Keep here for reference. Already installed in production.

- **fammy-attachments-hotfix.sql.OLD_BUGGY** — Old version with 3 SQL bugs (owner_user_id,
  ambiguous name, missing priority). Superseded by fammy-attachments-hotfix-fixed.sql.

## Rules

1. NEVER paste any file from this folder into Supabase SQL Editor blindly.
2. If you need to re-initialize the DB from scratch (only for new environments),
   read the file line by line first.
3. If unsure, ASK before running.
