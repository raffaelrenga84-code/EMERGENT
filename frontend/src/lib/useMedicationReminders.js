// useMedicationReminders — hook che monta i reminder per le medicine
// dei membri assistiti della famiglia.
//
// Funziona così:
//   1. Carica TUTTE le medicine attive dei membri assistiti (con realtime)
//   2. Per ogni medicina, per ogni `time_of_day` di OGGI, calcola
//      l'orario UTC e verifica se è "now" (entro 60s) o "in ritardo"
//      (entro 4h e non c'è ancora un log per oggi)
//   3. Se sì, aggiunge alla coda dei reminder pendenti
//   4. Espone `pendingReminders` + funzioni `markTaken`, `snooze`, `skip`
//
// L'UI (MedicationReminderToast) è separata e legge da questo hook.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase.js';

const POLL_MS = 60_000; // check ogni minuto

function hhmmToTodayDate(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * @param {Array} members - tutti i membri della famiglia (deve includere is_assisted)
 * @returns { pendingReminders, markTaken, snooze, skip, refresh }
 */
export function useMedicationReminders(members = [], meId = null) {
  const [medications, setMedications] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [now, setNow] = useState(() => new Date());

  const assistedMemberIds = members
    .filter((m) => m.is_assisted)
    .map((m) => m.id);

  // Carica medicine + log oggi
  const refresh = useCallback(async () => {
    if (assistedMemberIds.length === 0) {
      setMedications([]);
      setTodayLogs([]);
      return;
    }
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const [{ data: m }, { data: l }] = await Promise.all([
      supabase.from('medications')
        .select('*')
        .in('member_id', assistedMemberIds)
        .eq('active', true),
      supabase.from('medication_logs')
        .select('*')
        .in('member_id', assistedMemberIds)
        .gte('scheduled_at', startOfDay.toISOString())
        .lt('scheduled_at', endOfDay.toISOString()),
    ]);
    setMedications(m || []);
    setTodayLogs(l || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistedMemberIds.join(',')]);

  useEffect(() => { refresh(); }, [refresh]);

  // Polling: aggiorna `now` ogni minuto per riscatenare il calcolo dei pending
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Realtime per logs (qualcun altro ha marcato preso? aggiorna)
  useEffect(() => {
    if (assistedMemberIds.length === 0) return;
    const channel = supabase
      .channel('med-reminders-logs')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'medication_logs',
      }, () => { refresh(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'medications',
      }, () => { refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistedMemberIds.join(',')]);

  // Calcolo pending: per ogni medicina × ogni time_of_day, vedi se:
  //   - L'orario è PASSATO o presente (con 60s di tolleranza)
  //   - NON c'è già un log "taken" o "skipped" per quel <medication_id, time>
  //   - Se c'è un log "snoozed", usa snoozed_until come nuovo target
  //   - Max 4 ore in ritardo (oltre ignoriamo)
  const pendingReminders = [];
  const MAX_LATE_MS = 4 * 60 * 60 * 1000;
  for (const med of medications) {
    for (const time of (med.times_of_day || [])) {
      const scheduledAt = hhmmToTodayDate(time);
      // Check snooze
      const snoozedLog = todayLogs.find((l) =>
        l.medication_id === med.id && l.action === 'snoozed' &&
        new Date(l.scheduled_at).getTime() === scheduledAt.getTime()
      );
      const effectiveAt = snoozedLog?.snoozed_until
        ? new Date(snoozedLog.snoozed_until)
        : scheduledAt;

      // Già completato (taken/skipped) per questa dose?
      const finalized = todayLogs.some((l) =>
        l.medication_id === med.id &&
        (l.action === 'taken' || l.action === 'skipped') &&
        new Date(l.scheduled_at).getTime() === scheduledAt.getTime()
      );
      if (finalized) continue;

      const diff = now.getTime() - effectiveAt.getTime();
      if (diff >= -60_000 && diff <= MAX_LATE_MS) {
        const member = members.find((mm) => mm.id === med.member_id);
        pendingReminders.push({
          key: `${med.id}-${time}`,
          medication: med,
          member,
          scheduledAt,
          effectiveAt,
          minutesLate: Math.floor(diff / 60_000),
        });
      }
    }
  }

  // Azioni
  const markTaken = async (rem) => {
    await supabase.from('medication_logs').insert({
      medication_id: rem.medication.id,
      member_id: rem.medication.member_id,
      scheduled_at: rem.scheduledAt.toISOString(),
      action: 'taken',
      recorded_by: meId || null,
    });
    await refresh();
  };

  const snooze = async (rem, minutes) => {
    const snoozedUntil = new Date(Date.now() + minutes * 60_000);
    await supabase.from('medication_logs').insert({
      medication_id: rem.medication.id,
      member_id: rem.medication.member_id,
      scheduled_at: rem.scheduledAt.toISOString(),
      action: 'snoozed',
      snoozed_until: snoozedUntil.toISOString(),
      recorded_by: meId || null,
    });
    await refresh();
  };

  const skip = async (rem) => {
    await supabase.from('medication_logs').insert({
      medication_id: rem.medication.id,
      member_id: rem.medication.member_id,
      scheduled_at: rem.scheduledAt.toISOString(),
      action: 'skipped',
      recorded_by: meId || null,
    });
    await refresh();
  };

  return { pendingReminders, markTaken, snooze, skip, refresh };
}
