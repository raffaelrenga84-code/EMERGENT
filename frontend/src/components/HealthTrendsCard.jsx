import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { toLocalYMD } from '../lib/dateUtils.js';

/**
 * HealthTrendsCard — mini-grafici SVG dell'andamento ultimi 30 giorni
 * (pressione sistolica/diastolica + peso) dal diario del membro assistito.
 * Mostrato in cima al tab "🩺 Profilo" del Care Hub.
 */
export default function HealthTrendsCard({ member }) {
  const { t } = useT();
  const [rows, setRows] = useState(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from('daily_diary')
        .select('diary_date, bp_systolic, bp_diastolic, weight_kg')
        .eq('member_id', member.id)
        .gte('diary_date', toLocalYMD(since))
        .order('diary_date', { ascending: true });
      if (!cancelled) setRows(data || []);
    })();
    return () => { cancelled = true; };
  }, [member.id]);

  if (rows === null) return null;

  const bp = rows.filter((r) => r.bp_systolic != null && r.bp_diastolic != null);
  const wt = rows.filter((r) => r.weight_kg != null);
  if (bp.length < 2 && wt.length < 2) return null; // niente da graficare

  return (
    <div style={{
      padding: 14, borderRadius: 14, marginBottom: 14,
      background: 'var(--ab)', border: '1px solid var(--sm)',
    }} data-testid="health-trends-card">
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--k)', marginBottom: 10 }}>
        📈 {t('ht_title') || 'Andamento ultimi 30 giorni'}
      </div>
      {bp.length >= 2 && (
        <MiniChart
          title={`🩺 ${t('ht_bp') || 'Pressione (mmHg)'}`}
          series={[
            { color: '#C1624B', label: 'SYS', pts: bp.map((r) => ({ x: r.diary_date, v: r.bp_systolic })) },
            { color: '#4A7B9D', label: 'DIA', pts: bp.map((r) => ({ x: r.diary_date, v: r.bp_diastolic })) },
          ]}
        />
      )}
      {wt.length >= 2 && (
        <MiniChart
          title={`⚖️ ${t('ht_weight') || 'Peso (kg)'}`}
          series={[
            { color: '#5B8C5A', label: 'kg', pts: wt.map((r) => ({ x: r.diary_date, v: r.weight_kg })) },
          ]}
        />
      )}
    </div>
  );
}

function MiniChart({ title, series }) {
  const VW = 320, VH = 110;
  const all = series.flatMap((s) => s.pts.map((p) => p.v));
  let min = Math.min(...all), max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15;
  min -= pad; max += pad;

  const dates = [...new Set(series.flatMap((s) => s.pts.map((p) => p.x)))].sort();
  const ix = new Map(dates.map((d, i) => [d, i]));
  const n = Math.max(dates.length - 1, 1);
  const px = (d) => 8 + (ix.get(d) / n) * (VW - 16);
  const py = (v) => VH - 18 - ((v - min) / (max - min)) * (VH - 36);

  const fmtShort = (ymd) => new Date(ymd + 'T12:00:00')
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 11.5, fontWeight: 700, color: 'var(--km)', marginBottom: 2,
      }}>
        <span>{title}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          {series.map((s) => {
            const last = [...s.pts].sort((a, b) => a.x.localeCompare(b.x)).slice(-1)[0];
            return (
              <span key={s.label} style={{ color: s.color, fontWeight: 800 }}>
                {s.label} {last?.v}
              </span>
            );
          })}
        </span>
      </div>
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{
        width: '100%', height: 'auto', display: 'block',
        background: 'white', borderRadius: 10, border: '1px solid var(--sm)',
      }}>
        {series.map((s) => {
          const pts = [...s.pts].sort((a, b) => a.x.localeCompare(b.x));
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ');
          return (
            <g key={s.label}>
              <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
              {pts.map((p) => (
                <circle key={p.x} cx={px(p.x)} cy={py(p.v)} r="2.6" fill={s.color} />
              ))}
            </g>
          );
        })}
        <text x="8" y={VH - 4} fontSize="9" fill="#A3A79E">{fmtShort(dates[0])}</text>
        <text x={VW - 8} y={VH - 4} fontSize="9" fill="#A3A79E" textAnchor="end">{fmtShort(dates[dates.length - 1])}</text>
      </svg>
    </div>
  );
}
