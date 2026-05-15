-- =====================================================================
-- Aggiunta di birth_date per gestire i compleanni
-- =====================================================================

-- Aggiungi campo birth_date a members
ALTER TABLE members
ADD COLUMN birth_date date;

-- Commento per chiarezza
COMMENT ON COLUMN members.birth_date IS 'Data di nascita del membro per calcolare i compleanni';

-- Crea un indice per cercare velocemente i compleanni di oggi/domani
CREATE INDEX IF NOT EXISTS idx_members_birth_date ON members(birth_date);
