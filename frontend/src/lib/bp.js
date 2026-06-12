// bp.js — helper per le misurazioni di pressione multiple del diario.
// daily_diary.bp_readings (jsonb): [{ t: 'HH:MM'|null, sys, dia }, ...]
// Fallback legacy: colonne singole bp_systolic / bp_diastolic.

export function getBpReadings(row) {
  if (Array.isArray(row?.bp_readings)) {
    return row.bp_readings
      .filter((r) => r && r.sys != null && r.dia != null)
      .sort((a, b) => (a.t || '').localeCompare(b.t || ''));
  }
  if (row?.bp_systolic != null && row?.bp_diastolic != null) {
    return [{ t: null, sys: row.bp_systolic, dia: row.bp_diastolic }];
  }
  return [];
}

// Media giornaliera (arrotondata) — usata da grafici/trend.
export function bpDailyAvg(row) {
  const rs = getBpReadings(row);
  if (rs.length === 0) return null;
  const avg = (k) => Math.round(rs.reduce((s, r) => s + Number(r[k]), 0) / rs.length);
  return { sys: avg('sys'), dia: avg('dia') };
}

// "08:15 120/80 · 20:30 135/82" — usata da storico e report.
export function formatBpReadings(row) {
  const rs = getBpReadings(row);
  if (rs.length === 0) return null;
  return rs.map((r) => `${r.t ? `${r.t} ` : ''}${r.sys}/${r.dia}`).join(' · ');
}
