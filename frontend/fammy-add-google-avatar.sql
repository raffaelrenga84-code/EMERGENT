-- =====================================================================
-- Aggiunta di avatar_url per foto profilo da Google
-- =====================================================================

-- Aggiungi campo avatar_url a profiles
ALTER TABLE profiles
ADD COLUMN avatar_url text;

-- Aggiungi campo avatar_url a members
ALTER TABLE members
ADD COLUMN avatar_url text;

-- Commento per chiarezza
COMMENT ON COLUMN profiles.avatar_url IS 'URL della foto profilo da Google People API o provider OAuth';
COMMENT ON COLUMN members.avatar_url IS 'URL della foto profilo da Google People API o provider OAuth';
