-- =====================================================================
--  FAMMY — "Lo fai tu?" delega come INVITO (non imposizione)
--  Data: 2026-05-09
-- ---------------------------------------------------------------------
--  Quando un membro clicca "Lo fai tu? — delega a X" su un task di cui è
--  unico responsabile, il task DEVE:
--   1. tornare in bacheca a tutti gli assegnatari originali (delegated_from)
--   2. comparire in "Solo mie" per X (il delegato), con priority='medium'
--      (arancione = attenzione)
--   3. X può accettare ("Me ne occupo io") o rifiutare ("No, non posso")
--
--  Per supportarlo serve una colonna che indichi CHI è il delegato.
-- =====================================================================

alter table tasks
  add column if not exists delegated_to uuid references members(id) on delete set null;

comment on column tasks.delegated_to is
  'Membro a cui un altro responsabile ha chiesto "Lo fai tu?". Vede il task in Solo mie con priority medium fino ad accettare/rifiutare.';

create index if not exists idx_tasks_delegated_to on tasks(delegated_to);
