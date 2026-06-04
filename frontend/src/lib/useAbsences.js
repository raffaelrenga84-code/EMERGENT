import { useEffect, useState, useCallback } from 'react';
import { toLocalYMD } from './dateUtils.js';
import { supabase } from './supabase.js';

/**
 * useAbsences — carica le assenze visibili all'utente:
 *  • Tutte le proprie (anche se non condivise)
 *  • Quelle condivise con almeno una famiglia di cui sono membro
 *
 * RLS sul DB si occupa già di filtrare, ma manteniamo la query semplice.
 *
 * Args:
 *   session: Supabase session
 *   refreshKey: incrementa per forzare il refetch
 *
 * Ritorna:
 *   { absences, loading, error, refresh }
 *
 * Utility statiche:
 *   isAbsentOn(absences, userId, isoDate) → bool
 *   findActiveAbsence(absences, userId, isoDate) → assenza o null
 *   memberAbsenceOn(absences, member, isoDate) → assenza o null
 */
export function useAbsences(session, refreshKey = 0) {
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAbsences = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('absences')
      .select('id, user_id, member_name, start_date, end_date, reason, location, note, visible_to_families, created_at')
      .order('start_date', { ascending: true });
    if (error) {
      setError(error.message || 'fetch failed');
      setAbsences([]);
    } else {
      setAbsences(data || []);
    }
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => { fetchAbsences(); }, [fetchAbsences, refreshKey]);

  return { absences, loading, error, refresh: fetchAbsences };
}

/**
 * findActiveAbsence — restituisce l'assenza attiva nella data ISO indicata
 * (default oggi) per il dato user_id, oppure null.
 */
export function findActiveAbsence(absences, userId, isoDate) {
  if (!absences || !userId) return null;
  const today = isoDate || toLocalYMD();
  return absences.find((a) =>
    a.user_id === userId &&
    a.start_date <= today &&
    a.end_date >= today
  ) || null;
}

/**
 * findAbsenceOverlap — restituisce la prima assenza di `userId` che si
 * sovrappone con il range [rangeStart, rangeEnd] (entrambi ISO date string).
 * Utile per "stai assegnando una task a una persona che sarà via".
 */
export function findAbsenceOverlap(absences, userId, rangeStart, rangeEnd) {
  if (!absences || !userId || !rangeStart) return null;
  const start = rangeStart;
  const end = rangeEnd || rangeStart;
  return absences.find((a) =>
    a.user_id === userId &&
    a.start_date <= end &&
    a.end_date >= start
  ) || null;
}

/**
 * memberAbsenceOn — versione per "member" (lookup via member.user_id).
 */
export function memberAbsenceOn(absences, member, isoDate) {
  if (!member?.user_id) return null;
  return findActiveAbsence(absences, member.user_id, isoDate);
}

/**
 * Helper per badge UI: ritorna emoji + label condensata.
 */
export function absenceLabel(absence) {
  if (!absence) return null;
  const REASON_ICON = {
    vacation: '🏖️',
    work: '💼',
    health: '🏥',
    other: '✈️',
  };
  const icon = REASON_ICON[absence.reason] || '✈️';
  const where = absence.location ? ` ${absence.location}` : '';
  return `${icon}${where}`;
}

export function fmtAbsenceRange(absence, lang = 'it') {
  if (!absence) return '';
  const opts = { day: 'numeric', month: 'short' };
  const start = new Date(absence.start_date + 'T00:00:00').toLocaleDateString(lang, opts);
  const end = new Date(absence.end_date + 'T00:00:00').toLocaleDateString(lang, opts);
  return start === end ? start : `${start} → ${end}`;
}
