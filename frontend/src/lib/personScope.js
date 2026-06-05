/**
 * personScope — risolve quale `members` row usare per le operazioni
 * Care Hub (medicine, profilo medico, diario, allegati) quando la stessa
 * persona è membro di più famiglie.
 *
 * In FAMMY ogni "persona" può appartenere a più famiglie e per ciascuna
 * esiste una `members` row separata con stesso `user_id`. Senza scope
 * unificato, le medicine di Raffael salvate via "famiglia RENGA" non
 * sarebbero visibili quando guarda dalla famiglia TOPOLINI.
 *
 * Strategia (no DB migration):
 *  - Persone con user_id (utenti reali): tutti i loro member rows
 *    convergono su un "primary member" canonico — la row con `id` più
 *    piccolo (alfabetico). Tutte le scritture e letture Care Hub
 *    avvengono lì.
 *  - Placeholder (member.user_id = null): nessun cambio, ogni placeholder
 *    è una persona fisica distinta (es. Nonna senza account in 1 famiglia).
 */

/**
 * Restituisce il "primary member" canonico per la persona del `member`
 * passato in input.
 *
 * @param {object} member - Il member da cui partire
 * @param {Array} allMembers - L'array completo di members (per cercare i peers)
 * @returns {object} il canonical primary member, o l'input se non trovato
 */
export function getCanonicalMember(member, allMembers = []) {
  if (!member) return member;
  if (!member.user_id) return member; // placeholder: ogni row è una persona
  const peers = (allMembers || []).filter((m) => m.user_id === member.user_id);
  if (peers.length === 0) return member;
  peers.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  return peers[0];
}

/**
 * Restituisce gli id di TUTTI i member rows che rappresentano questa persona.
 * Utile per query READ che vogliono aggregare (es. mostrare medicine
 * indipendentemente da quale famiglia le ha create).
 *
 * @param {object} member
 * @param {Array} allMembers
 * @returns {string[]}
 */
export function getPersonMemberIds(member, allMembers = []) {
  if (!member) return [];
  if (!member.user_id) return [member.id];
  const peers = (allMembers || []).filter((m) => m.user_id === member.user_id);
  if (peers.length === 0) return [member.id];
  return peers.map((m) => m.id);
}
