-- =====================================================================
--  FAMMY — Snapshot assegnatari originali per ripristino "Ho un imprevisto"
--  Data: 2026-05-09
-- ---------------------------------------------------------------------
--  Quando un membro clicca "Me ne occupo io (rendilo solo mio)" su un task
--  condiviso con più persone, gli altri assegnatari vengono rimossi.
--  Se poi quello stesso membro clicca "Ho un imprevisto", senza questa
--  colonna la lista originale è persa per sempre.
--
--  delegated_from contiene gli ID dei members assegnati AL MOMENTO del claim,
--  così al "Ho un imprevisto" possiamo ripristinarli.
-- =====================================================================

alter table tasks
  add column if not exists delegated_from uuid[];

comment on column tasks.delegated_from is
  'Snapshot degli ID member assegnatari prima di un claim solo-mio. Usato per ripristinare la lista al "Ho un imprevisto".';
