/**
 * memberDedupe — utility per evitare duplicati di membri con stesso user_id.
 *
 * Quando un utente appartiene a più famiglie, esiste una `members` row per
 * ogni famiglia → 4 famiglie = 4 record "Raffael". Per liste tipo
 * "Membri assistiti", "Caregivers", etc. vogliamo una sola entry per persona.
 *
 * Regola:
 *  - I membri con user_id: deduplicati per user_id (mantiene il primo)
 *  - I membri SENZA user_id (placeholder): mantenuti tutti, sono "persone
 *    fisiche" distinte (es. Nonna senza account vive in una sola famiglia).
 */
export function dedupeByUser(members = []) {
  // Sort by id ascending per determinismo: la stessa persona ritorna
  // sempre la stessa "primary row" indipendentemente dall'ordine input.
  // Stesso criterio usato in personScope.getCanonicalMember().
  const sorted = [...members].sort((a, b) =>
    (a?.id || '').localeCompare(b?.id || '')
  );
  const seenUser = new Set();
  const out = [];
  for (const m of sorted) {
    if (!m) continue;
    if (m.user_id) {
      if (seenUser.has(m.user_id)) continue;
      seenUser.add(m.user_id);
    }
    out.push(m);
  }
  return out;
}
