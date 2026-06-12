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
