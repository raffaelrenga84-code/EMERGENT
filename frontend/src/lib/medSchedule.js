// medSchedule — logica condivisa per il calendario di assunzione medicine.
//
// Una medicina ha:
//   - times_of_day: orari base ['08:00', '20:00']
//   - start_date / end_date: periodo di assunzione (null = sempre)
//   - schedule_phases: cambi di frequenza [{from:'YYYY-MM-DD', times:[...]}]
//     → l'ultima fase con from <= oggi vince sugli orari base.

// Orari attivi in una certa data (YYYY-MM-DD).
export function activeTimesForToday(med, todayYMD) {
  const phases = Array.isArray(med?.schedule_phases)
    ? med.schedule_phases.filter((p) => p && p.from)
    : [];
  if (phases.length > 0) {
    const sorted = [...phases].sort((a, b) => String(a.from).localeCompare(String(b.from)));
    let act = null;
    for (const p of sorted) if (String(p.from) <= todayYMD) act = p;
    if (act) return act.times || [];
  }
  return med?.times_of_day || [];
}

// La medicina è nel suo periodo di assunzione in quella data?
export function isMedActiveOn(med, todayYMD) {
  if (med?.start_date && String(med.start_date) > todayYMD) return false;
  if (med?.end_date && String(med.end_date) < todayYMD) return false;
  return true;
}

// La medicina VA PRESA in quella data, tenendo conto dell'intervallo
// giorni (interval_days: 1 = ogni giorno, 2 = a giorni alterni, N = ogni
// N giorni)? Il conteggio parte da start_date ("Dal"): quel giorno si
// prende, poi ogni N. Senza start_date non possiamo contare → fail-open
// (si considera dovuta ogni giorno, meglio un promemoria in più che uno
// in meno).
export function isMedDueOn(med, todayYMD) {
  if (!isMedActiveOn(med, todayYMD)) return false;

  // Giorni della settimana specifici (0=Dom … 6=Sab)
  const dows = med?.days_of_week;
  if (Array.isArray(dows) && dows.length > 0) {
    const dow = new Date(todayYMD + 'T12:00:00').getDay();
    if (!dows.includes(dow)) return false;
  }

  // Ciclo N giorni sì / M pausa, ancorato a start_date (es. pillola 21/7)
  const cOn = Number(med?.cycle_on_days) || 0;
  const cOff = Number(med?.cycle_off_days) || 0;
  if (cOn > 0 && cOff > 0) {
    const anchorC = med?.start_date ? String(med.start_date) : null;
    if (anchorC) {
      const diffC = Math.round((Date.parse(todayYMD) - Date.parse(anchorC)) / 86400000);
      if (diffC < 0) return false;
      if ((diffC % (cOn + cOff)) >= cOn) return false;
    }
  }

  // Intervallo giorni (1 = ogni giorno, 2 = alterni, N = ogni N)
  const interval = Number(med?.interval_days) || 1;
  if (interval <= 1) return true;
  const anchor = med?.start_date ? String(med.start_date) : null;
  if (!anchor) return true;
  const diff = Math.round((Date.parse(todayYMD) - Date.parse(anchor)) / 86400000);
  return diff >= 0 && diff % interval === 0;
}
